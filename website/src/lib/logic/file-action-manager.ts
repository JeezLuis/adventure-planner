import { db, type Database } from '$lib/db';
import { liveQuery } from 'dexie';
import type { GPXFile } from 'gpx';
import { applyPatches, produceWithPatches, type Patch, type WritableDraft } from 'immer';
import { GPXFileStateCollectionObserver } from '$lib/logic/file-state';
import {
    derived,
    get,
    writable,
    type Readable,
    type Unsubscriber,
    type Writable,
} from 'svelte/store';
import { selection } from '$lib/logic/selection';
import { i18n } from '$lib/i18n.svelte';
import { toast } from 'svelte-sonner';

const MAX_PATCHES = 100;

export class FileActionManager {
    private _db: Database;
    private _files: Map<string, GPXFile>;
    private _fileSubscriptions: Map<string, Unsubscriber>;
    private _fileStateCollectionObserver: GPXFileStateCollectionObserver;
    private _patchIndex: Writable<number>;
    private _patchMinIndex: Writable<number>;
    private _patchMaxIndex: Writable<number>;
    private _canUndo: Readable<boolean>;
    private _canRedo: Readable<boolean>;
    // Every mutating operation is appended to this chain so a commit and its
    // patch bookkeeping fully complete before the next one begins. Without it,
    // rapid edits or repeated undo could read a patch index that had not yet
    // caught up through IndexedDB and double-apply or clobber history.
    private _writeQueue: Promise<unknown> = Promise.resolve();
    private _channel: BroadcastChannel | undefined;

    constructor(db: Database) {
        this._db = db;
        this._files = new Map();
        this._fileSubscriptions = new Map();
        this._fileStateCollectionObserver = new GPXFileStateCollectionObserver(
            (newFiles) => {
                newFiles.forEach((fileState, fileId) => {
                    this._fileSubscriptions.set(
                        fileId,
                        fileState.subscribe((fileWithStatistics) => {
                            if (fileWithStatistics) {
                                this._files.set(fileId, fileWithStatistics.file);
                            }
                        })
                    );
                });
            },
            (fileId) => {
                let unsubscribe = this._fileSubscriptions.get(fileId);
                if (unsubscribe) {
                    unsubscribe();
                    this._fileSubscriptions.delete(fileId);
                }
                this._files.delete(fileId);
            },
            () => {
                this._fileSubscriptions.forEach((unsubscribe) => unsubscribe());
                this._fileSubscriptions.clear();
                this._files.clear();
            }
        );

        this._patchIndex = writable(-1);
        this._patchMinIndex = writable(0);
        this._patchMaxIndex = writable(0);

        // The persisted values are also the cross-tab signal: a write from another
        // tab surfaces here and keeps the pointer in sync (best-effort; see the
        // BroadcastChannel guard below and R4 in the tech-debt plan).
        liveQuery(() => db.settings.get('patchIndex')).subscribe((value) => {
            if (value !== undefined) {
                this._patchIndex.set(value);
            }
        });
        liveQuery(() =>
            (db.patches.orderBy(':id').keys() as Promise<number[]>).then((keys) => {
                if (keys.length === 0) {
                    return { min: 0, max: 0 };
                } else {
                    return { min: keys[0], max: keys[keys.length - 1] + 1 };
                }
            })
        ).subscribe((value) => {
            this._patchMinIndex.set(value.min);
            this._patchMaxIndex.set(value.max);
        });

        this._canUndo = derived(
            [this._patchIndex, this._patchMinIndex],
            ([$patchIndex, $patchMinIndex]) => {
                return $patchIndex >= $patchMinIndex;
            }
        );
        this._canRedo = derived(
            [this._patchIndex, this._patchMaxIndex],
            ([$patchIndex, $patchMaxIndex]) => {
                return $patchIndex < $patchMaxIndex - 1;
            }
        );

        this.setupCrossTabGuard();
    }

    get canUndo(): Readable<boolean> {
        return this._canUndo;
    }

    get canRedo(): Readable<boolean> {
        return this._canRedo;
    }

    undo() {
        return this.enqueue(async () => {
            const patchIndex = get(this._patchIndex);
            if (patchIndex < get(this._patchMinIndex)) {
                return;
            }
            const patch = await this._db.patches.get(patchIndex);
            if (patch) {
                await this.applyPatchAndPersist(patch.inversePatch, patchIndex - 1);
            }
        });
    }

    redo() {
        return this.enqueue(async () => {
            const patchIndex = get(this._patchIndex) + 1;
            if (patchIndex >= get(this._patchMaxIndex)) {
                return;
            }
            const patch = await this._db.patches.get(patchIndex);
            if (patch) {
                await this.applyPatchAndPersist(patch.patch, patchIndex);
            }
        });
    }

