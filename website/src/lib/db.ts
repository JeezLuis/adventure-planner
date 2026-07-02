import Dexie from 'dexie';
import type { GPXFile } from 'gpx';
import { enableMapSet, enablePatches, type Patch } from 'immer';
import type { Expedition, Adventure, TrackPlacement } from '$lib/library/library';

enableMapSet();
enablePatches();

/**
 * Local persistence (IndexedDB via Dexie). This is the app's working copy:
 * open GPX files, their undo/redo patch history, user settings, and the
 * library hierarchy (expeditions ▸ adventures ▸ track placements).
 *
 * Version history:
 * - v1 (upstream): fileids/files/patches/settings + Overpass POI caches.
 * - v2: adds the library tables (expeditions, adventures, trackPlacements)
 *   and drops the Overpass caches (the POI feature was removed).
 */
export class Database extends Dexie {
    fileids!: Dexie.Table<string, string>;
    files!: Dexie.Table<GPXFile, string>;
    patches!: Dexie.Table<{ patch: Patch[]; inversePatch: Patch[]; index: number }, number>;
    settings!: Dexie.Table<any, string>;
    expeditions!: Dexie.Table<Expedition, string>;
    adventures!: Dexie.Table<Adventure, string>;
    trackPlacements!: Dexie.Table<TrackPlacement, string>;

    constructor() {
        super('Database', {
            cache: 'immutable',
        });
        this.version(1).stores({
            fileids: ',&fileid',
            files: '',
            patches: ',patch',
            settings: '',
            overpasstiles: '[query+x+y],[x+y]',
            overpassdata: '[query+id]',
        });
        this.version(2).stores({
            expeditions: '&id',
            adventures: '&id',
            trackPlacements: '&fileId',
            overpasstiles: null,
            overpassdata: null,
        });
    }
}

export const db = new Database();
