/**
 * The local library: organizes tracks into Adventures, and adventures into
 * (nestable) Expeditions. Everything lives in IndexedDB next to the files
 * themselves; cloud synchronization of this hierarchy arrives in a later
 * phase and will treat these tables as the working copy.
 *
 * Invariants:
 * - A track (GPX file) is placed in at most one adventure; tracks without a
 *   placement belong to the implicit "Unsorted" section of the panel.
 * - An adventure belongs to at most one expedition (or lives at the root).
 * - An expedition may nest inside another expedition (or live at the root).
 * - Placements never point at deleted files: a pruner watches the file table
 *   and removes orphaned placements (file ids are recycled by the editor, so
 *   stale placements would otherwise mis-file future tracks).
 */
import { liveQuery } from 'dexie';
import { readable, writable, get, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';

/** A nestable group of adventures. `parentId` is another expedition id or null for root. */
export type Expedition = {
    id: string;
    name: string;
    parentId: string | null;
};

/** A set of tracks. `expeditionId` is the containing expedition or null for root. */
export type Adventure = {
    id: string;
    name: string;
    expeditionId: string | null;
};

/** Assignment of one track (GPX file id) to one adventure. */
export type TrackPlacement = {
    fileId: string;
    adventureId: string;
};

/** Wraps a Dexie liveQuery as a Svelte store (empty initial value during SSR). */
function liveStore<T>(query: () => Promise<T> | T, initial: T): Readable<T> {
    return readable(initial, (set) => {
        if (!browser) return;
        const subscription = liveQuery(query).subscribe({ next: set });
        return () => subscription.unsubscribe();
    });
}

/** All expeditions, live from the database. */
export const expeditions = liveStore<Expedition[]>(() => db.expeditions.toArray(), []);

/** All adventures, live from the database. */
export const adventures = liveStore<Adventure[]>(() => db.adventures.toArray(), []);

/** Track placements as a fileId → adventureId map, live from the database. */
export const trackPlacements = liveStore<Map<string, string>>(
    async () => new Map((await db.trackPlacements.toArray()).map((p) => [p.fileId, p.adventureId])),
    new Map()
);

/**
 * The adventure currently highlighted in the library panel. New and imported
 * tracks are placed here automatically; null sends them to "Unsorted".
 */
export const selectedAdventureId = writable<string | null>(null);

/** Creates an expedition (optionally nested) and returns its id. */
export async function createExpedition(parentId: string | null, name: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.expeditions.put({ id, name, parentId });
    return id;
}

/** Creates an adventure (optionally inside an expedition) and returns its id. */
export async function createAdventure(expeditionId: string | null, name: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.adventures.put({ id, name, expeditionId });
    return id;
}

export async function renameExpedition(id: string, name: string): Promise<void> {
    await db.expeditions.update(id, { name });
}

export async function renameAdventure(id: string, name: string): Promise<void> {
    await db.adventures.update(id, { name });
}

/**
 * Deletes an expedition. Its contents are not deleted: nested expeditions and
 * adventures are re-parented to the deleted expedition's parent.
 */
export async function deleteExpedition(id: string): Promise<void> {
    await db.transaction('rw', db.expeditions, db.adventures, async () => {
        const expedition = await db.expeditions.get(id);
        const newParent = expedition?.parentId ?? null;
        await db.expeditions.where('id').equals(id).delete();
        await Promise.all([
            db.expeditions.filter((e) => e.parentId === id).modify({ parentId: newParent }),
            db.adventures.filter((a) => a.expeditionId === id).modify({ expeditionId: newParent }),
        ]);
    });
}

/**
 * Deletes an adventure. Its tracks are not deleted: their placements are
 * removed, which returns them to "Unsorted".
 */
export async function deleteAdventure(id: string): Promise<void> {
    await db.transaction('rw', db.adventures, db.trackPlacements, async () => {
        await db.adventures.where('id').equals(id).delete();
        await db.trackPlacements.filter((p) => p.adventureId === id).delete();
    });
    selectedAdventureId.update((selected) => (selected === id ? null : selected));
}

/** Places tracks in an adventure (or back in "Unsorted" when adventureId is null). */
export async function placeTracks(fileIds: string[], adventureId: string | null): Promise<void> {
    if (adventureId === null) {
        await db.trackPlacements.bulkDelete(fileIds);
    } else {
        await db.trackPlacements.bulkPut(fileIds.map((fileId) => ({ fileId, adventureId })));
    }
}

if (browser) {
    // Auto-place newly created files (new track, import, duplicate, paste)
    // into the currently selected adventure. The Dexie 'creating' hook fires
    // for every new file key; the placement is written after the file
    // transaction completes to avoid interfering with it.
    db.files.hook('creating', (primaryKey) => {
        const adventureId = get(selectedAdventureId);
        if (typeof primaryKey === 'string' && adventureId !== null) {
            setTimeout(() => {
                db.trackPlacements
                    .get(primaryKey)
                    .then((existing) => {
                        if (!existing) {
                            return db.trackPlacements.put({ fileId: primaryKey, adventureId });
                        }
                    })
                    .catch(() => {
                        // A failed auto-placement only means the track lands in Unsorted.
                    });
            });
        }
    });

    // Prune placements whose file no longer exists. Runs on every change to
    // the file id list; reads the current ids inside the transaction so a
    // concurrent creation cannot be mistaken for an orphan.
    liveQuery(() => db.fileids.toArray()).subscribe({
        next: () => {
            db.transaction('rw', db.fileids, db.trackPlacements, async () => {
                const existing = new Set(await db.fileids.toArray());
                const orphans = (await db.trackPlacements.toArray())
                    .filter((placement) => !existing.has(placement.fileId))
                    .map((placement) => placement.fileId);
                if (orphans.length > 0) {
                    await db.trackPlacements.bulkDelete(orphans);
                }
            }).catch(() => {
                // Pruning retries on the next file-list change.
            });
        },
    });
}
