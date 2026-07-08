import { type Database } from '$lib/db';
import { liveQuery } from 'dexie';
import {
    basemaps,
    defaultBasemap,
    defaultBasemapTree,
    defaultOpacities,
    defaultOverlays,
    defaultOverlayTree,
    defaultTerrainSource,
    type CustomLayer,
    type LayerTreeType,
} from '$lib/assets/layers';
import { browser } from '$app/environment';
import { get, writable, type Writable } from 'svelte/store';

export class Setting<V> {
    private _db: Database | null = null;
    private _subscription: { unsubscribe: () => void } | null = null;
    private _key: string;
    private _value: Writable<V>;
    private _validator?: (value: V) => V;

    constructor(key: string, initial: V, validator?: (value: V) => V) {
        this._key = key;
        this._value = writable(initial);
        this._validator = validator;
    }

    connectToDatabase(db: Database) {
        if (this._db) return;
        this._db = db;

        let first = true;
        this._subscription = liveQuery(() => db.settings.get(this._key)).subscribe((value) => {
            if (value === undefined) {
                if (!first) {
                    this._value.set(value);
                }
            } else {
                if (this._validator) {
                    value = this._validator(value);
                }
                this._value.set(value);
            }
            first = false;
        });
    }

    disconnectFromDatabase() {
        this._subscription?.unsubscribe();
        this._subscription = null;
        this._db = null;
    }

    subscribe(run: (value: V) => void, invalidate?: (value?: V) => void) {
        return this._value.subscribe(run, invalidate);
    }

    set(value: V) {
        if (typeof value === 'object' || value !== get(this._value)) {
            if (this._db) {
                this._db.settings.put(value, this._key);
            } else {
                this._value.set(value);
            }
        }
    }

    update(callback: (value: any) => any) {
        this.set(callback(get(this._value)));
    }
}

export class SettingInitOnFirstRead<V> {
    private _db: Database | null = null;
    private _subscription: { unsubscribe: () => void } | null = null;
    private _key: string;
    private _value: Writable<V | undefined>;
    private _initial: V;
    private _validator?: (value: V) => V;

    constructor(key: string, initial: V, validator?: (value: V) => V) {
        this._key = key;
        this._value = writable(undefined);
        this._initial = initial;
        this._validator = validator;
    }

    connectToDatabase(db: Database) {
        if (this._db) return;
        this._db = db;

        let first = true;
        this._subscription = liveQuery(() => db.settings.get(this._key)).subscribe((value) => {
            if (value === undefined) {
                if (first) {
                    this._value.set(this._initial);
                } else {
                    this._value.set(value);
                }
            } else {
                if (this._validator) {
                    value = this._validator(value);
                }
                this._value.set(value);
            }
            first = false;
        });
    }

    initialize() {
        this.set(this._initial);
    }

    disconnectFromDatabase() {
        this._subscription?.unsubscribe();
        this._subscription = null;
        this._db = null;
    }

    subscribe(run: (value: V | undefined) => void, invalidate?: (value?: V | undefined) => void) {
        return this._value.subscribe(run, invalidate);
    }

    set(value: V) {
        if (typeof value === 'object' || value !== get(this._value)) {
            if (this._db) {
                this._db.settings.put(value, this._key);
            } else {
                this._value.set(value);
            }
        }
    }

    update(callback: (value: any) => any) {
        this.set(callback(get(this._value)));
    }
}

function getValueValidator<V>(allowed: V[], fallback: V) {
    const dict = new Set<V>(allowed);
    return (value: V) => (dict.has(value) ? value : fallback);
}

function getArrayValidator<V>(allowed: V[]) {
    const dict = new Set<V>(allowed);
    return (value: V[]) => value.filter((v) => dict.has(v));
}

function getLayerValidator(allowed: Record<string, any>, fallback: string) {
    return (layer: string) =>
        allowed.hasOwnProperty(layer) ||
        layer.startsWith('custom-') ||
        layer.startsWith('extension-')
            ? layer
            : fallback;
}

