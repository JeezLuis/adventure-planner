/**
 * Turns the anchor points a user places on the map into a track that follows
 * roads and trails, by querying a BRouter routing server (see
 * {@link BROUTER_URL}). When routing is disabled, anchors are simply connected
 * with straight lines enriched with elevation data.
 */
import type { Coordinates } from 'gpx';
import { TrackPoint, distance } from 'gpx';
import { settings } from '$lib/logic/settings';
import { getElevation } from '$lib/utils';
import { get } from 'svelte/store';
import { BROUTER_URL } from '$lib/config';

const { routing, routingProfile } = settings;

/**
 * A selectable routing activity. `profile` is the name of a BRouter profile
 * that must exist on the routing server (standard profiles plus the ones we
 * deploy ourselves — see infra/ BRouter provisioning).
 */
export type RoutingProfile = {
    profile: string;
};

/**
 * Maps the activity keys shown in the routing tool UI to BRouter profiles.
 * The keys are also i18n keys (`toolbar.routing.activities.<key>`) and stored
 * user settings — renaming a key invalidates saved preferences.
 */
export const routingProfiles: { [key: string]: RoutingProfile } = {
    bike: { profile: 'trekking' },
    racing_bike: { profile: 'fastbike' },
    gravel_bike: { profile: 'gravel' },
    mountain_bike: { profile: 'mtb' },
    foot: { profile: 'hiking-mountain' },
    motorcycle: { profile: 'car-fast' },
    water: { profile: 'river' },
    railway: { profile: 'rail' },
};

/**
 * Computes the track points connecting `points` (ordered anchor coordinates),
 * either along the road/trail network (routing enabled) or as straight lines
 * with interpolated elevation (routing disabled).
 */
export function route(points: Coordinates[]): Promise<TrackPoint[]> {
    if (get(routing)) {
        return getBRouterRoute(points, routingProfiles[get(routingProfile)].profile);
    } else {
        return getIntermediatePoints(points);
    }
}

/**
 * Requests a route from the BRouter server and converts the GeoJSON response
 * into track points. Elevation comes from the third coordinate of the
 * response; OSM way tags (highway, surface, sac_scale, …) are extracted from
 * BRouter's `messages` array and stored as point extensions, which the map
 * uses for surface/slope coloring.
 */
async function getBRouterRoute(
    points: Coordinates[],
    brouterProfile: string
): Promise<TrackPoint[]> {
    let url = `${BROUTER_URL}?lonlats=${points.map((point) => `${point.lon.toFixed(8)},${point.lat.toFixed(8)}`).join('|')}&profile=${brouterProfile}&format=geojson&alternativeidx=0`;

    let response = await fetch(url);

    if (!response.ok) {
        const error = await response.text();
        if (error.includes('from-position not mapped in existing datafile')) {
            throw new Error('toolbar.routing.error.from');
        } else if (error.includes('via1-position not mapped in existing datafile')) {
            throw new Error('toolbar.routing.error.via');
        } else if (error.includes('to-position not mapped in existing datafile')) {
            throw new Error('toolbar.routing.error.to');
        } else if (error.includes('Time-out')) {
            throw new Error('toolbar.routing.error.timeout');
        } else {
            throw new Error(error);
        }
    }

    let geojson = await response.json();

    let route: TrackPoint[] = [];
    let coordinates = geojson.features[0].geometry.coordinates;
    let messages = geojson.features[0].properties.messages;

    const lngIdx = messages[0].indexOf('Longitude');
    const latIdx = messages[0].indexOf('Latitude');
    const tagIdx = messages[0].indexOf('WayTags');
    let messageIdx = 1;
    let tags = messageIdx < messages.length ? getTags(messages[messageIdx][tagIdx]) : {};

    for (let i = 0; i < coordinates.length; i++) {
        route.push(
            new TrackPoint({
                attributes: {
                    lat: coordinates[i][1],
                    lon: coordinates[i][0],
                },
                ele: coordinates[i][2] ?? (i > 0 ? route[i - 1].ele : 0),
            })
        );

        if (
            messageIdx < messages.length &&
            coordinates[i][0] == Number(messages[messageIdx][lngIdx]) / 1000000 &&
            coordinates[i][1] == Number(messages[messageIdx][latIdx]) / 1000000
        ) {
            messageIdx++;

            if (messageIdx == messages.length) tags = {};
            else tags = getTags(messages[messageIdx][tagIdx]);
        }

        route[route.length - 1].setExtensions(tags);
    }

    return route;
}

/** Parses a BRouter `WayTags` message ("highway=path surface=gravel …") into a tag map. */
function getTags(message: string): { [key: string]: string } {
    const fields = message.split(' ');
    let tags: { [key: string]: string } = {};
    for (let i = 0; i < fields.length; i++) {
        let [key, value] = fields[i].split('=');
        key = key.replace(/:/g, '_');
        tags[key] = value;
    }
    return tags;
}

/**
 * Straight-line fallback used when routing is disabled: connects the anchors
 * with points every ~50 m and fills in elevation from the terrain tiles.
 */
function getIntermediatePoints(points: Coordinates[]): Promise<TrackPoint[]> {
    let route: TrackPoint[] = [];
    let step = 0.05;

    for (let i = 0; i < points.length - 1; i++) {
        // Add intermediate points between each pair of points
        let dist = distance(points[i], points[i + 1]) / 1000;
        for (let d = 0; d < dist; d += step) {
            let lat = points[i].lat + (d / dist) * (points[i + 1].lat - points[i].lat);
            let lon = points[i].lon + (d / dist) * (points[i + 1].lon - points[i].lon);
            route.push(
                new TrackPoint({
                    attributes: {
                        lat: lat,
                        lon: lon,
                    },
                })
            );
        }
    }

    route.push(
        new TrackPoint({
            attributes: {
                lat: points[points.length - 1].lat,
                lon: points[points.length - 1].lon,
            },
        })
    );

    return getElevation(route).then((elevations) => {
        route.forEach((point, i) => {
            point.ele = elevations[i];
        });
        return route;
    });
}
