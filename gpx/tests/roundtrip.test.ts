import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GPXFile } from '../src/gpx';
import { buildGPX, parseGPX } from '../src/io';

const testDataDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-data');

/**
 * Reads a GPX fixture from gpx/test-data/ and returns its raw XML.
 */
function readFixture(name: string): string {
    return readFileSync(join(testDataDirectory, `${name}.gpx`), 'utf-8');
}

/**
 * Projects a parsed GPXFile onto the data that a round trip through
 * parseGPX -> buildGPX -> parseGPX must preserve: metadata name, waypoints,
 * and for every track its name/type and every point's coordinates,
 * elevation, timestamp and extensions.
 *
 * Root-level `<gpx>` attributes are deliberately left out: buildGPX rewrites
 * them (creator fallback, xmlns declarations, schemaLocation), so they are
 * not expected to survive byte-for-byte.
 */
function comparableProjection(file: GPXFile) {
    return {
        name: file.metadata.name,
        waypoints: file.wpt.map((waypoint) => ({
            lat: waypoint.attributes.lat,
            lon: waypoint.attributes.lon,
            ele: waypoint.ele,
            time: waypoint.time?.toISOString(),
            name: waypoint.name,
            cmt: waypoint.cmt,
            desc: waypoint.desc,
            sym: waypoint.sym,
            type: waypoint.type,
        })),
        tracks: file.trk.map((track) => ({
            name: track.name,
            type: track.type,
            segments: track.trkseg.map((segment) =>
                segment.trkpt.map((point) => ({
                    lat: point.attributes.lat,
                    lon: point.attributes.lon,
                    ele: point.ele,
                    time: point.time?.toISOString(),
                    extensions: point.extensions,
                }))
            ),
        })),
    };
}

/**
 * Fixtures covering the round-trip-sensitive features of the library:
 * - climb: hand-authored 10-point track with elevation and timestamps
 * - simple: single track, elevation only
 * - with_time: track points carrying timestamps
 * - with_waypoint: top-level <wpt> element with name/desc/sym
 * - with_tracks: multiple <trk> elements in one file
 * - with_tracks_and_segments: multiple <trk>, each with multiple <trkseg>
 * - with_hr: Garmin gpxtpx:hr heart-rate extension on every point
 * - with_surface: nested gpxtpx:Extensions/surface extension on every point
 * - with_cad / with_power_1 / with_power_2 / with_temp: cadence, power and
 *   temperature extensions
 * - with_style: gpx_style line color/opacity/width track styling
 * - with_segments: a single track split across multiple segments
 */
const fixtureNames = [
    'climb',
    'simple',
    'with_time',
    'with_waypoint',
    'with_tracks',
    'with_tracks_and_segments',
    'with_hr',
    'with_surface',
    'with_cad',
    'with_power_1',
    'with_power_2',
    'with_temp',
    'with_style',
    'with_segments',
];

describe('parseGPX -> buildGPX -> parseGPX round trip', () => {
    for (const name of fixtureNames) {
        it(`preserves all track, waypoint and extension data of ${name}.gpx`, () => {
            const firstParse = parseGPX(readFixture(name));
            const rebuiltXml = buildGPX(firstParse, []);
            const secondParse = parseGPX(rebuiltXml);

            expect(comparableProjection(secondParse)).toEqual(comparableProjection(firstParse));
        });

        it(`serializes ${name}.gpx deterministically once normalized`, () => {
            // The very first rebuild is not yet canonical: parseGPX strips
            // namespace prefixes, so the fixture's xsi:schemaLocation comes
            // back as a bare `schemaLocation` attribute that buildGPX emits
            // alongside the xsi:schemaLocation it always rewrites. From the
            // second rebuild on, both attributes carry the rewritten value
            // and the XML output must be byte-for-byte stable.
            const firstBuild = buildGPX(parseGPX(readFixture(name)), []);
            const secondBuild = buildGPX(parseGPX(firstBuild), []);
            const thirdBuild = buildGPX(parseGPX(secondBuild), []);

            expect(thirdBuild).toBe(secondBuild);
        });
    }

    it('keeps concrete values intact for the hand-authored climb fixture', () => {
        // Spot-check absolute values (not just first parse == second parse)
        // so a bug that corrupts data identically in both parses cannot slip
        // through the projection comparison above.
        const reparsed = parseGPX(buildGPX(parseGPX(readFixture('climb')), []));

        expect(reparsed.trk).toHaveLength(1);
        const points = reparsed.trk[0].trkseg[0].trkpt;
        expect(points).toHaveLength(10);
        expect(points[0].attributes).toEqual({ lat: 46.0, lon: 7.0 });
        expect(points[0].ele).toBe(500.0);
        expect(points[0].time).toEqual(new Date('2024-06-01T08:00:00Z'));
        expect(points[9].attributes).toEqual({ lat: 46.081, lon: 7.0 });
        expect(points[9].ele).toBe(590.0);
        expect(points[9].time).toEqual(new Date('2024-06-01T08:09:00Z'));
    });

    it('preserves heart-rate extension values of with_hr.gpx', () => {
        const reparsed = parseGPX(buildGPX(parseGPX(readFixture('with_hr')), []));

        const firstPoint = reparsed.trk[0].trkseg[0].trkpt[0];
        expect(firstPoint.getHeartRate()).toBe(150);
    });

    it('preserves the surface extension values of with_surface.gpx', () => {
        const reparsed = parseGPX(buildGPX(parseGPX(readFixture('with_surface')), []));

        const firstPoint = reparsed.trk[0].trkseg[0].trkpt[0];
        expect(firstPoint.getExtensions()).toEqual({ surface: 'asphalt' });
    });

    it('preserves the waypoint of with_waypoint.gpx', () => {
        const reparsed = parseGPX(buildGPX(parseGPX(readFixture('with_waypoint')), []));

        expect(reparsed.wpt).toHaveLength(1);
        const waypoint = reparsed.wpt[0];
        expect(waypoint.name).toBe('Waypoint');
        expect(waypoint.desc).toBe('Description');
        expect(waypoint.sym).toBe('Bike Trail');
        expect(waypoint.attributes.lat).toBeCloseTo(50.7836710064975, 10);
        expect(waypoint.attributes.lon).toBeCloseTo(4.410764082658738, 10);
    });

    it('preserves both track names of with_tracks.gpx', () => {
        const reparsed = parseGPX(buildGPX(parseGPX(readFixture('with_tracks')), []));

        expect(reparsed.trk.map((track) => track.name)).toEqual(['track 1', 'track 2']);
    });
});