    applyGlobal(callback: (files: Map<string, GPXFile>) => void) {
        return this.enqueue(async () => {
            const [newFileCollection, patch, inversePatch] = produceWithPatches(
                this._files,
                callback
            );
            await this.commitMutation(newFileCollection, patch, inversePatch);
        });
    }

    applyToFiles(fileIds: string[], callback: (file: WritableDraft<GPXFile>) => void) {
        return this.enqueue(async () => {
            const [newFileCollection, patch, inversePatch] = produceWithPatches(
                this._files,
                (draft) => {
                    fileIds.forEach((fileId) => {
                        let file = draft.get(fileId);
                        if (file) {
                            callback(file);
                        }
                    });
                }
            );
            await this.commitMutation(newFileCollection, patch, inversePatch);
        });
    }

    applyToFile(fileId: string, callback: (file: WritableDraft<GPXFile>) => void) {
        return this.applyToFiles([fileId], callback);
    }

    applyEachToFilesAndGlobal(
        fileIds: string[],
        callbacks: ((file: WritableDraft<GPXFile>, context?: any) => void)[],
        globalCallback: (files: Map<string, GPXFile>, context?: any) => void,
        context?: any
    ) {
        return this.enqueue(async () => {
            const [newFileCollection, patch, inversePatch] = produceWithPatches(
                this._files,
                (draft) => {
                    fileIds.forEach((fileId, index) => {
                        let file = draft.get(fileId);
                        if (file) {
                            callbacks[index](file, context);
                        }
                    });
                    globalCallback(draft, context);
                }
            );
            await this.commitMutation(newFileCollection, patch, inversePatch);
        });
    }

    /** Serialize a mutating operation after all previously-queued ones. */
    private enqueue<T>(op: () => Promise<T>): Promise<T> {
        const run = this._writeQueue.then(op, op);
        // Keep the chain alive regardless of individual failures.
        this._writeQueue = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    }

    /**
     * Persist a produced mutation: file rows, the new patch, and the advanced
     * patch pointer are written in ONE transaction. On success the in-memory
     * state (patch index, bounds, file map, selection) is updated synchronously
     * so the next queued operation sees it. On failure nothing is advanced and
     * the user is told, instead of silently losing the edit.
     */
    private async commitMutation(
        newFileCollection: ReadonlyMap<string, GPXFile>,
        patch: Patch[],
        inversePatch: Patch[]
    ) {
        if (patch.length === 0) {
            // The callback changed nothing: do not push an empty patch onto the
            // undo stack.
            return;
        }
        const prevIndex = get(this._patchIndex);
        const nextIndex = prevIndex + 1;
        const { updatedFiles, updatedFileIds, deletedFileIds } = this.computeChanges(
            newFileCollection,
            patch
        );
        let newMin = get(this._patchMinIndex);
        try {
            // @ts-ignore Dexie infers KeyPaths<GPXFile>, which recurses infinitely
            // on GPXFile's deep tree type; unavoidable while db.files stores GPXFile.
            await this._db.transaction(
                'rw',
                this._db.fileids,
                this._db.files,
                this._db.patches,
                this._db.settings,
                async () => {
                    // Drop any redo-stack patches beyond the current pointer.
                    await this._db.patches.where(':id').above(prevIndex).delete();
                    if (updatedFileIds.length > 0) {
                        await this._db.fileids.bulkPut(updatedFileIds, updatedFileIds);
                        await this._db.files.bulkPut(updatedFiles, updatedFileIds);
                    }
                    if (deletedFileIds.length > 0) {
                        await this._db.fileids.bulkDelete(deletedFileIds);
                        await this._db.files.bulkDelete(deletedFileIds);
                    }
                    await this._db.patches.put({ patch, inversePatch, index: nextIndex }, nextIndex);
                    // Enforce the history cap, keeping the newest MAX_PATCHES.
                    const keys = (await this._db.patches.orderBy(':id').keys()) as number[];
                    if (keys.length > MAX_PATCHES) {
                        await this._db.patches.bulkDelete(keys.slice(0, keys.length - MAX_PATCHES));
                        newMin = keys[keys.length - MAX_PATCHES];
                    } else if (keys.length > 0) {
                        newMin = keys[0];
                    }
                    await this._db.settings.put(nextIndex, 'patchIndex');
                }
            );
        } catch (e) {
            this.notifyWriteError(e);
            return;
        }

        this._patchIndex.set(nextIndex);
        this._patchMinIndex.set(newMin);
        this._patchMaxIndex.set(nextIndex + 1);
        this.reconcileFiles(newFileCollection, updatedFileIds, deletedFileIds);
        selection.updateFiles(updatedFiles, deletedFileIds);
    }

