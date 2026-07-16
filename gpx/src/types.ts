export type GPXFileType = {
    attributes: GPXFileAttributes;
    metadata: Metadata;
    wpt: WaypointType[];
    trk: TrackType[];
    rte: RouteType[];
    /**
     * File-level `<gpx><extensions>`. Not part of the in-memory {@link GPXFile}
     * model: the parser drops it and the app never reads it. It exists so
     * one-way exporters (the OsmAnd .osf export) can inject appearance
     * extensions into the serializable tree right before building the XML.
     */
    extensions?: GPXFileExtensions;
};

/**
 * OsmAnd track-appearance extensions, applied by OsmAnd to the whole file.
 * Reference: https://docs.osmand.net/docs/technical/osmand-file-formats/osmand-gpx
 */
export type GPXFileExtensions = {
    /** Track color as #RRGGBB or #AARRGGBB (alpha = track opacity). */
    'osmand:color'?: string;
    /** Line width: 'thin' | 'medium' | 'bold' or an integer 1-24 (as string). */
    'osmand:width'?: string;
    /** Render direction arrows along the line ('true'/'false'). */
    'osmand:show_arrows'?: string;
    /** Render start/finish markers ('true'/'false'). */
    'osmand:show_start_finish'?: string;
    /** Waypoint group appearance definitions (group = waypoint `<type>`). */
    'osmand:points_groups'?: OsmandPointsGroups;
};

export type OsmandPointsGroups = {
    group: OsmandPointsGroup[];
};

/** One `<group>` element inside `<osmand:points_groups>`; all data is attributes. */
export type OsmandPointsGroup = {
    attributes: {
        /** Group name; waypoints join it via their `<type>` element. */
        name: string;
        /** Default icon color of the group's waypoints (#RRGGBB or #AARRGGBB). */
        color?: string;
        /** Default OsmAnd icon name (e.g. 'tourism_camp_site'). */
        icon?: string;
        /** Default background shape: 'circle' | 'square' | 'octagon'. */
        background?: string;
    };
};

export type GPXFileAttributes = {
    creator?: string;
    [key: string]: string;
};

export type Metadata = {
    name?: string;
    desc?: string;
    author?: Author;
    link?: Link;
    time?: Date;
    extensions?: MetadataExtensions;
};

/**
 * Extensions carried under `<metadata><extensions>`. Adventure Planner uses the
 * `ap:data` element to store a single JSON payload that round-trips adventure
 * and per-track metadata with no native GPX representation (numbering, dates,
 * buffer days, alternative flags). The key is namespaced so foreign GPX readers
 * ignore it, and the serializer emits whatever is present here.
 */
export type MetadataExtensions = {
    'ap:data'?: string;
    /**
     * OsmAnd activity type id (see OsmAnd-resources poi/activities.json,
     * e.g. 'adventure_motorcycling'). Written by the OsmAnd export only.
     */
    'osmand:activity'?: string;
    /**
     * Human-readable info tags written by the OsmAnd export. OsmAnd (Android
     * 5.0+) lists metadata extension tags in the track context menu, so these
     * surface adventure metadata that has no native GPX field. Never reuse
     * OsmAnd's own appearance keys ('color', 'width', ...) here.
     */
    adventure?: string;
    stage?: string;
    date?: string;
    alternative?: string;
    buffer_days?: string;
};

export type Link = {
    attributes: LinkAttributes;
    text?: string;
    type?: string;
};

export type LinkAttributes = {
    href: string;
};

export type WaypointType = {
    attributes: Coordinates;
    ele?: number;
    time?: Date;
    name?: string;
    cmt?: string;
    desc?: string;
    link?: Link;
    sym?: string;
    type?: string;
    extensions?: WaypointExtensions;
};

export type WaypointExtensions = {
    'gpxx:RoutePointExtension'?: RoutePointExtension;
    /** OsmAnd icon name for this waypoint (e.g. 'amenity_drinking_water'). */
    'osmand:icon'?: string;
    /** OsmAnd waypoint color as #RRGGBB or #AARRGGBB. */
    'osmand:color'?: string;
    /** OsmAnd background shape: 'circle' | 'square' | 'octagon'. */
    'osmand:background'?: string;
};

export type Coordinates = {
    lat: number;
    lon: number;
};

export type TrackType = {
    name?: string;
    cmt?: string;
    desc?: string;
    src?: string;
    link?: Link;
    type?: string;
    extensions?: TrackExtensions;
    trkseg: TrackSegmentType[];
};

export type TrackExtensions = {
    'gpx_style:line'?: LineStyleExtension;
};

export type LineStyleExtension = {
    'gpx_style:color'?: string;
    'gpx_style:opacity'?: number;
    'gpx_style:width'?: number;
};

export type TrackSegmentType = {
    trkpt: TrackPointType[];
};

export type TrackPointType = {
    attributes: Coordinates;
    ele?: number;
    time?: Date;
    extensions?: TrackPointExtensions;
};

export type TrackPointExtensions = {
    'gpxtpx:TrackPointExtension'?: TrackPointExtension;
    'gpxpx:PowerExtension'?: PowerExtension;
};

export type TrackPointExtension = {
    'gpxtpx:atemp'?: number;
    'gpxtpx:hr'?: number;
    'gpxtpx:cad'?: number;
    'gpxtpx:Extensions'?: Record<string, string>;
};

export type PowerExtension = {
    'gpxpx:PowerInWatts'?: number;
};

export type Author = {
    name?: string;
    email?: string;
    link?: Link;
};

export type RouteType = {
    name?: string;
    cmt?: string;
    desc?: string;
    src?: string;
    link?: Link;
    type?: string;
    extensions?: TrackExtensions;
    rtept: WaypointType[];
};

export type RoutePointExtension = {
    'gpxx:rpt'?: GPXXRoutePoint[];
};

export type GPXXRoutePoint = {
    attributes: Coordinates;
};
