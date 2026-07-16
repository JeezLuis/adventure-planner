/**
 * The local library: organizes tracks into Adventures, and adventures into
 * (nestable) Expeditions. Everything lives in IndexedDB next to the files
 * themselves; cloud synchronization of this hierarchy arrives in a later
 * phase and will treat these tables as the working copy.
 *
 * Invariants:
 * - Every track (GPX file) lives in exactly one adventure. There is no
 *   "Unsorted" bucket: importing always targets an adventure - either as a
 *   track inside the selected adventure, or as a whole new adventure whose
 *   tracks are the file's sections (see the two import actions in
 *   file-actions.ts). The pruner below keeps placements honest.
 * - An adventure belongs to at most one expedition (or lives at the root).
 * - An expedition may nest inside another expedition (or live at the root),
 *   but never inside itself or one of its descendants.
 * - Placements never point at deleted files: a pruner watches the file table
 *   and removes orphaned placements (file ids are recycled by the editor, so
 *   stale placements would otherwise mis-file future tracks).
 */
import { liveQuery } from 'dexie';
import { derived, readable, writable, get, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { selection as editorSelection } from '$lib/logic/selection';
import { settings } from '$lib/logic/settings';

/**
 * When true (the app), the map only renders tracks that are in the current
 * library selection. Embed mode has no library, so it turns this off to draw
 * the files it was handed directly - otherwise `visibleFileIds` is empty and
 * the embed map stays blank (see R5 in the tech-debt plan).
 */
export const libraryGatingEnabled = writable(true);

/** A nestable group of adventures. `parentId` is another expedition id or null for root. */
export type Expedition = {
    id: string;
    name: string;
    parentId: string | null;
    /** Manual position among siblings; missing on rows from before ordering existed. */
    order?: number;
    /** Free-form notes about the expedition. */
    description?: string;
};

/**
 * How the tracks of an adventure are tagged in the track pane, following
 * their order inside the adventure: not at all, with a sequential stage
 * number, or with the calendar day of that stage.
 */
export type TrackNumbering = 'none' | 'numbers' | 'date';

/** A set of tracks. `expeditionId` is the containing expedition or null for root. */
export type Adventure = {
    id: string;
    name: string;
    expeditionId: string | null;
    /** Manual position among siblings; missing on rows from before ordering existed. */
    order?: number;
    /** Free-form notes about the adventure. */
    description?: string;
    /** Track tagging mode; missing means 'none'. */
    numbering?: TrackNumbering;
    /** First day of the trip as ISO yyyy-mm-dd; required by the 'date' mode. */
    startDate?: string;
    /** Render date tags as dd/mm/yyyy instead of dd/mm. */
    showYear?: boolean;
    /**
     * The adventure's planning document as Markdown (notes, checklists, tables).
     * Authored in the planning view and serialized to standard `<metadata><desc>`
     * on adventure export, so it round-trips and stays readable in other apps.
     * Distinct from {@link Adventure.description}, which stays app-private in `ap:data`.
     */
    planDoc?: string;
    /**
     * Advanced-mode gate. Missing/false = SIMPLE: track numbering, trip dates,
     * alternate tracks and the plan view are all hidden, keeping the adventure
     * approachable. Turning it on unlocks those features; turning it off again
     * permanently clears their data (see {@link disableAdvancedMode}). A simple
     * adventure must never hold advanced data, so nothing renders unexpectedly.
     */
    advancedMode?: boolean;
};

/** Sorts expeditions or adventures by their manual position. */
export function sortByOrder<T extends { order?: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** The order value that places an item at the end of a sibling list. */
function orderAtEnd(siblings: { order?: number }[]): number {
    return siblings.reduce((max, sibling) => Math.max(max, sibling.order ?? 0), 0) + 1;
}

/**
 * The order value that places an item just before or after a sibling,
 * halfway between it and its neighbor so nothing else needs renumbering.
 */
export function orderRelativeTo<T extends { id: string; order?: number }>(
    siblings: T[],
    targetId: string,
    before: boolean
): number {
    const sorted = sortByOrder(siblings);
    const index = sorted.findIndex((sibling) => sibling.id === targetId);
    if (index === -1) {
        return orderAtEnd(sorted);
    }
    const target = sorted[index].order ?? 0;
    const neighbor = before ? sorted[index - 1] : sorted[index + 1];
    if (neighbor === undefined) {
        return target + (before ? -1 : 1);
    }
    return (target + (neighbor.order ?? 0)) / 2;
}

/** Assignment of one track (GPX file id) to one adventure. */
export type TrackPlacement = {
    fileId: string;
    adventureId: string;
    /**
     * Extra days spent after this track before the next one starts (a rest
     * day, slack for a border crossing...). Only meaningful under the 'date'
     * numbering: the dates of the following tracks shift by this amount.
     */
    bufferDays?: number;
    /**
     * Marks the track as an alternative (a backup variant of another track
     * of the adventure): the numbering skips it and tags it ALT instead, and
     * the map renders it dotted and faded (or hides it, see the
     * showAlternativesOnMap setting). Only meaningful while the adventure
     * numbers its tracks.
     */
    alternative?: boolean;
};

/**
 * Whether an adventure already carries advanced-mode data: a numbering, a plan
 * document, or any track marked as an alternative or given buffer days. Used to
 * decide the advanced-mode flag when it is not set explicitly (the backfill
 * migration for libraries predating the flag, and adventure import), so that
 * existing power-user data is never hidden. Pure and side-effect free.
 */
export function hasAdvancedData(
    adventure: Pick<Adventure, 'numbering' | 'planDoc'>,
    placements: Pick<TrackPlacement, 'alternative' | 'bufferDays'>[]
): boolean {
    return (
        (adventure.numbering !== undefined && adventure.numbering !== 'none') ||
        (adventure.planDoc !== undefined && adventure.planDoc.trim().length > 0) ||
        placements.some((p) => p.alternative === true || (p.bufferDays ?? 0) > 0)
    );
}

/**
 * One selectable row of the library tree: an adventure or an expedition
 * (standing for everything nested below it).
 */
export type LibrarySelectionItem =
    | { kind: 'expedition'; id: string }
    | { kind: 'adventure'; id: string };

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

/** Buffer days per track (only entries greater than zero), live from the database. */
export const trackBufferDays = liveStore<Map<string, number>>(
    async () =>
        new Map(
            (await db.trackPlacements.toArray())
                .filter((p) => (p.bufferDays ?? 0) > 0)
                .map((p) => [p.fileId, p.bufferDays as number])
        ),
    new Map()
);

/** The tracks marked as alternatives, live from the database. */
export const trackAlternatives = liveStore<Set<string>>(
    async () =>
        new Set(
            (await db.trackPlacements.toArray())
                .filter((p) => p.alternative === true)
                .map((p) => p.fileId)
        ),
    new Set()
);

/**
 * The alternatives whose adventure is in advanced mode: the alternate-track
 * feature is unlocked by advanced mode (independently of numbering), so this is
 * the set that gets the ALT badge and the dotted/faded map rendering. The mark
 * is dormant for a simple adventure: kept in the database (until advanced mode
 * is turned off, which clears it), with no badge and no special rendering.
 */
export const activeTrackAlternatives: Readable<Set<string>> = derived(
    [adventures, trackPlacements, trackAlternatives],
    ([$adventures, $placements, $alternatives]) => {
        const advancedAdventures = new Set(
            $adventures
                .filter((adventure) => adventure.advancedMode === true)
                .map((adventure) => adventure.id)
        );
        const active = new Set<string>();
        $alternatives.forEach((fileId) => {
            const adventureId = $placements.get(fileId);
            if (adventureId !== undefined && advancedAdventures.has(adventureId)) {
                active.add(fileId);
            }
        });
        return active;
    }
);

/**
 * The library items currently highlighted in the panel. Several can be
 * selected at once (ctrl/cmd+click); the track pane and the map show the
 * union of their tracks. Empty means nothing is shown.
 */
export const librarySelection = writable<LibrarySelectionItem[]>([]);

/**
 * The adventure new and imported tracks are placed into automatically: the
 * selected one, defined only when the selection is exactly one adventure.
 */
export const selectedAdventureId: Readable<string | null> = derived(librarySelection, (items) =>
    items.length === 1 && items[0].kind === 'adventure' ? items[0].id : null
);

/**
 * Whether the single selected adventure is in advanced mode. Gates the
 * advanced-only chrome around the map (the plan view toggle in particular), and
 * lets the app drop out of the plan view when advanced mode is turned off.
 */
export const selectedAdventureIsAdvanced: Readable<boolean> = derived(
    [selectedAdventureId, adventures],
    ([$selectedAdventureId, $adventures]) =>
        $selectedAdventureId !== null &&
        $adventures.find((adventure) => adventure.id === $selectedAdventureId)?.advancedMode === true
);

/**
 * The expedition a new or imported adventure lands in: the selected expedition,
 * or the expedition of the selected adventure, or null (root) when the selection
 * is not a single item. Shared by the library "New adventure" action and the
 * File menu "Import adventure" action.
 */
export const targetExpeditionId: Readable<string | null> = derived(
    [librarySelection, adventures],
    ([items, allAdventures]) => {
        if (items.length !== 1) {
            return null;
        }
        const item = items[0];
        if (item.kind === 'expedition') {
            return item.id;
        }
        return allAdventures.find((a) => a.id === item.id)?.expeditionId ?? null;
    }
);

/** The ids of an expedition and every expedition nested below it. */
function expeditionSubtreeIds(rootId: string, allExpeditions: Expedition[]): Set<string> {
    const childrenByParent = new Map<string | null, string[]>();
    allExpeditions.forEach((expedition) => {
        const siblings = childrenByParent.get(expedition.parentId) ?? [];
        siblings.push(expedition.id);
        childrenByParent.set(expedition.parentId, siblings);
    });
    const subtree = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
        const current = queue.pop() as string;
        (childrenByParent.get(current) ?? []).forEach((childId) => {
            if (!subtree.has(childId)) {
                subtree.add(childId);
                queue.push(childId);
            }
        });
    }
    return subtree;
}

/** The ids of every adventure contained in a set of selected library items. */
export function adventureIdsOfSelection(
    items: LibrarySelectionItem[],
    allExpeditions: Expedition[],
    allAdventures: Adventure[]
): Set<string> {
    const adventureIds = new Set<string>();
    for (const item of items) {
        if (item.kind === 'adventure') {
            adventureIds.add(item.id);
        } else {
            const subtree = expeditionSubtreeIds(item.id, allExpeditions);
            allAdventures.forEach((a) => {
                if (a.expeditionId !== null && subtree.has(a.expeditionId)) {
                    adventureIds.add(a.id);
                }
            });
        }
    }
    return adventureIds;
}

/**
 * The file ids the current library selection contains (the union over all
 * selected items; empty when nothing is selected). This single store drives
 * both the track list of the bottom pane and the tracks rendered on the map,
 * which is what keeps the two in sync.
 */
export const visibleFileIds: Readable<Set<string>> = derived(
    [librarySelection, expeditions, adventures, trackPlacements],
    ([items, $expeditions, $adventures, $placements]) => {
        const adventureIds = adventureIdsOfSelection(items, $expeditions, $adventures);
        const fileIds = new Set<string>();
        $placements.forEach((adventureId, fileId) => {
            if (adventureIds.has(adventureId)) {
                fileIds.add(fileId);
            }
        });
        return fileIds;
    }
);

/**
 * Selects a library item, or toggles its membership when `multi` is set
 * (ctrl/cmd+click), and selects the first of its tracks (in track pane
 * order) in the editor, as an anchor for the tools, the statistics and the
 * elevation profile. Only the first one: selecting everything would make
 * selection-based tools and stats act on the whole adventure by surprise.
 */
export function selectLibraryItem(item: LibrarySelectionItem, multi: boolean): void {
    librarySelection.update((items) => {
        const exists = items.some(
            (candidate) => candidate.kind === item.kind && candidate.id === item.id
        );
        if (!multi) {
            return [item];
        }
        return exists
            ? items.filter(
                  (candidate) => !(candidate.kind === item.kind && candidate.id === item.id)
              )
            : [...items, item];
    });
    const adventureIds = adventureIdsOfSelection(
        get(librarySelection),
        get(expeditions),
        get(adventures)
    );
    const fileIds: string[] = [];
    get(trackPlacements).forEach((adventureId, fileId) => {
        if (adventureIds.has(adventureId)) {
            fileIds.push(fileId);
        }
    });
    if (fileIds.length > 0) {
        const order = get(settings.fileOrder);
        const indexOf = (fileId: string) => {
            const index = order.indexOf(fileId);
            return index === -1 ? Infinity : index;
        };
        const first = fileIds.reduce((best, fileId) =>
            indexOf(fileId) < indexOf(best) ? fileId : best
        );
        editorSelection.selectFile(first);
    } else {
        editorSelection.update(($selection) => {
            $selection.clear();
            return $selection;
        });
    }
}

/** Creates an expedition (optionally nested) at the end of its siblings and returns its id. */
export async function createExpedition(parentId: string | null, name: string): Promise<string> {
    const id = crypto.randomUUID();
    const order = orderAtEnd(get(expeditions).filter((e) => e.parentId === parentId));
    await db.expeditions.put({ id, name, parentId, order });
    return id;
}

/** Creates an adventure (optionally inside an expedition) at the end of its siblings and returns its id. */
export async function createAdventure(expeditionId: string | null, name: string): Promise<string> {
    const id = crypto.randomUUID();
    const order = orderAtEnd(get(adventures).filter((a) => a.expeditionId === expeditionId));
    await db.adventures.put({ id, name, expeditionId, order });
    return id;
}

export async function renameExpedition(id: string, name: string): Promise<void> {
    await db.expeditions.update(id, { name });
}

export async function renameAdventure(id: string, name: string): Promise<void> {
    await db.adventures.update(id, { name });
}

/** Updates the editable metadata of an adventure (see LibraryMetadataDialog). */
export async function updateAdventure(
    id: string,
    changes: Partial<
        Pick<
            Adventure,
            | 'name'
            | 'description'
            | 'numbering'
            | 'startDate'
            | 'showYear'
            | 'planDoc'
            | 'advancedMode'
        >
    >
): Promise<void> {
    await db.adventures.update(id, changes);
}

/** Turns advanced mode on for an adventure, unlocking numbering, alternates and the plan view. */
export async function enableAdvancedMode(id: string): Promise<void> {
    await db.adventures.update(id, { advancedMode: true });
}

/**
 * Turns advanced mode off and permanently clears the adventure's advanced data:
 * the numbering (and its start date / show-year), the plan document, and the
 * buffer days and alternative marks of every track in the adventure. This keeps
 * the invariant that a simple adventure holds no advanced data, so nothing
 * lingers hidden. The track FILES and their `<trk><desc>` notes are untouched.
 * The whole clear runs in one transaction so the live stores observe it at once
 * (no partially-cleared flicker). Placements have no `adventureId` index, so
 * they are found with a full scan, exactly like {@link deleteAdventure}.
 */
export async function disableAdvancedMode(id: string): Promise<void> {
    await db.transaction('rw', db.adventures, db.trackPlacements, async () => {
        await db.adventures.update(id, {
            advancedMode: false,
            numbering: 'none',
            startDate: undefined,
            showYear: undefined,
            planDoc: undefined,
        });
        await db.trackPlacements
            .filter((p) => p.adventureId === id)
            .modify({ alternative: false, bufferDays: 0 });
    });
}

/** Updates the editable metadata of an expedition (see LibraryMetadataDialog). */
export async function updateExpedition(
    id: string,
    changes: Pick<Expedition, 'name' | 'description'>
): Promise<void> {
    await db.expeditions.update(id, changes);
}

/** Sets the buffer days after a track (0 clears them). */
export async function setTrackBufferDays(fileId: string, bufferDays: number): Promise<void> {
    await db.trackPlacements.update(fileId, { bufferDays });
}

/**
 * Marks a track as an alternative, or back as a regular track. Becoming an
 * alternative clears the buffer days: the track no longer occupies a slot in
 * the numbering, so a delay after it has nothing to delay.
 */
export async function setTrackAlternative(fileId: string, alternative: boolean): Promise<void> {
    await db.trackPlacements.update(
        fileId,
        alternative ? { alternative: true, bufferDays: 0 } : { alternative: false }
    );
}

/**
 * Moves an adventure into an expedition (or to the root when null), at the
 * given position among its new siblings (at the end when omitted).
 */
export async function moveAdventure(
    id: string,
    expeditionId: string | null,
    order?: number
): Promise<void> {
    const newOrder =
        order ??
        orderAtEnd(get(adventures).filter((a) => a.expeditionId === expeditionId && a.id !== id));
    await db.adventures.update(id, { expeditionId, order: newOrder });
}

/**
 * Moves an expedition into another expedition (or to the root when null), at
 * the given position among its new siblings (at the end when omitted).
 * Rejected silently when the move would create a cycle, i.e. when the target
 * is the expedition itself or one of its descendants.
 */
export async function moveExpedition(
    id: string,
    parentId: string | null,
    order?: number
): Promise<void> {
    if (parentId !== null && expeditionSubtreeIds(id, get(expeditions)).has(parentId)) {
        return;
    }
    const newOrder =
        order ?? orderAtEnd(get(expeditions).filter((e) => e.parentId === parentId && e.id !== id));
    await db.expeditions.update(id, { parentId, order: newOrder });
}

/**
 * Deletes an expedition together with every nested expedition and adventure,
 * and all their track placements. The track FILES are not touched here: the
 * caller deletes them through the file action manager so the deletion goes
 * through the undo history (see `deleteLibraryItem` in file-actions).
 */
export async function deleteExpeditionCascade(id: string): Promise<void> {
    const deletedExpeditions = new Set<string>();
    const deletedAdventures = new Set<string>();
    await db.transaction('rw', db.expeditions, db.adventures, db.trackPlacements, async () => {
        const subtree = expeditionSubtreeIds(id, await db.expeditions.toArray());
        (await db.adventures.toArray()).forEach((adventure) => {
            if (adventure.expeditionId !== null && subtree.has(adventure.expeditionId)) {
                deletedAdventures.add(adventure.id);
            }
        });
        subtree.forEach((expeditionId) => deletedExpeditions.add(expeditionId));
        await db.trackPlacements.filter((p) => deletedAdventures.has(p.adventureId)).delete();
        await db.adventures.filter((a) => deletedAdventures.has(a.id)).delete();
        await db.expeditions.filter((e) => deletedExpeditions.has(e.id)).delete();
    });
    librarySelection.update((items) =>
        items.filter((item) =>
            item.kind === 'expedition'
                ? !deletedExpeditions.has(item.id)
                : !deletedAdventures.has(item.id)
        )
    );
}

/**
 * Deletes an adventure and its track placements. The track FILES are not
 * touched here: the caller deletes them through the file action manager so
 * the deletion goes through the undo history (see `deleteLibraryItem` in
 * file-actions).
 */
export async function deleteAdventure(id: string): Promise<void> {
    await db.transaction('rw', db.adventures, db.trackPlacements, async () => {
        await db.adventures.where('id').equals(id).delete();
        await db.trackPlacements.filter((p) => p.adventureId === id).delete();
    });
    librarySelection.update((items) =>
        items.filter((item) => !(item.kind === 'adventure' && item.id === id))
    );
}

/**
 * A deletion of an adventure or expedition awaiting user confirmation (see
 * DeleteLibraryItemDialog): deleting a container deletes every track inside.
 */
export const pendingDeletion = writable<LibrarySelectionItem | null>(null);

/** The adventure or expedition whose metadata dialog is open (see LibraryMetadataDialog). */
export const pendingMetadataEdit = writable<LibrarySelectionItem | null>(null);

/** The track whose buffer-days dialog is open (see BufferDaysDialog). */
export const pendingBufferEdit = writable<string | null>(null);

/**
 * The adventure a ferry trip is being added to (see FerryTripDialog), or null
 * when the dialog is closed. Set by the "Ferry" action, which - like "New
 * track" - requires a single selected adventure for the leg to land in.
 */
export const pendingFerryCreation = writable<{ adventureId: string } | null>(null);

/**
 * The adventure whose advanced mode is being turned off, awaiting confirmation
 * (see DisableAdvancedModeDialog): confirming permanently clears its advanced
 * data, so we prompt rather than clear on the spot.
 */
export const pendingAdvancedModeDisable = writable<string | null>(null);

/** The tag shown in front of a track name, and the buffer days after that track. */
export type TrackTag = { label: string; bufferDays: number; alternative?: boolean };

/** The tag of a track marked as an alternative: it stands in for the number or date. */
const ALTERNATIVE_TAG: TrackTag = { label: 'ALT', bufferDays: 0, alternative: true };

/** A yyyy-mm-dd date shifted by whole days and formatted as dd/mm(/yyyy), UTC-safe. */
function formatTripDate(startDate: string, offsetDays: number, showYear: boolean): string {
    const [year, month, day] = startDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day) + offsetDays * 24 * 60 * 60 * 1000);
    const dayMonth = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return showYear ? `${dayMonth}/${date.getUTCFullYear()}` : dayMonth;
}

