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
 * - v3: backfills the per-adventure `advancedMode` flag (no schema change),
 *   turning it on for adventures that already carry advanced data so the
 *   advanced features keep showing after the "simple by default" change.
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
        // Backfill only: no indexed field changes, so the stores carry forward
        // unchanged. Runs once, inside the upgrade transaction, before any
        // liveQuery resolves, so the flag is already correct on first render.
        this.version(3).upgrade(async (tx) => {
            const placements = await tx.table('trackPlacements').toArray();
            const adventuresWithTrackData = new Set<string>();
            for (const placement of placements) {
                if (placement.alternative === true || (placement.bufferDays ?? 0) > 0) {
                    adventuresWithTrackData.add(placement.adventureId);
                }
            }
            await tx
                .table('adventures')
                .toCollection()
                .modify((adventure) => {
                    if (
                        (adventure.numbering && adventure.numbering !== 'none') ||
                        (adventure.planDoc && adventure.planDoc.trim().length > 0) ||
                        adventuresWithTrackData.has(adventure.id)
                    ) {
                        adventure.advancedMode = true;
                    }
                });
        });
    }
}

export const db = new Database();
