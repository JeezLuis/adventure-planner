/**
 * Map layer catalog: the basemaps users can pick from, the (currently empty)
 * built-in overlay catalog, and the terrain/elevation tile source.
 *
 * The app intentionally ships exactly three basemaps, all served by MapTiler
 * Cloud (https://www.maptiler.com/): an outdoor/topographic default, a
 * satellite view, and an alternative topographic style. The MapTiler API key
 * is injected at runtime by replacing {@link maptilerKeyPlaceHolder} in the
 * style URLs (see `StyleManager.get` in `components/map/style.ts`).
 *
 * Users can still add their own layers (basemaps or overlays) through the
 * custom-layers UI, and browser extensions can register overlays through the
 * extension API - both mechanisms mutate `overlays`/`overlayTree` at runtime,
 * which is why those objects are kept even though no built-in overlays exist.
 */
import { type RasterDEMSourceSpecification, type StyleSpecification } from 'maplibre-gl';
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
 * Built-in overlay catalog. Intentionally empty - overlays only exist as
 * user-defined custom layers or extension-registered layers, which are added
 * to this object at runtime.
 */
export const overlays: { [key: string]: string | StyleSpecification } = {};

/** Default opacity per overlay id; empty because there are no built-in overlays. */
export const defaultOpacities: { [key: string]: number } = {};

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

/** Hierarchy of all available overlays (empty; populated at runtime by extensions). */
export const overlayTree: LayerTreeType = {
    overlays: {},
};

/** Basemap selected on first launch. */
export const defaultBasemap = 'outdoor';

/** Overlays enabled on first launch: none. */
export const defaultOverlays: LayerTreeType = {
    overlays: {},
};

/** Basemaps visible in the quick layer picker by default: all three. */
export const defaultBasemapTree: LayerTreeType = {
    basemaps: {
        outdoor: true,
        satellite: true,
        topo: true,
    },
};

/** Overlays visible in the quick layer picker by default: none exist. */
export const defaultOverlayTree: LayerTreeType = {
    overlays: {},
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