/**
 * Groups the placed track file ids by their adventure, in the track pane's
 * manual order (the global {@link Setting} `fileOrder`, with any files it does
 * not know yet appended). Shared by the numbering tags and the ferry
 * departure-date reconciler so both see the same per-adventure order.
 */
export function orderedFilesByAdventure(
    placements: Map<string, string>,
    fileOrder: string[]
): Map<string, string[]> {
    const filesByAdventure = new Map<string, string[]>();
    const ordered = [
        ...fileOrder,
        ...[...placements.keys()].filter((fileId) => !fileOrder.includes(fileId)),
    ];
    ordered.forEach((fileId) => {
        const adventureId = placements.get(fileId);
        if (adventureId !== undefined) {
            const files = filesByAdventure.get(adventureId) ?? [];
            files.push(fileId);
            filesByAdventure.set(adventureId, files);
        }
    });
    return filesByAdventure;
}

/**
 * The whole-day offset from the trip start date of each track in a date-numbered
 * adventure, following the given order. Alternatives hold no slot (they get no
 * entry); every other track sits one day after the previous one, plus that
 * previous track's buffer days. Single source of truth for the calendar day a
 * track falls on, used by the date tags (trackTags) and the ferry
 * departure-date reconciler (see updateFerryDepartureDates).
 */
