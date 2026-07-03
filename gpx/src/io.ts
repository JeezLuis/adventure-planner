import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { Coordinates, GPXFileType } from './types';
import { GPXFile } from './gpx';

/**
 * Thrown by {@link parseGPX} when the input is not usable GPX: unparseable XML,
 * a missing `<gpx>` root, or no tracks/routes/waypoints with valid coordinates.
 * Callers should catch this and reject the file rather than importing an empty
 * or coordinate-less document.
 */
export class GPXParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GPXParseError';
    }
}

const attributesWithNamespace = {
    RoutePointExtension: 'gpxx:RoutePointExtension',
    rpt: 'gpxx:rpt',
    TrackPointExtension: 'gpxtpx:TrackPointExtension',
    PowerExtension: 'gpxpx:PowerExtension',
    atemp: 'gpxtpx:atemp',
    hr: 'gpxtpx:hr',
    cad: 'gpxtpx:cad',
    Extensions: 'gpxtpx:Extensions',
    PowerInWatts: 'gpxpx:PowerInWatts',
    power: 'gpxpx:PowerExtension',
    line: 'gpx_style:line',
    color: 'gpx_style:color',
    opacity: 'gpx_style:opacity',
    width: 'gpx_style:width',
};

const floatPatterns = [
    /[-+]?\d*\.\d+$/, // decimal
    /[-+]?\d+$/, // integer
];
function safeParseFloat(value: string): number {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
        return parsed;
    }
    for (const pattern of floatPatterns) {
        const match = value.match(pattern);
        if (match) {
            return parseFloat(match[0]);
        }
    }
    return 0.0;
}

/**
 * Parses a latitude/longitude attribute. Unlike {@link safeParseFloat}, an
 * unparseable coordinate yields NaN rather than 0.0 so the point can be dropped
 * by {@link sanitizeParsedGPX} instead of being silently relocated to (0, 0).
 */
function parseCoordinate(value: string): number {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function hasFiniteCoordinates(point: { attributes?: Coordinates }): boolean {
    return (
        point.attributes != null &&
        Number.isFinite(point.attributes.lat) &&
        Number.isFinite(point.attributes.lon)
    );
}

function stripInvalidTime(node: { time?: Date }): void {
    if (node.time instanceof Date && isNaN(node.time.getTime())) {
        node.time = undefined;
    }
}

/**
 * Drops points without finite coordinates and normalizes unparseable `<time>`
 * values to undefined, so malformed input cannot poison statistics or
 * persistence downstream (a missing lat/lon would otherwise crash
 * `_computeStatistics` on every reload).
 */
function sanitizeParsedGPX(parsed: GPXFileType): void {
    if (Array.isArray(parsed.wpt)) {
        parsed.wpt = parsed.wpt.filter(hasFiniteCoordinates);
        parsed.wpt.forEach(stripInvalidTime);
    }
    if (Array.isArray(parsed.trk)) {
        parsed.trk.forEach((trk) => {
            if (Array.isArray(trk.trkseg)) {
                trk.trkseg.forEach((seg) => {
                    if (Array.isArray(seg.trkpt)) {
                        seg.trkpt = seg.trkpt.filter(hasFiniteCoordinates);
                        seg.trkpt.forEach(stripInvalidTime);
                    }
                });
            }
        });
    }
    if (Array.isArray(parsed.rte)) {
        parsed.rte.forEach((rte) => {
            if (Array.isArray(rte.rtept)) {
                rte.rtept = rte.rtept.filter(hasFiniteCoordinates);
                rte.rtept.forEach(stripInvalidTime);
            }
        });
    }
    if (parsed.metadata && typeof parsed.metadata === 'object') {
        stripInvalidTime(parsed.metadata);
    }
}

/** True when the parsed file has at least one track point, route point, or waypoint. */
function hasRoutableContent(parsed: GPXFileType): boolean {
    const hasTrackPoints =
        Array.isArray(parsed.trk) &&
        parsed.trk.some(
            (trk) =>
                Array.isArray(trk.trkseg) &&
                trk.trkseg.some((seg) => Array.isArray(seg.trkpt) && seg.trkpt.length > 0)
        );
    const hasRoutePoints =
        Array.isArray(parsed.rte) &&
        parsed.rte.some((rte) => Array.isArray(rte.rtept) && rte.rtept.length > 0);
    const hasWaypoints = Array.isArray(parsed.wpt) && parsed.wpt.length > 0;
    return hasTrackPoints || hasRoutePoints || hasWaypoints;
}

export function parseGPX(gpxData: string): GPXFile {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        attributesGroupName: 'attributes',
        removeNSPrefix: true,
        isArray(name: string) {
            return (
                name === 'trk' ||
                name === 'trkseg' ||
                name === 'trkpt' ||
                name === 'wpt' ||
                name === 'rte' ||
                name === 'rtept' ||
                name === 'gpxx:rpt'
            );
        },
        attributeValueProcessor(attrName, attrValue, jPath) {
            if (attrName === 'lat' || attrName === 'lon') {
                return parseCoordinate(attrValue);
            }
            return attrValue;
        },
        transformTagName(tagName: string) {
            if (attributesWithNamespace[tagName]) {
                return attributesWithNamespace[tagName];
            }
            return tagName;
        },
        parseTagValue: false,
        tagValueProcessor(tagName, tagValue, jPath, hasAttributes, isLeafNode) {
            if (isLeafNode) {
                if (tagName === 'ele') {
                    return safeParseFloat(tagValue);
                }

                if (tagName === 'time') {
                    return new Date(tagValue);
                }

                if (
                    tagName === 'gpxtpx:atemp' ||
                    tagName === 'gpxtpx:hr' ||
                    tagName === 'gpxtpx:cad' ||
                    tagName === 'gpxpx:PowerInWatts' ||
                    tagName === 'gpx_style:opacity' ||
                    tagName === 'gpx_style:width'
                ) {
                    return safeParseFloat(tagValue);
                }

                if (tagName === 'gpxpx:PowerExtension') {
                    // Finish the transformation of the simple <power> tag to the more complex <gpxpx:PowerExtension> tag
                    // Note that this only targets the transformed <power> tag, since it must be a leaf node
                    return {
                        'gpxpx:PowerInWatts': safeParseFloat(tagValue),
                    };
                }
            }

            return tagValue;
        },
    });

    let parsed: GPXFileType;
    try {
        parsed = parser.parse(gpxData).gpx;
    } catch (e) {
        throw new GPXParseError(
            `Could not parse GPX file: ${e instanceof Error ? e.message : String(e)}`
        );
    }

    if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
        throw new GPXParseError('File does not contain a GPX root element.');
    }

    // @ts-ignore
    if (parsed.metadata === '') {
        parsed.metadata = {};
    }

    sanitizeParsedGPX(parsed);

    if (!hasRoutableContent(parsed)) {
        throw new GPXParseError(
            'GPX file contains no tracks, routes, or waypoints with valid coordinates.'
        );
    }

    return new GPXFile(parsed);
}

