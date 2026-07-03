import { describe, expect, it, vi, beforeEach } from 'vitest';

// file-action-manager imports the i18n rune module and svelte-sonner for its
// failure toast; stub both so the module loads and runs in Node.
vi.mock('$lib/i18n.svelte', () => ({ i18n: { _: (key: string, fallback?: string) => fallback ?? key } }));
vi.mock('svelte-sonner', () => ({
    toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

import { get } from 'svelte/store';
import { freeze } from 'immer';
import { GPXFile } from 'gpx';
import { db } from '$lib/db';
import { FileActionManager } from '$lib/logic/file-action-manager';

/**
 * Locks the undo/redo engine rewritten in the robustness pass (A2/A3): one
 * atomic transaction per action, synchronous patch-pointer state, redo-stack
 * truncation on a fresh edit, and MAX_PATCHES history eviction.
 */

const tick = () => new Promise((r) => setTimeout(r, 25));

async function clearDb() {
    await db.transaction('rw', db.files, db.fileids, db.patches, db.settings, async () => {
        await Promise.all([db.files.clear(), db.fileids.clear(), db.patches.clear(), db.settings.clear()]);
    });
}

function makeFile(id: string): GPXFile {
    const file = new GPXFile();
    file._data.id = id;
    file.metadata.name = id;
    return file;
}

let manager: FileActionManager;

beforeEach(async () => {
    await clearDb();
    // A fresh manager starts its patch pointer at -1 and re-reads the (cleared)
    // persisted state, giving each test an isolated history.
    manager = new FileActionManager(db);
    await tick();
});

async function add(id: string) {
    await manager.applyGlobal((draft) => draft.set(id, freeze(makeFile(id))));
}

describe('applyGlobal + commit', () => {
    it('writes the file, stores one patch, and advances the pointer', async () => {
        await add('gpx-0');
        expect(await db.files.count()).toBe(1);
        expect(await db.fileids.count()).toBe(1);
        expect(await db.patches.count()).toBe(1);
        expect(await db.settings.get('patchIndex')).toBe(0);
        expect(get(manager.canUndo)).toBe(true);
        expect(get(manager.canRedo)).toBe(false);
    });

    it('does not store a patch when the callback changes nothing', async () => {
        await manager.applyGlobal(() => {
            /* no-op */
        });
        expect(await db.patches.count()).toBe(0);
        expect(get(manager.canUndo)).toBe(false);
    });
});

describe('undo / redo', () => {
    it('round-trips the file set and the pointer', async () => {
        await add('gpx-0');
        await add('gpx-1');
        expect(await db.files.count()).toBe(2);

        await manager.undo();
        expect(await db.files.count()).toBe(1);
        expect(await db.settings.get('patchIndex')).toBe(0);
        expect(get(manager.canRedo)).toBe(true);

        await manager.undo();
        expect(await db.files.count()).toBe(0);
        expect(get(manager.canUndo)).toBe(false);

        await manager.redo();
        expect(await db.files.count()).toBe(1);
        await manager.redo();
        expect(await db.files.count()).toBe(2);
        expect(get(manager.canRedo)).toBe(false);
    });

    it('truncates the redo stack when a new edit follows an undo', async () => {
        await add('gpx-0');
        await add('gpx-1');
        await manager.undo(); // back to just gpx-0, gpx-1 is redoable
        expect(get(manager.canRedo)).toBe(true);

        await add('gpx-2'); // new edit must drop the redo branch
        expect(get(manager.canRedo)).toBe(false);
        expect(await db.patches.count()).toBe(2); // gpx-0 and gpx-2, not gpx-1
        expect(await db.files.get('gpx-1')).toBeUndefined();
        expect(await db.files.get('gpx-2')).toBeDefined();
    });
});

describe('MAX_PATCHES eviction', () => {
    it('caps the stored history at 100 patches', async () => {
        for (let i = 0; i < 101; i++) {
            await add(`gpx-${i}`);
        }
        expect(await db.patches.count()).toBe(100);
        // The oldest patch (index 0) was evicted, so its file can no longer be
        // undone away: undoing to the floor leaves exactly that one file.
        for (let i = 0; i < 100; i++) {
            await manager.undo();
        }
        expect(get(manager.canUndo)).toBe(false);
        expect(await db.files.count()).toBe(1);
    });
});