/**
 * Filters a persisted layer tree against an `allowed` allow-list, dropping any
 * keys that are no longer known (except `custom-`/`extension-` layers).
 *
 * When a key is present in the allow-list but absent from the stored value
 * (typically a newly shipped overlay a returning user has never seen), the
 * behaviour depends on `fillWithFalse`:
 * - `false` (default): fill with the allow-list's own leaf value. Correct for
 *   "membership" trees such as `selectedOverlayTree`, where a new overlay should
 *   automatically appear in the quick picker.
 * - `true`: fill with `false`. Correct for "is-it-enabled" trees such as
 *   `currentOverlays`/`previousOverlays`, so a newly shipped overlay stays OFF by
 *   default instead of silently enabling itself for existing users.
 */
function filterLayerTree(
    t: LayerTreeType,
    allowed: LayerTreeType | undefined,
    fillWithFalse = false
): LayerTreeType {
    const filtered: LayerTreeType = {};
    if (allowed) {
        Object.entries(allowed).forEach(([key, value]) => {
            if (Object.hasOwn(t, key)) {
                if (typeof value === 'boolean') {
                    filtered[key] = t[key];
                } else if (typeof value === 'object') {
                    filtered[key] = filterLayerTree(
                        typeof t[key] === 'object' ? t[key] : {},
                        value,
                        fillWithFalse
                    );
                }
            } else if (fillWithFalse) {
                // Present in the allow-list but missing from the stored value:
                // default it OFF rather than inheriting the allow-list value.
                filtered[key] =
                    typeof value === 'boolean' ? false : filterLayerTree({}, value, true);
            } else {
                filtered[key] = value;
            }
        });
    }
    Object.entries(t).forEach(([key, value]) => {
        if (!Object.hasOwn(filtered, key)) {
            if (typeof value === 'boolean') {
                if (key.startsWith('custom-') || key.startsWith('extension-')) {
                    filtered[key] = value;
                }
            } else if (typeof value === 'object') {
                filtered[key] = filterLayerTree(value, undefined);
            }
        }
    });
    return filtered;
}

export function getLayerTreeValidator(allowed: LayerTreeType, fillWithFalse = false) {
    return (value: LayerTreeType) => filterLayerTree(value, allowed, fillWithFalse);
}

type DistanceUnits = 'metric' | 'imperial' | 'nautical';
type VelocityUnits = 'speed' | 'pace';
type TemperatureUnits = 'celsius' | 'fahrenheit';
type AdditionalDataset = 'speed' | 'hr' | 'cad' | 'atemp' | 'power';
type ElevationFill = 'slope' | 'surface' | 'highway' | undefined;
type RoutingProfile =
    | 'bike'
    | 'racing_bike'
    | 'gravel_bike'
    | 'mountain_bike'
    | 'foot'
    | 'motorcycle'
    | 'water'
    | 'railway';
type TerrainSource = 'terrarium';

