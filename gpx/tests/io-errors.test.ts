import { describe, expect, it } from 'vitest';
import { parseGPX, GPXParseError } from '../src/io';

/**
 * Locks the parse-boundary contract added in the robustness pass: parseGPX must
 * reject unusable input with a typed GPXParseError (rather than fabricating an
 * empty file or throwing a raw parser error), and must drop coordinate-less
 * points and normalize invalid <time> so malformed input cannot poison
 * downstream statistics/persistence.
 */

const wrap = (inner: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${inner}</gpx>`;

describe('parseGPX error contract', () => {
    it('throws GPXParseError on empty input', () => {
        expect(() => parseGPX('')).toThrow(GPXParseError);
    });

    it('throws GPXParseError on non-XML text', () => {
        expect(() => parseGPX('this is not gpx at all')).toThrow(GPXParseError);
    });

    it('throws GPXParseError on non-GPX XML (no <gpx> root)', () => {
        expect(() => parseGPX('<html><body>nope</body></html>')).toThrow(GPXParseError);
    });

    it('throws GPXParseError on an empty <gpx> document with no content', () => {
        expect(() => parseGPX(wrap(''))).toThrow(GPXParseError);
    });

    it('throws GPXParseError when every point has invalid coordinates', () => {
        const gpx = wrap('<trk><trkseg><trkpt lat="abc" lon="xyz"/></trkseg></trk>');
        expect(() => parseGPX(gpx)).toThrow(GPXParseError);
    });
});

describe('parseGPX coordinate and time sanitization', () => {
    it('parses a valid file and keeps its points', () => {
        const gpx = wrap(
            '<trk><trkseg><trkpt lat="45.0" lon="7.0"><ele>100</ele></trkpt><trkpt lat="45.1" lon="7.1"/></trkseg></trk>'
        );
        const file = parseGPX(gpx);
        expect(file.trk[0].trkseg[0].trkpt.length).toBe(2);
        expect(file.trk[0].trkseg[0].trkpt[0].attributes.lat).toBe(45.0);
    });

    it('drops points missing lat/lon but keeps the valid ones', () => {
        const gpx = wrap(
            '<trk><trkseg><trkpt lat="45.0" lon="7.0"/><trkpt/><trkpt lat="45.2" lon="7.2"/></trkseg></trk>'
        );
        const file = parseGPX(gpx);
        expect(file.trk[0].trkseg[0].trkpt.length).toBe(2);
        for (const point of file.trk[0].trkseg[0].trkpt) {
            expect(Number.isFinite(point.attributes.lat)).toBe(true);
            expect(Number.isFinite(point.attributes.lon)).toBe(true);
        }
    });

    it('normalizes an unparseable <time> to undefined (not Invalid Date)', () => {
        const gpx = wrap(
            '<trk><trkseg><trkpt lat="45" lon="7"><time>not-a-date</time></trkpt></trkseg></trk>'
        );
        const file = parseGPX(gpx);
        expect(file.trk[0].trkseg[0].trkpt[0].time).toBeUndefined();
    });

    it('keeps a valid <time> as a Date', () => {
        const gpx = wrap(
            '<trk><trkseg><trkpt lat="45" lon="7"><time>2024-01-01T10:00:00Z</time></trkpt></trkseg></trk>'
        );
        const file = parseGPX(gpx);
        const time = file.trk[0].trkseg[0].trkpt[0].time;
        expect(time).toBeInstanceOf(Date);
        expect(time?.toISOString()).toBe('2024-01-01T10:00:00.000Z');
    });

    it('accepts a waypoint-only file (no tracks)', () => {
        const gpx = wrap('<wpt lat="45" lon="7"><name>Summit</name></wpt>');
        const file = parseGPX(gpx);
        expect(file.wpt.length).toBe(1);
        expect(file.wpt[0].name).toBe('Summit');
    });
});