export function tripDayOffsets(
    orderedFileIds: string[],
    alternatives: Set<string>,
    buffers: Map<string, number>
): Map<string, number> {
    const offsets = new Map<string, number>();
    let dayOffset = 0;
    for (const fileId of orderedFileIds) {
        if (alternatives.has(fileId)) {
            continue;
        }
        offsets.set(fileId, dayOffset);
        dayOffset += 1 + (buffers.get(fileId) ?? 0);
    }
    return offsets;
}

/**
 * The numbering tag of every track whose adventure has one, keyed by file id.
 * Tracks follow the order of the track pane (the global manual file order);
 * in 'date' mode each track advances one day, plus the buffer days of the
 * tracks before it. Tracks marked as alternatives do not occupy a slot in
 * the sequence: they are tagged ALT instead, and moving them around never
 * changes the numbers or dates of the other tracks.
 */
export const trackTags: Readable<Map<string, TrackTag>> = derived(
    [adventures, trackPlacements, trackBufferDays, trackAlternatives, settings.fileOrder],
    ([$adventures, $placements, $buffers, $alternatives, $fileOrder]) => {
        const tags = new Map<string, TrackTag>();
        const filesByAdventure = orderedFilesByAdventure($placements, $fileOrder);
        $adventures.forEach((adventure) => {
            const files = filesByAdventure.get(adventure.id) ?? [];
            if (adventure.numbering === 'numbers') {
                let stage = 0;
                files.forEach((fileId) => {
                    if ($alternatives.has(fileId)) {
                        tags.set(fileId, ALTERNATIVE_TAG);
                        return;
                    }
                    stage += 1;
                    tags.set(fileId, {
                        label: `${stage}`,
                        bufferDays: $buffers.get(fileId) ?? 0,
                    });
                });
            } else if (adventure.numbering === 'date' && adventure.startDate !== undefined) {
                const offsets = tripDayOffsets(files, $alternatives, $buffers);
                files.forEach((fileId) => {
                    if ($alternatives.has(fileId)) {
                        tags.set(fileId, ALTERNATIVE_TAG);
                        return;
                    }
                    tags.set(fileId, {
                        label: formatTripDate(
                            adventure.startDate as string,
                            offsets.get(fileId) ?? 0,
                            adventure.showYear ?? false
                        ),
                        bufferDays: $buffers.get(fileId) ?? 0,
                    });
                });
            } else if (adventure.advancedMode) {
                // Advanced but not numbered: alternatives are still marked (the
                // feature is unlocked by advanced mode, not by numbering), they
                // just have no stage number or date to stand in for.
                files.forEach((fileId) => {
                    if ($alternatives.has(fileId)) {
                        tags.set(fileId, ALTERNATIVE_TAG);
                    }
                });
            }
        });
        return tags;
    }
);