    /**
     * Apply an undo/redo patch to the file rows and move the pointer, all in one
     * transaction. If the patch itself cannot be applied, the history is reset
     * so undo degrades gracefully rather than wedging permanently.
     */
    private async applyPatchAndPersist(patch: Patch[], newIndex: number) {
        let newFileCollection: ReadonlyMap<string, GPXFile>;
        try {
            newFileCollection = applyPatches(this._files, patch);
        } catch (e) {
            await this.resetHistory();
            this.notifyWriteError(e);
            return;
        }
        const { updatedFiles, updatedFileIds, deletedFileIds } = this.computeChanges(
            newFileCollection,
            patch
        );
        try {
            await this._db.transaction(
                'rw',
                this._db.fileids,
                this._db.files,
                this._db.settings,
                async () => {
                    if (updatedFileIds.length > 0) {
                        await this._db.fileids.bulkPut(updatedFileIds, updatedFileIds);
                        await this._db.files.bulkPut(updatedFiles, updatedFileIds);
                    }
                    if (deletedFileIds.length > 0) {
                        await this._db.fileids.bulkDelete(deletedFileIds);
                        await this._db.files.bulkDelete(deletedFileIds);
                    }
                    await this._db.settings.put(newIndex, 'patchIndex');
                }
            );
        } catch (e) {
            this.notifyWriteError(e);
            return;
        }

        this._patchIndex.set(newIndex);
        this.reconcileFiles(newFileCollection, updatedFileIds, deletedFileIds);
        selection.updateFiles(updatedFiles, deletedFileIds);
    }

    /** Wipe the undo/redo history after an unrecoverable patch failure. */
    private async resetHistory() {
        try {
            await this._db.transaction('rw', this._db.patches, this._db.settings, async () => {
                await this._db.patches.clear();
                await this._db.settings.put(-1, 'patchIndex');
            });
        } catch {
            // Best effort: even if the reset write fails, clear the in-memory
            // pointers below so the UI stops offering a broken undo.
        }
        this._patchIndex.set(-1);
        this._patchMinIndex.set(0);
        this._patchMaxIndex.set(0);
    }

    private computeChanges(newFileCollection: ReadonlyMap<string, GPXFile>, patch: Patch[]) {
        const changedFileIds = getChangedFileIds(patch);
        const updatedFileIds: string[] = [];
        const deletedFileIds: string[] = [];
        changedFileIds.forEach((id) => {
            if (newFileCollection.has(id)) {
                updatedFileIds.push(id);
            } else {
                deletedFileIds.push(id);
            }
        });
        const updatedFiles = updatedFileIds
            .map((id) => newFileCollection.get(id))
            .filter((file): file is GPXFile => file !== undefined);
        return {
            updatedFiles,
            updatedFileIds: updatedFiles.map((file) => file._data.id),
            deletedFileIds,
        };
    }

    /**
     * Update the authoritative in-memory file map synchronously at commit time,
     * so the next produce/apply builds on the latest state instead of waiting
     * for the IndexedDB liveQuery round-trip (which still fires and re-affirms
     * the same values, and carries external/cross-tab changes).
     */
    private reconcileFiles(
        newFileCollection: ReadonlyMap<string, GPXFile>,
        updatedFileIds: string[],
        deletedFileIds: string[]
    ) {
        updatedFileIds.forEach((id) => {
            const file = newFileCollection.get(id);
            if (file) {
                this._files.set(id, file);
            }
        });
        deletedFileIds.forEach((id) => this._files.delete(id));
    }

    private notifyWriteError(error: unknown) {
        console.error('Adventure Planner: failed to persist changes', error);
        toast.error(
            i18n._(
                'menu.save_error',
                'Could not save your changes - your browser storage may be full or unavailable'
            )
        );
    }

    /**
     * Warn when the app is open (and editing) in more than one tab: concurrent
     * writers share one IndexedDB and can clobber each other's history. A
     * lightweight signal until the PocketBase sync phase adds authoritative
     * single-writer coordination.
     */
    private setupCrossTabGuard() {
        if (typeof BroadcastChannel === 'undefined') {
            return;
        }
        try {
            this._channel = new BroadcastChannel('adventure-planner-writer');
            let warned = false;
            this._channel.onmessage = (event) => {
                if (event.data === 'active' && !warned) {
                    warned = true;
                    toast.warning(
                        i18n._(
                            'menu.multiple_tabs_warning',
                            'Adventure Planner is open in another tab. Editing in more than one tab at a time can lose changes.'
                        )
                    );
                }
            };
            this._channel.postMessage('active');
        } catch {
            // BroadcastChannel unavailable in this environment: skip the guard.
        }
    }
}

// Get the file ids of the files that have changed in the patch
function getChangedFileIds(patch: Patch[]): string[] {
    let changedFileIds = new Set<string>();
    for (let p of patch) {
        changedFileIds.add(p.path[0] as string);
    }
    return Array.from(changedFileIds);
}

export const fileActionManager = new FileActionManager(db);
