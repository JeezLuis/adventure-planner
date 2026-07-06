/**
 * Ferry legs: turns two ports into a track that follows realistic shipping
 * lanes across open water, which BRouter (roads and rivers only) cannot do.
 *
 * The sea path comes from the `searoute-ts` library, which snaps the endpoints
 * to a bundled Eurostat maritime network and returns a GeoJSON LineString. That
 * network is ~1 MB, so the library is loaded through a dynamic `import()`: it
 * lands in its own lazy chunk, stays out of the main bundle, and is never
 * evaluated during SSR (the only caller is a browser click handler). When the
 * library cannot route the two points - landlocked, isolated, or unavailable -
 * a great-circle arc is drawn instead so a ferry leg always renders.
 *
 * Ports are looked up by name through the same free Nominatim geocoder the map
 * search uses (see `map.ts`): no API key, worldwide coverage.
 */
import type { Coordinates } from 'gpx';
import { TrackPoint } from 'gpx';

/** A geocoded place usable as a ferry endpoint. */
export type FerryPort = {
    /** Human-readable place name (Nominatim `display_name`). */
    name: string;
    coordinates: Coordinates;
};

/** The result of {@link getFerryRoute}: the points, and whether they are a fallback arc. */
export type FerryRouteResult = {
    points: TrackPoint[];
    /** True when the sea-routing library failed and a straight great-circle arc was drawn. */
    approximate: boolean;
};

/**
 * The GPX `<trk><type>` value that marks a track as a ferry crossing. This is
 * the single source of truth for "this is a ferry": it is a standard GPX field,
 * so it round-trips through export/import and other editors without any
 * app-specific data. Read by the map layer to style ferries distinctly.
 */
export const FERRY_TRACK_TYPE = 'ferry';

/** The line color used for ferry tracks (a maritime blue). */
export const FERRY_COLOR = '#0ea5e9';

/**
 * Snap-distance guard (km): a point farther than this from the maritime network
 * is treated as unroutable and falls back to a great-circle line. The bundled
 * network is coarse (~100 km node spacing), so this stays comfortably above it
 * to accept genuine coastal ports while still rejecting clearly inland points.
 */
const MAX_SNAP_DISTANCE_KM = 250;

/** Roughly one point every this many km along the great-circle fallback arc. */
const FALLBACK_STEP_KM = 25;

const EARTH_RADIUS_KM = 6371;

/**
 * Computes the maritime track connecting two ports. Returns track points at sea
 * level (`ele` 0) following shipping lanes, with the exact port coordinates as
 * the first and last points (searoute's `appendOriginDestination`). Falls back
 * to a great-circle arc, flagged `approximate`, when no sea route can be found
 * or the library cannot be loaded.
 */
export async function getFerryRoute(from: Coordinates, to: Coordinates): Promise<FerryRouteResult> {
    try {
        const { seaRoute } = await import('searoute-ts');
        const feature = seaRoute([from.lon, from.lat], [to.lon, to.lat], {
            appendOriginDestination: true,
            maxSnapDistanceKm: MAX_SNAP_DISTANCE_KM,
        });
        const coordinates = feature?.geometry?.coordinates;
        if (Array.isArray(coordinates) && coordinates.length >= 2) {
            return {
                points: coordinates.map(
                    (c) => new TrackPoint({ attributes: { lat: c[1], lon: c[0] }, ele: 0 })
                ),
                approximate: false,
            };
        }
    } catch {
        // SnapFailedError / NoRouteError / dynamic-import failure: fall through
        // to the great-circle arc so the leg still renders.
    }
    return { points: greatCircleArc(from, to), approximate: true };
}

/**
 * A smoothed great-circle (spherical) arc between two points, ~1 point per
 * {@link FALLBACK_STEP_KM}, at sea level. Used when the sea-routing library
 * cannot produce a route; the line may cross land, which is acceptable for a
 * schematic ferry visualisation (the caller warns the user it is approximate).
 */
function greatCircleArc(from: Coordinates, to: Coordinates): TrackPoint[] {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const lat1 = from.lat * toRad;
    const lon1 = from.lon * toRad;
    const lat2 = to.lat * toRad;
    const lon2 = to.lon * toRad;

    // Central angle between the two points (haversine).
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const angular = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

    const start = new TrackPoint({ attributes: { lat: from.lat, lon: from.lon }, ele: 0 });
    const end = new TrackPoint({ attributes: { lat: to.lat, lon: to.lon }, ele: 0 });
    if (angular === 0) {
        return [start, end];
    }

    const steps = Math.max(1, Math.round((angular * EARTH_RADIUS_KM) / FALLBACK_STEP_KM));
    const sinAngular = Math.sin(angular);
    const points: TrackPoint[] = [];
    for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const a = Math.sin((1 - f) * angular) / sinAngular;
        const b = Math.sin(f * angular) / sinAngular;
        const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
        const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
        const z = a * Math.sin(lat1) + b * Math.sin(lat2);
        const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg;
        const lon = Math.atan2(y, x) * toDeg;
        points.push(new TrackPoint({ attributes: { lat, lon }, ele: 0 }));
    }
    return points;
}

/**
 * Looks up candidate ports/places by name through the free Nominatim geocoder
 * (OpenStreetMap), the same backend the map search uses. Returns up to five
 * matches with their coordinates. Network/parse failures yield an empty list,
 * so the caller degrades to "no results" rather than throwing.
 */
export async function searchPorts(query: string, lang: string): Promise<FerryPort[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
        return [];
    }
    try {
        const url =
            `https://nominatim.openstreetmap.org/search?format=json` +
            `&q=${encodeURIComponent(trimmed)}&limit=5&accept-language=${encodeURIComponent(lang)}`;
        const response = await fetch(url);
        if (!response.ok) {
            return [];
        }
        const results = await response.json();
        if (!Array.isArray(results)) {
            return [];
        }
        return results
            .map(
                (result: { display_name?: unknown; lat?: unknown; lon?: unknown }): FerryPort => ({
                    name: typeof result.display_name === 'string' ? result.display_name : '',
                    coordinates: { lat: Number(result.lat), lon: Number(result.lon) },
                })
            )
            .filter(
                (port) =>
                    port.name.length > 0 &&
                    Number.isFinite(port.coordinates.lat) &&
                    Number.isFinite(port.coordinates.lon)
            );
    } catch {
        return [];
    }
}

/**
 * Resolves a clicked map location to a place name via Nominatim reverse
 * geocoding, for the "pick on map" flow. Falls back to a lat/lon label when the
 * lookup fails, so a picked port always carries a usable name.
 */
export async function reverseGeocode(coordinates: Coordinates, lang: string): Promise<string> {
    const fallback = `${coordinates.lat.toFixed(4)}, ${coordinates.lon.toFixed(4)}`;
    try {
        const url =
            `https://nominatim.openstreetmap.org/reverse?format=json` +
            `&lat=${coordinates.lat}&lon=${coordinates.lon}&zoom=10` +
            `&accept-language=${encodeURIComponent(lang)}`;
        const response = await fetch(url);
        if (!response.ok) {
            return fallback;
        }
        const result = await response.json();
        return typeof result?.display_name === 'string' && result.display_name.length > 0
            ? result.display_name
            : fallback;
    } catch {
        return fallback;
    }
}

/** The first, most specific part of a Nominatim display name (e.g. "Barcelona"). */
export function shortPlaceName(name: string): string {
    return name.split(',')[0].trim() || name;
}
