import { describe, expect, it } from 'vitest';
import { parseGPX } from '../src/io';

/**
 * Covers a slice of the GPX mutation API - the write path behind the editing
 * tools and undo/redo - which previously had no direct tests.
 */

function trackWith(points: string): ReturnType<typeof parseGPX> {
    return parseGPX(
        `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${points}</trkseg></trk></gpx>`
    );
}

const lons = (file: ReturnType<typeof parseGPX>) =>
    file.trk[0].trkseg[0].trkpt.map((p) => p.attributes.lon);

describe('GPXFile.reverse', () => {
    it('reverses coordinate order and preserves the point count', () => {
        const file = trackWith(
            '<trkpt lat="0" lon="0"/><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/>'
        );
        file.reverse();
        expect(lons(file)).toEqual([2, 1, 0]);
        expect(file.trk[0].trkseg[0].trkpt.length).toBe(3);
    });

    it('leaves timestamps undefined when the segment has none', () => {
        const file = trackWith('<trkpt lat="0" lon="0"/><trkpt lat="1" lon="1"/>');
        file.reverse();
        for (const point of file.trk[0].trkseg[0].trkpt) {
            expect(point.time).toBeUndefined();
        }
    });
});

describe('GPXFile.crop', () => {
    it('keeps exactly end-start+1 points', () => {
        const file = trackWith(
            '<trkpt lat="0" lon="0"/><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/><trkpt lat="3" lon="3"/>'
        );
        file.crop(1, 2);
        expect(lons(file)).toEqual([1, 2]);
    });

    it('is a no-op-shaped identity when cropping the full range', () => {
        const file = trackWith(
            '<trkpt lat="0" lon="0"/><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/>'
        );
        file.crop(0, 2);
        expect(lons(file)).toEqual([0, 1, 2]);
    });
});
