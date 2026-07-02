/**
 * Drag and drop for the library panel.
 *
 * Two mechanisms coexist:
 * - Adventures and expeditions travel between expeditions (or to the root)
 *   via native HTML5 drag and drop, with custom MIME types so nothing else
 *   can be dropped by accident.
 * - Tracks travel from the track list (a SortableJS list at FILE level) onto
 *   adventure rows via {@link trackDropTarget}. SortableJS drives its drags
 *   with native HTML5 drag events, so a plain element can accept them by
 *   allowing dragover; because the drop then happens outside every sortable
 *   container, SortableJS leaves the dragged rows where they were and only
 *   the placement data changes (Svelte re-renders the lists from it).
 */
import { get, writable } from 'svelte/store';
import { ListLevel } from '$lib/components/file-list/file-list';
import { dragging } from '$lib/components/file-list/sortable-file-list';

/**
 * A track drop onto an adventure waiting for the user to choose between
 * moving and copying (see TrackDropDialog).
 */
export const pendingTrackDrop = writable<{ fileIds: string[]; adventureId: string } | null>(null);

const ADVENTURE_TYPE = 'application/x-adventure-planner-adventure';
const EXPEDITION_TYPE = 'application/x-adventure-planner-expedition';

export type LibraryDrag = { kind: 'adventure' | 'expedition'; id: string };

/** Marks a native drag as carrying an adventure or expedition. */
export function startLibraryDrag(event: DragEvent, drag: LibraryDrag): void {
    if (event.dataTransfer) {
        event.dataTransfer.setData(
            drag.kind === 'adventure' ? ADVENTURE_TYPE : EXPEDITION_TYPE,
            drag.id
        );
        event.dataTransfer.effectAllowed = 'move';
    }
}

/**
 * Whether a drag over an element carries an adventure or expedition. Only the
 * MIME types are readable during dragover, so this is the hover-time check.
 */
export function isLibraryDrag(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    return !!types && (types.includes(ADVENTURE_TYPE) || types.includes(EXPEDITION_TYPE));
}

/** Whether a drag carries an expedition (the only thing that may live at the root). */
export function isExpeditionDrag(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes(EXPEDITION_TYPE);
}

/** Whether a drag carries an adventure. */
export function isAdventureDrag(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes(ADVENTURE_TYPE);
}

/**
 * Where a drop lands relative to a row: its upper part reorders before it,
 * the lower part after it, and (when the row can contain things) the middle
 * moves the dragged item inside.
 */
export function dropZone(event: DragEvent, nestable: boolean): 'before' | 'after' | 'inside' {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (!nestable) {
        return y < rect.height / 2 ? 'before' : 'after';
    }
    if (y < rect.height * 0.25) {
        return 'before';
    }
    if (y > rect.height * 0.75) {
        return 'after';
    }
    return 'inside';
}

/** Reads the dropped adventure or expedition; only available on drop. */
export function getLibraryDrag(event: DragEvent): LibraryDrag | null {
    const adventureId = event.dataTransfer?.getData(ADVENTURE_TYPE);
    if (adventureId) {
        return { kind: 'adventure', id: adventureId };
    }
    const expeditionId = event.dataTransfer?.getData(EXPEDITION_TYPE);
    if (expeditionId) {
        return { kind: 'expedition', id: expeditionId };
    }
    return null;
}

/**
 * Svelte action that lets an element receive tracks dragged from a FILE-level
 * sortable list. The dragged rows are identified by the chosen class
 * SortableJS puts on every element taking part in the drag (several with
 * multi-drag), read at drop time because the class is gone after dragend.
 */
export function trackDropTarget(
    node: HTMLElement,
    onDrop: (fileIds: string[]) => void
): { destroy: () => void } {
    function onDragOver(event: DragEvent) {
        if (get(dragging) === ListLevel.FILE) {
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
        }
    }

    function onDropEvent(event: DragEvent) {
        if (get(dragging) !== ListLevel.FILE) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const fileIds = [...document.querySelectorAll('.sortable-chosen[data-id]')]
            .map((element) => element.getAttribute('data-id'))
            .filter((fileId): fileId is string => fileId !== null && fileId.startsWith('gpx-'));
        if (fileIds.length > 0) {
            onDrop(fileIds);
        }
    }

    node.addEventListener('dragover', onDragOver);
    node.addEventListener('drop', onDropEvent);
    return {
        destroy() {
            node.removeEventListener('dragover', onDragOver);
            node.removeEventListener('drop', onDropEvent);
        },
    };
}