export function buildGPX(file: GPXFile, exclude: string[]): string {
    const gpx = file.toGPXFileType(exclude);

    let lastDate = undefined;
    const builder = new XMLBuilder({
        format: true,
        ignoreAttributes: false,
        attributeNamePrefix: '',
        attributesGroupName: 'attributes',
        suppressEmptyNode: true,
        tagValueProcessor: (tagName: string, tagValue: unknown): string | undefined => {
            if (tagValue instanceof Date) {
                if (isNaN(tagValue.getTime())) {
                    return lastDate?.toISOString();
                }
                lastDate = tagValue;
                return tagValue.toISOString();
            }
            return tagValue.toString();
        },
    });

    if (!gpx.attributes) gpx.attributes = {};
    // Files that already carry a creator keep it; files authored here are stamped with ours.
    gpx.attributes['creator'] = gpx.attributes['creator'] ?? 'Adventure Planner';
    gpx.attributes['version'] = '1.1';
    gpx.attributes['xmlns'] = 'http://www.topografix.com/GPX/1/1';
    gpx.attributes['xmlns:xsi'] = 'http://www.w3.org/2001/XMLSchema-instance';
    gpx.attributes['xsi:schemaLocation'] =
        'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd http://www.garmin.com/xmlschemas/PowerExtension/v1 http://www.garmin.com/xmlschemas/PowerExtensionv1.xsd http://www.topografix.com/GPX/gpx_style/0/2 http://www.topografix.com/GPX/gpx_style/0/2/gpx_style.xsd';
    gpx.attributes['xmlns:gpxtpx'] = 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1';
    gpx.attributes['xmlns:gpxx'] = 'http://www.garmin.com/xmlschemas/GpxExtensions/v3';
    gpx.attributes['xmlns:gpxpx'] = 'http://www.garmin.com/xmlschemas/PowerExtension/v1';
    gpx.attributes['xmlns:gpx_style'] = 'http://www.topografix.com/GPX/gpx_style/0/2';

    if (gpx.trk.length === 1 && (gpx.trk[0].name === undefined || gpx.trk[0].name === '')) {
        gpx.trk[0].name = gpx.metadata.name;
    }

    return builder.build({
        '?xml': {
            attributes: {
                version: '1.0',
                encoding: 'UTF-8',
            },
        },
        gpx: removeEmptyElements(gpx),
    });
}

function removeEmptyElements(obj: GPXFileType): GPXFileType {
    for (const key in obj) {
        if (
            obj[key] === null ||
            obj[key] === undefined ||
            obj[key] === '' ||
            (Array.isArray(obj[key]) && obj[key].length === 0)
        ) {
            delete obj[key];
        } else if (typeof obj[key] === 'object' && !(obj[key] instanceof Date)) {
            removeEmptyElements(obj[key]);
            if (Object.keys(obj[key]).length === 0) {
                delete obj[key];
            }
        }
    }
    return obj;
}
