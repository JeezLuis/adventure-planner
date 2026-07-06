/**
 * Map layer catalog: the basemaps users can pick from, the built-in overlay
 * catalog (the DMD-style "Offroad" grading layer), and the terrain/elevation
 * tile source.
 *
 * The app intentionally ships exactly three basemaps, all served by MapTiler
 * Cloud (https://www.maptiler.com/): an outdoor/topographic default, a
 * satellite view, and an alternative topographic style. The MapTiler API key
 * is injected at runtime by replacing {@link maptilerKeyPlaceHolder} in the
 * style URLs (see `StyleManager.get` in `components/map/style.ts`).
 *
 * Users can also add their own layers (basemaps or overlays) through the
 * custom-layers UI, and browser extensions can register overlays through the
 * extension API - both mechanisms mutate `overlays`/`overlayTree` at runtime.
 */
import {
    type ExpressionSpecification,
    type LineLayerSpecification,
    type RasterDEMSourceSpecification,
    type StyleSpecification,
} from 'maplibre-gl';
import { ELEVATION_TILE_URL, ELEVATION_TILE_MAX_ZOOM, ELEVATION_TILE_SIZE } from '$lib/config';

/**
 * Placeholder token substituted with the real MapTiler API key when a style
 * URL is fetched. Keeping the key out of this file means the catalog is
 * completely static and the key lives only in the environment.
 */
export const maptilerKeyPlaceHolder = 'MAPTILER_KEY';

/**
 * The three selectable basemaps. Keys are also i18n label keys
 * (`layers.label.<key>`) and are persisted in user settings - renaming a key
 * resets affected users to the default basemap (handled by the settings
 * validator).
 */
export const basemaps: { [key: string]: string | StyleSpecification } = {
    outdoor: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${maptilerKeyPlaceHolder}`,
    satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${maptilerKeyPlaceHolder}`,
    topo: `https://api.maptiler.com/maps/topo-v2/style.json?key=${maptilerKeyPlaceHolder}`,
};

/**
 * Offline/network-failure fallback style (raster OpenStreetMap). Not part of
 * the user-facing basemap list; only used when fetching the selected basemap
 * style fails, so the map never renders empty.
 */
