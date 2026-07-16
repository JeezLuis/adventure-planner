import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GPXFile, Track, TrackSegment, TrackPoint, buildGPX, parseGPX } from 'gpx';

// The maritime-routing library is dynamically imported inside getFerryRoute; a
// hoisted mock lets each test choose whether it returns a route or throws.
const { seaRouteMock } = vi.hoisted(() => ({ seaRouteMock: vi.fn() }));
vi.mock('searoute-ts', () => ({ seaRoute: seaRouteMock, default: seaRouteMock }));

import {
    getFerryRoute,
    searchPorts,
    shortPlaceName,
    ferryDepartureShiftMs,
    FERRY_TRACK_TYPE,
    FERRY_COLOR,
} from '$lib/logic/ferry';

const BARCELONA = { lat: 41.38, lon: 2.17 };
const NADOR = { lat: 35.17, lon: -2.93 };

beforeEach(() => {
    seaRouteMock.mockReset();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('getFerryRoute', () => {
    it('converts a searoute LineString to sea-level track points ([lon,lat] -> {lat,lon})', async () => {
        seaRouteMock.mockReturnValue({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [2.17, 41.38],
                    [1.0, 40.0],
                    [-2.93, 35.17],
                ],
            },
            properties: {},
        });

        const { points, approximate } = await getFerryRoute(BARCELONA, NADOR);

        expect(approximate).toBe(false);
        expect(points).toHaveLength(3);
        expect(points[0].getLatitude()).toBe(41.38);
        expect(points[0].getLongitude()).toBe(2.17);
        expect(points[2].getLatitude()).toBe(35.17);
        expect(points[2].getLongitude()).toBe(-2.93);
        expect(points.every((p) => p.ele === 0)).toBe(true);
    });

    it('falls back to a great-circle arc when the library throws (SnapFailed/NoRoute)', async () => {
        seaRouteMock.mockImplementation(() => {
            throw new Error('SnapFailedError');
        });

        const { points, approximate } = await getFerryRoute(BARCELONA, NADOR);

        expect(approximate).toBe(true);
        expect(points.length).toBeGreaterThanOrEqual(2);
        // The arc starts and ends exactly at the two ports.
        expect(points[0].getLatitude()).toBeCloseTo(BARCELONA.lat, 5);
        expect(points[0].getLongitude()).toBeCloseTo(BARCELONA.lon, 5);
        expect(points.at(-1)!.getLatitude()).toBeCloseTo(NADOR.lat, 5);
        expect(points.at(-1)!.getLongitude()).toBeCloseTo(NADOR.lon, 5);
        expect(points.every((p) => p.ele === 0)).toBe(true);
        // All longitudes stay within valid WGS84 bounds (valid GPX).
        expect(points.every((p) => p.getLongitude() >= -180 && p.getLongitude() <= 180)).toBe(true);
    });

    it('falls back when the library returns an empty/degenerate geometry', async () => {
        seaRouteMock.mockReturnValue({ geometry: { coordinates: [] } });
        const { approximate } = await getFerryRoute(BARCELONA, NADOR);
        expect(approximate).toBe(true);
    });
});

describe('shortPlaceName', () => {
    it('keeps the most specific first part of a Nominatim display name', () => {
        expect(shortPlaceName('Barcelona, Barcelonès, Catalonia, Spain')).toBe('Barcelona');
        expect(shortPlaceName('Nador')).toBe('Nador');
    });
});

describe('searchPorts', () => {
    it('parses Nominatim results and drops entries without a name or valid coordinates', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                json: async () => [
                    { display_name: 'Barcelona, Spain', lat: '41.38', lon: '2.17' },
                    { display_name: '', lat: '1', lon: '1' },
                    { display_name: 'Bad coords', lat: 'x', lon: 'y' },
                ],
            }))
        );

        const ports = await searchPorts('Barcelona', 'en');

        expect(ports).toEqual([
            { name: 'Barcelona, Spain', coordinates: { lat: 41.38, lon: 2.17 } },
        ]);
    });

    it('returns [] for an empty query without hitting the network', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        expect(await searchPorts('   ', 'en')).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns [] when the request fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('network down');
            })
        );
        expect(await searchPorts('Nador', 'en')).toEqual([]);
    });
});

describe('ferry GPX round-trip (standard compliance)', () => {
    it('serializes a ferry as a standard typed, timed, styled track and reads it back', () => {
        const departure = new Date('2026-07-01T08:00:00.000Z');
        const arrival = new Date('2026-07-01T18:00:00.000Z');
        const file = new GPXFile();
        const segment = new TrackSegment({
            trkpt: [
                new TrackPoint({ attributes: BARCELONA, ele: 0, time: departure }),
                new TrackPoint({ attributes: NADOR, ele: 0, time: arrival }),
            ],
        });
        const track = new Track({ type: FERRY_TRACK_TYPE, trkseg: [segment] });
        file.replaceTracks(0, file.trk.length - 1, [track]);
        file.setStyle({ 'gpx_style:color': FERRY_COLOR });

        const xml = buildGPX(file, []);
        // The ferry marker is a standard GPX <trk><type> element.
        expect(xml).toContain('<type>ferry</type>');

        const parsed = parseGPX(xml);
        expect(parsed.trk[0].type).toBe(FERRY_TRACK_TYPE);
        expect(parsed.trk[0].trkseg[0].trkpt[0].time?.toISOString()).toBe(departure.toISOString());
        expect(parsed.trk[0].trkseg[0].trkpt[1].time?.toISOString()).toBe(arrival.toISOString());
        expect(parsed.trk[0].getStyle()?.['gpx_style:color']?.toLowerCase()).toBe(FERRY_COLOR);
    });
});

describe('ferryDepartureShiftMs', () => {
    it('shifts the departure to the trip day it occupies, keeping the time of day', () => {
        const first = new Date(2026, 6, 1, 8, 30); // local Jul 1, 08:30
        const shift = ferryDepartureShiftMs(first, '2026-07-01', 2); // start + 2 days -> Jul 3
        const shifted = new Date(first.getTime() + shift);
        expect(shifted.getFullYear()).toBe(2026);
        expect(shifted.getMonth()).toBe(6); // July
        expect(shifted.getDate()).toBe(3);
        expect(shifted.getHours()).toBe(8);
        expect(shifted.getMinutes()).toBe(30);
    });

    it('is a no-op when the ferry is already on the right day', () => {
        const first = new Date(2026, 6, 5, 8, 0); // local Jul 5
        expect(ferryDepartureShiftMs(first, '2026-07-01', 4)).toBe(0); // start + 4 -> Jul 5
    });

    it('returns 0 for a missing timestamp or an invalid start date', () => {
        expect(ferryDepartureShiftMs(undefined, '2026-07-01', 0)).toBe(0);
        expect(ferryDepartureShiftMs(new Date(2026, 6, 1), '', 0)).toBe(0);
    });
});