/**
 * A creation of an expedition or adventure awaiting its name (see
 * CreateLibraryItemDialog). `parentId` is the containing expedition (null for
 * a root expedition; adventures always have one). Name is the only field for
 * now; more metadata joins it in a later phase.
 */
export const pendingCreation = writable<{
    kind: 'expedition' | 'adventure';
    parentId: string | null;
} | null>(null);

/** Places tracks in an adventure; a null adventureId clears their placement. */
export async function placeTracks(fileIds: string[], adventureId: string | null): Promise<void> {
    if (adventureId === null) {
        await db.trackPlacements.bulkDelete(fileIds);
    } else {
        await db.trackPlacements.bulkPut(fileIds.map((fileId) => ({ fileId, adventureId })));
    }
}

/**
 * Placements declared for files that are about to be created, keyed by file
 * id. Actions that create files with a known destination (import, duplicate,
 * paste) queue the placement BEFORE writing the file, and the 'creating' hook
 * below honors it instead of falling back to the currently selected adventure.
 * A null destination clears any stale placement left on a recycled file id.
 */
/** A queued placement, optionally carrying the track's round-trip metadata. */
type QueuedPlacement = { adventureId: string; bufferDays?: number; alternative?: boolean };

const queuedPlacements = new Map<string, QueuedPlacement | null>();