export const settings = {
    distanceUnits: new Setting<DistanceUnits>(
        'distanceUnits',
        'metric',
        getValueValidator<DistanceUnits>(['metric', 'imperial', 'nautical'], 'metric')
    ),
    velocityUnits: new Setting<VelocityUnits>(
        'velocityUnits',
        'speed',
        getValueValidator<VelocityUnits>(['speed', 'pace'], 'speed')
    ),
    temperatureUnits: new Setting<TemperatureUnits>(
        'temperatureUnits',
        'celsius',
        getValueValidator<TemperatureUnits>(['celsius', 'fahrenheit'], 'celsius')
    ),
    elevationProfile: new Setting<boolean>('elevationProfile', true),
    additionalDatasets: new Setting<AdditionalDataset[]>(
        'additionalDatasets',
        [],
        getArrayValidator<AdditionalDataset>(['speed', 'hr', 'cad', 'atemp', 'power'])
    ),
    elevationFill: new Setting<ElevationFill>(
        'elevationFill',
        undefined,
        getValueValidator(['slope', 'surface', 'highway', undefined], undefined)
    ),
    minimizeRoutingMenu: new Setting('minimizeRoutingMenu', false),
    showAdvancedTools: new Setting('showAdvancedTools', false),
    routing: new Setting('routing', true),
    routingProfile: new Setting<RoutingProfile>(
        'routingProfile',
        'bike',
        getValueValidator<RoutingProfile>(
            [
                'bike',
                'racing_bike',
                'gravel_bike',
                'mountain_bike',
                'foot',
                'motorcycle',
                'water',
                'railway',
            ],
            'bike'
        )
    ),
    currentBasemap: new Setting(
        'currentBasemap',
        defaultBasemap,
        getLayerValidator(basemaps, defaultBasemap)
    ),
    previousBasemap: new Setting(
        'previousBasemap',
        defaultBasemap,
        getLayerValidator(basemaps, defaultBasemap)
    ),
    selectedBasemapTree: new Setting(
        'selectedBasemapTree',
        defaultBasemapTree,
        getLayerTreeValidator(defaultBasemapTree)
    ),
    currentOverlays: new SettingInitOnFirstRead(
        'currentOverlays',
        defaultOverlays,
        // fillWithFalse: a newly shipped overlay stays OFF for returning users
        // instead of inheriting the allow-list's `true`.
        getLayerTreeValidator(defaultOverlayTree, true)
    ),
    previousOverlays: new Setting(
        'previousOverlays',
        defaultOverlays,
        getLayerTreeValidator(defaultOverlayTree, true)
    ),
    selectedOverlayTree: new Setting(
        'selectedOverlayTree',
        defaultOverlayTree,
        getLayerTreeValidator(defaultOverlayTree)
    ),
    opacities: new Setting('opacities', defaultOpacities),
    customLayers: new Setting<Record<string, CustomLayer>>('customLayers', {}),
    customBasemapOrder: new Setting<string[]>('customBasemapOrder', []),
    customOverlayOrder: new Setting<string[]>('customOverlayOrder', []),
    terrainSource: new Setting<TerrainSource>(
        'terrainSource',
        defaultTerrainSource,
        getValueValidator(['terrarium'], defaultTerrainSource)
    ),
    directionMarkers: new Setting('directionMarkers', false),
    distanceMarkers: new Setting('distanceMarkers', false),
    /**
     * Whether alternative tracks are shown (the eye toggle in the track pane header
     * and in the planning view's track list). Hidden by default: only the official
     * traces show until the user opts in to see the alternatives.
     */
    showAlternativesOnMap: new Setting('showAlternativesOnMap', false),
    fileOrder: new Setting<string[]>('fileOrder', []),
    defaultOpacity: new Setting('defaultOpacity', 0.7),
    defaultWidth: new Setting('defaultWidth', browser && window.innerWidth < 600 ? 8 : 5),
    /** Height in pixels of the track-info panel (statistics + elevation profile). */
    bottomPanelSize: new Setting('bottomPanelSize', 260),
    /** Whether the track-info panel (statistics + elevation profile) is expanded. Collapsed by default. */
    bottomPanelVisible: new Setting('bottomPanelVisible', false),
    /** Width in pixels of the permanent library panel on the left. */
    leftPanelSize: new Setting('leftPanelSize', 300),
    /** Height in pixels of the track list pane at the bottom of the library panel. */
    libraryTracksPanelSize: new Setting('libraryTracksPanelSize', 260),
    connectToDatabase(db: Database) {
        for (const key in settings) {
            const setting = (settings as any)[key];
            if (setting instanceof Setting || setting instanceof SettingInitOnFirstRead) {
                setting.connectToDatabase(db);
            }
        }
    },
    disconnectFromDatabase() {
        for (const key in settings) {
            const setting = (settings as any)[key];
            if (setting instanceof Setting || setting instanceof SettingInitOnFirstRead) {
                setting.disconnectFromDatabase();
            }
        }
    },
    initialize() {
        for (const key in settings) {
            const setting = (settings as any)[key];
            if (setting instanceof SettingInitOnFirstRead) {
                setting.initialize();
            }
        }
    },
};
