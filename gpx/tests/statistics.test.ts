import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGPX } from '../src/io';

const testDataDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-data');

/**
 * Asserts that `actual` deviates from `expected` by at most `tolerance`
 * (a fraction, e.g. 0.02 for +/-2%). Reads better in the assertions below
 * than the raw arithmetic.
 */
function expectWithinRelativeTolerance(actual: number, expected: number, tolerance: number) {
    expect(actual).toBeGreaterThanOrEqual(expected * (1 - tolerance));
    expect(actual).toBeLessThanOrEqual(expected * (1 + tolerance));
}

describe('GPXFile.getStatistics() on the hand-computable climb fixture', () => {
    // test-data/climb.gpx: 10 points due north along the meridian lon = 7.0,
    // latitude increasing by exactly 0.009 degrees per step, elevation
    // rising linearly from 500 m to 590 m, timestamps 60 s apart.
    const climb = parseGPX(readFileSync(join(testDataDirectory, 'climb.gpx'), 'utf-8'));
    const statistics = climb.getStatistics().global;

    it('computes the total distance from the haversine formula', () => {
        // Hand computation: with a constant longitude, the haversine
        // formula collapses to  d = R * delta_phi  (arc length along a
        // great circle through the poles):
        //   a = sin^2(dLat/2) + cos(lat1) * cos(lat2) * sin^2(0) = sin^2(dLat/2)
        //   d = 2 * R * asin(sin(dLat/2)) = R * dLat
        // Per 0.009 degree leg, using the library's earth radius R = 6371008.8 m:
        //   d = 6371008.8 * 0.009 * pi / 180 = 1000.7557 m
        // Nine legs: 9 * 1000.7557 m = 9006.80 m = 9.0068 km.
        const expectedDistanceKm = 9.0068;

        // distance.total is reported in kilometers.
        expectWithinRelativeTolerance(statistics.distance.total, expectedDistanceKm, 0.02);
    });

    it('computes the elevation gain of the 90 m climb', () => {
        // Elevation rises monotonically 500 -> 590 m, perfectly linear in
        // distance, so even after the library's elevation smoothing the
        // total gain must be 590 - 500 = 90 m, with zero loss.
        expectWithinRelativeTolerance(statistics.elevation.gain, 90, 0.02);
        expect(statistics.elevation.loss).toBeCloseTo(0, 6);
    });

    it('reports one entry per track point', () => {
        expect(statistics.length).toBe(10);
    });

    it('computes the total time from the first and last timestamps', () => {
        // Timestamps run from 08:00:00 to 08:09:00 in 60 s steps: 540 s.
        // At ~60 km/h every leg counts as moving, so moving time == total.
        expect(statistics.time.total).toBe(540);
        expect(statistics.time.moving).toBe(540);
        expect(statistics.time.start).toEqual(new Date('2024-06-01T08:00:00Z'));
        expect(statistics.time.end).toEqual(new Date('2024-06-01T08:09:00Z'));
    });

    it('computes the bounding box of the track', () => {
        expect(statistics.bounds.southWest).toEqual({ lat: 46.0, lon: 7.0 });
        expect(statistics.bounds.northEast).toEqual({ lat: 46.081, lon: 7.0 });
    });
});

describe('GPXFile.getStatistics() aggregation across extensions', () => {
    it('averages the heart rate of with_hr.gpx', () => {
        // The fixture has 80 track points with a <gpxtpx:hr> value:
        // 79 points at 150 bpm and one at 160 bpm, so the average is
        // (79 * 150 + 160) / 80 = 12010 / 80 = 150.125 bpm.
        const withHr = parseGPX(readFileSync(join(testDataDirectory, 'with_hr.gpx'), 'utf-8'));
        const statistics = withHr.getStatistics().global;

        expect(statistics.hr.count).toBe(80);
        expect(statistics.hr.avg).toBeCloseTo(150.125, 9);
    });
});