export const fallbackBasemapStyle: StyleSpecification = {
    version: 8,
    sources: {
        openStreetMap: {
            type: 'raster',
            tiles: [
                'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
        },
    },
    layers: [
        {
            id: 'openStreetMap',
            type: 'raster',
            source: 'openStreetMap',
        },
    ],
};

/**
 * Palette for the "Offroad" overlay, and the single source of truth shared by
 * both the paint expressions ({@link buildOffroadOverlay}) and the on-map
 * legend (`OffroadLegend.svelte`) so the two can never drift.
 *
 * The track colors form a green->red difficulty ramp keyed off the OSM
 * `tracktype` tag (grade1..grade5), mirroring the Drive Mode Dashboard topo
 * legend (https://www.drivemodedashboard.com/topo-map-legend/).
 */
export const OFFROAD_COLORS = {
    grade1: '#77c15b', // light green - solid / firm gravel
    grade2: '#2f9e44', // green - mostly solid
    grade3: '#f2c037', // yellow - mixed hard/soft
    grade4: '#f08c00', // orange - mostly soft
    grade5: '#d63a2f', // red - soft / rough
    ungraded: '#9c6b3f', // brown - highway=track, condition unknown
    path: '#17a2a2', // teal - highway=path
    bridleway: '#b24bb2', // purple - highway=bridleway
    roadMajor: '#d9601a', // dark orange - motorway/trunk/primary
    roadSecondary: '#f08c00', // orange - secondary
    roadTertiary: '#f2c037', // yellow - tertiary
    roadResidential: '#9aa0a6', // grey - residential/unclassified/service
} as const;

/**
 * Vector tile source feeding the offroad overlay: VersaTiles' free public
 * server, which serves the Shortbread schema. Unlike our MapTiler basemaps
 * (OpenMapTiles schema, which drops `tracktype` and flattens `surface` to
 * paved/unpaved), the Shortbread `streets` layer carries the raw OSM
 * `tracktype`, `surface` and `kind` (= raw `highway`) values the grading needs.
 *
 * This is a community endpoint with no uptime SLA. To graduate to self-hosted
 * tiles, generate the same Shortbread schema as static PMTiles and swap this
 * one URL for a `pmtiles://...` reference - the style below is unchanged.
 */
export const OFFROAD_TILES_URL = 'https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}';

/** Shared zoom->width curve for the paved-road hierarchy; `mult` scales per class. */
function offroadWidth(mult: number): ExpressionSpecification {
    return [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        9,
        0.6 * mult,
        12,
        1.4 * mult,
        14,
        2.4 * mult,
        16,
        4 * mult,
        18,
        6.5 * mult,
    ];
}

/**
 * Width curve for tracks/paths/bridleways. The provider's tiles only start
 * carrying these classes at ~zoom 13, so this curve is deliberately bold from
 * z13 up: they read immediately when they appear instead of being hair-thin
 * lines the user has to zoom further to notice. `mult` scales per class.
 */
function offroadTrailWidth(mult: number): ExpressionSpecification {
    return [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        12,
        1.6 * mult,
        13,
        2.6 * mult,
        14,
        3.4 * mult,
        16,
        5 * mult,
        18,
        7.5 * mult,
    ];
}

/**
 * Track color: `tracktype` wins when present; otherwise `surface` substitutes
 * onto the same ramp; otherwise (a bare `highway=track`) it falls through to
 * the "ungraded" brown. `has` guards mean an unrecognized value degrades to
 * brown rather than mis-coloring.
 */
function offroadTrackColor(): ExpressionSpecification {
    const c = OFFROAD_COLORS;
    return [
        'case',
        ['has', 'tracktype'],
        [
            'match',
            ['get', 'tracktype'],
            'grade1',
            c.grade1,
            'grade2',
            c.grade2,
            'grade3',
            c.grade3,
            'grade4',
            c.grade4,
            'grade5',
            c.grade5,
            c.ungraded,
        ],
        ['has', 'surface'],
        [
            'match',
            ['get', 'surface'],
            ['compacted', 'fine_gravel', 'gravel', 'pebblestone'],
            c.grade1,
            [
                'paved',
                'asphalt',
                'concrete',
                'concrete:plates',
                'paving_stones',
                'sett',
                'cobblestone',
                'metal',
                'wood',
            ],
            c.grade2,
            ['unpaved', 'dirt', 'ground', 'earth', 'clay'],
            c.grade4,
            ['sand', 'mud', 'grass', 'rock'],
            c.grade5,
            c.ungraded,
        ],
        c.ungraded,
    ];
}

/**
 * The "Offroad" overlay: a green->red difficulty grading of tracks plus
 * distinct styling for paths, bridleways and the paved road hierarchy, built
 * from raw OSM tags exposed by the Shortbread `streets` layer.
 *
 * Layer order = paint order (roads first, then tracks/paths on top), which
 * `StyleManager.updateOverlays` preserves by inserting every layer before the
 * same overlay anchor.
 */
export function buildOffroadOverlay(): StyleSpecification {
    const c = OFFROAD_COLORS;
    const line = (
        id: string,
        filter: ExpressionSpecification,
        color: ExpressionSpecification | string,
        widthMult: number,
        extraLayout: LineLayerSpecification['layout'] = {},
        extraPaint: LineLayerSpecification['paint'] = {}
    ): LineLayerSpecification => ({
        id,
        type: 'line',
        source: 'offroad',
        'source-layer': 'streets',
        filter,
        layout: { 'line-join': 'round', ...extraLayout },
        paint: { 'line-color': color, 'line-width': offroadWidth(widthMult), ...extraPaint },
    });

    return {
        version: 8,
        sources: {
            offroad: {
                type: 'vector',
                tiles: [OFFROAD_TILES_URL],
                minzoom: 0,
                maxzoom: 14,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
            },
        },
        layers: [
            line(
                'offroad-road-residential',
                [
                    'match',
                    ['get', 'kind'],
                    ['residential', 'living_street', 'unclassified', 'service'],
                    true,
                    false,
                ],
                c.roadResidential,
                0.8,
                { 'line-cap': 'round' }
            ),
            line(
                'offroad-road-tertiary',
                ['==', ['get', 'kind'], 'tertiary'],
                c.roadTertiary,
                0.9,
                { 'line-cap': 'round' }
            ),
            line(
                'offroad-road-secondary',
                ['==', ['get', 'kind'], 'secondary'],
                c.roadSecondary,
                1.05,
                { 'line-cap': 'round' }
            ),
            line(
                'offroad-road-major',
                ['match', ['get', 'kind'], ['motorway', 'trunk', 'primary'], true, false],
                c.roadMajor,
                1.2,
                { 'line-cap': 'round' }
            ),
            line(
                'offroad-track',
                ['==', ['get', 'kind'], 'track'],
                offroadTrackColor(),
                1,
                { 'line-cap': 'butt' },
                { 'line-dasharray': [2.5, 1.2], 'line-width': offroadTrailWidth(1) }
            ),
            line(
                'offroad-path',
                ['==', ['get', 'kind'], 'path'],
                c.path,
                1,
                { 'line-cap': 'round' },
                { 'line-dasharray': [0, 1.8], 'line-width': offroadTrailWidth(0.95) }
            ),
            line(
                'offroad-bridleway',
                ['==', ['get', 'kind'], 'bridleway'],
                c.bridleway,
                1,
                { 'line-cap': 'round' },
                { 'line-dasharray': [2, 1.2, 0, 1.2], 'line-width': offroadTrailWidth(0.95) }
            ),
        ],
    };
}

/**
 * Raster piste/lift overlay from OpenSnowMap (https://www.opensnowmap.org/), a
 * community project rendering OSM winter-sports data (pistes colored by
 * difficulty, ski lifts, resort labels) as transparent 256px PNG overlay tiles.
 *
 * Community endpoint with no uptime SLA; the styling is baked into the tiles, so
 * unlike the offroad overlay there are no paint expressions, no shared palette,
 * and no on-map legend. To graduate off the community server, mirror the tiles
 * or stand up an equivalent renderer and swap this one URL.
 */
export const SKI_TILES_URL = 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png';

/**
 * The "Ski resorts" overlay: OpenSnowMap's pre-rendered piste/lift raster tiles
 * as a single raster layer. Useful when planning offroad adventures near ski
 * areas. Difficulty colors, lift symbols and resort labels are baked into the
 * tiles, so there is nothing to style client-side.
 */
export function buildSkiOverlay(): StyleSpecification {
    return {
        version: 8,
        sources: {
            ski: {
                type: 'raster',
                tiles: [SKI_TILES_URL],
                tileSize: 256, // OpenSnowMap serves 256px tiles; MapLibre raster defaults to 512
                minzoom: 0,
                maxzoom: 18,
                attribution:
                    '&copy; <a href="https://www.opensnowmap.org/" target="_blank">OpenSnowMap</a> (CC-BY-SA), ' +
                    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
            },
        },
        layers: [{ id: 'ski-pistes', type: 'raster', source: 'ski' }],
    };
}

/**
 * Built-in overlay catalog. Ships the DMD-style "Offroad" grading layer and a
 * "Ski resorts" piste/lift layer; further overlays may be added at runtime as
 * user-defined custom layers or extension-registered layers.
 */
export const overlays: { [key: string]: string | StyleSpecification } = {
    offroad: buildOffroadOverlay(),
    ski: buildSkiOverlay(),
};

/** Default opacity per overlay id. */
export const defaultOpacities: { [key: string]: number } = {
    offroad: 0.9,
    ski: 0.9,
};

/**
 * A nested tree of layer ids used by the layer-selection UI. Leaves are
 * booleans (`true` = layer exists / is enabled, depending on context).
 */
export type LayerTreeType = { [key: string]: LayerTreeType | boolean };

/** Hierarchy of all available basemaps, as shown in the layer settings UI. */
export const basemapTree: LayerTreeType = {
    basemaps: {
        outdoor: true,
        satellite: true,
        topo: true,
    },
};

/** Hierarchy of all available overlays (also populated at runtime by extensions). */
export const overlayTree: LayerTreeType = {
    overlays: {
        offroad: true,
        ski: true,
    },
};

/** Basemap selected on first launch. */
export const defaultBasemap = 'outdoor';

/** Overlays enabled on first launch: none (both are available but off by default). */
export const defaultOverlays: LayerTreeType = {
    overlays: {
        offroad: false,
        ski: false,
    },
};

/** Basemaps visible in the quick layer picker by default: all three. */
export const defaultBasemapTree: LayerTreeType = {
    basemaps: {
        outdoor: true,
        satellite: true,
        topo: true,
    },
};

/** Overlays visible in the quick layer picker by default. */
export const defaultOverlayTree: LayerTreeType = {
    overlays: {
        offroad: true,
        ski: true,
    },
};

/**
 * A layer added by the user through the custom-layers UI. `value` is either a
 * raster/vector tile URL template or a full MapLibre style URL/specification.
 */
export type CustomLayer = {
    id: string;
    name: string;
    tileUrls: string[];
    maxZoom: number;
    layerType: 'basemap' | 'overlay';
    resourceType: 'raster' | 'vector';
    value: string | StyleSpecification;
};

/**
 * Elevation data sources usable for 3D terrain. The single source is the
 * keyless terrarium-encoded tile set configured in `$lib/config` (AWS Open
 * Data Terrain Tiles by default) - the same tiles `getElevation()` decodes
 * for elevation profiles.
 */
export const terrainSources: { [key: string]: RasterDEMSourceSpecification } = {
    terrarium: {
        type: 'raster-dem',
        tiles: [ELEVATION_TILE_URL],
        tileSize: ELEVATION_TILE_SIZE,
        maxzoom: ELEVATION_TILE_MAX_ZOOM,
        encoding: 'terrarium',
        attribution:
            'Elevation data: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles</a> (Mapzen/AWS Open Data)',
    },
};

/** Terrain source used by default (and currently the only one). */
export const defaultTerrainSource = 'terrarium';