/**
 * Queues the placement for a file about to be created, optionally with its
 * buffer-days / alternative metadata. A null adventureId clears any stale
 * placement left on a recycled id. The metadata travels WITH the placement so
 * the 'creating' hook can write the complete row in a single put: applying it
 * afterwards would race with (and be clobbered by) that deferred write. This is
 * used by adventure round-trip import.
 */
export function queuePlacement(
    fileId: string,
    adventureId: string | null,
    meta?: { bufferDays?: number; alternative?: boolean }
): void {
    queuedPlacements.set(fileId, adventureId == null ? null : { adventureId, ...meta });
}

/**
 * Adventures of tracks that were just deleted, keyed by file id. When an undo
 * re-creates a file with the same id, the 'creating' hook restores it here
 * instead of guessing the current selection (R6). Cleared when the id is handed
 * to a genuinely new file (see {@link clearRestoredPlacement}, called from
 * getFileIds) so a new track never inherits a deleted one's adventure.
 */
const restoredPlacements = new Map<string, string>();

export function clearRestoredPlacement(fileId: string): void {
    restoredPlacements.delete(fileId);
}

if (browser) {
    // Place newly created files (new track, import, duplicate, paste, undo): a
    // queued placement wins, then a placement restored from a just-deleted file
    // of the same id (undo), then the currently selected adventure. The
    // 'creating' hook fires for every new file key; the placement is written
    // after the file transaction completes to avoid interfering with it.
    db.files.hook('creating', (primaryKey) => {
        if (typeof primaryKey !== 'string') {
            return;
        }
        const queued = queuedPlacements.get(primaryKey);
        const hasQueued = queuedPlacements.delete(primaryKey);
        const restored = restoredPlacements.get(primaryKey);
        const hasRestored = restoredPlacements.delete(primaryKey);
        const selected = get(selectedAdventureId);
        setTimeout(() => {
            if (hasQueued) {
                // Overwrite (or clear) unconditionally: file ids are recycled,
                // so the id may still carry the placement of a deleted file.
                const write =
                    queued != null
                        ? db.trackPlacements.put({
                              fileId: primaryKey,
                              adventureId: queued.adventureId,
                              // Alternatives never carry buffer days (they hold no
                              // slot in the numbering), so the two are exclusive.
                              ...(queued.alternative
                                  ? { alternative: true }
                                  : queued.bufferDays
                                    ? { bufferDays: queued.bufferDays }
                                    : {}),
                          })
                        : db.trackPlacements.delete(primaryKey);
                Promise.resolve(write).catch(() => {});
            } else if (hasRestored && restored != null) {
                // Undo re-created a deleted track: restore its original adventure
                // if it still exists, otherwise fall back to the current
                // selection so the track never becomes unreachable (R6).
                db.adventures
                    .get(restored)
                    .then((adventure) => {
                        const target = adventure ? restored : selected;
                        if (target != null) {
                            return db.trackPlacements.put({
                                fileId: primaryKey,
                                adventureId: target,
                            });
                        }
                    })
                    .catch(() => {});
            } else if (selected != null) {
                db.trackPlacements
                    .get(primaryKey)
                    .then((existing) => {
                        if (!existing) {
                            return db.trackPlacements.put({
                                fileId: primaryKey,
                                adventureId: selected,
                            });
                        }
                    })
                    .catch(() => {});
            }
        });
    });

    // Prune placements whose file no longer exists, remembering each orphan's
    // adventure so an undo that re-creates the file can restore it (R6). Runs on
    // every change to the file id list; reads the current ids inside the
    // transaction so a concurrent creation cannot be mistaken for an orphan.
    liveQuery(() => db.fileids.toArray()).subscribe({
        next: () => {
            db.transaction('rw', db.fileids, db.trackPlacements, async () => {
                const existing = new Set(await db.fileids.toArray());
                const orphans = (await db.trackPlacements.toArray()).filter(
                    (placement) => !existing.has(placement.fileId)
                );
                if (orphans.length > 0) {
                    orphans.forEach((placement) =>
                        restoredPlacements.set(placement.fileId, placement.adventureId)
                    );
                    await db.trackPlacements.bulkDelete(
                        orphans.map((placement) => placement.fileId)
                    );
                }
            }).catch(() => {
                // Pruning retries on the next file-list change.
            });
        },
    });
}
