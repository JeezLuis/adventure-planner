<script lang="ts">
    import { Tent } from '@lucide/svelte';
    import * as ContextMenu from '$lib/components/ui/context-menu';
    import { Input } from '$lib/components/ui/input';
    import { loadFiles } from '$lib/logic/file-actions';
    import {
        adventures,
        librarySelection,
        moveAdventure,
        orderRelativeTo,
        pendingDeletion,
        renameAdventure,
        selectLibraryItem,
        trackPlacements,
        type Adventure,
    } from '$lib/library/library';
    import {
        dropZone,
        getLibraryDrag,
        isAdventureDrag,
        pendingTrackDrop,
        startLibraryDrag,
        trackDropTarget,
    } from './dnd';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * One adventure in the library tree: a clickable header (click selects
     * the adventure, so the track pane and the map show its tracks). The row
     * can be dragged into an expedition and receives track drops (move/copy)
     * as well as GPX file drops (import); browser-based import lives in the
     * track pane header.
     */
    let { adventure }: { adventure: Adventure } = $props();

    let editing = $state(false);
    let editedName = $state('');

    let selected = $derived(
        $librarySelection.some((item) => item.kind === 'adventure' && item.id === adventure.id)
    );

    function startRename() {
        editedName = adventure.name;
        editing = true;
    }

    function commitRename() {
        editing = false;
        const name = editedName.trim();
        if (name.length > 0 && name !== adventure.name) {
            renameAdventure(adventure.id, name);
        }
    }

    /** Tracks dropped here: ask whether to move or copy (already-contained ones need neither). */
    function onTracksDropped(droppedFileIds: string[]) {
        const incoming = droppedFileIds.filter(
            (fileId) => $trackPlacements.get(fileId) !== adventure.id
        );
        if (incoming.length > 0) {
            pendingTrackDrop.set({ fileIds: incoming, adventureId: adventure.id });
        }
    }

    /**
     * Native drops on the row: GPX files are imported into this adventure;
     * another adventure is reordered before or after this one (adopting this
     * one's expedition when it comes from elsewhere).
     */
    function onDrop(e: DragEvent) {
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            selectLibraryItem({ kind: 'adventure', id: adventure.id }, false);
            loadFiles(e.dataTransfer.files);
            return;
        }
        const drag = getLibraryDrag(e);
        if (drag?.kind !== 'adventure' || drag.id === adventure.id) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const siblings = $adventures.filter(
            (candidate) => candidate.expeditionId === adventure.expeditionId
        );
        moveAdventure(
            drag.id,
            adventure.expeditionId,
            orderRelativeTo(siblings, adventure.id, dropZone(e, false) === 'before')
        );
    }

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    use:trackDropTarget={onTracksDropped}
    ondragover={(e) => {
        if (e.dataTransfer?.types.includes('Files') || isAdventureDrag(e)) {
            e.preventDefault();
        }
    }}
    ondrop={onDrop}
>
    <ContextMenu.Root>
        <ContextMenu.Trigger>
            {#if editing}
                <Input
                    class="h-6 my-0.5 text-sm"
                    bind:value={editedName}
                    onblur={commitRename}
                    onkeydown={(e: KeyboardEvent) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') editing = false;
                    }}
                    autofocus
                />
            {:else}
                <button
                    class="w-full flex flex-row items-center gap-1.5 px-1 py-0.5 rounded text-sm font-medium hover:bg-accent {selected
                        ? 'bg-accent'
                        : ''}"
                    draggable="true"
                    ondragstart={(e) =>
                        startLibraryDrag(e, { kind: 'adventure', id: adventure.id })}
                    ondblclick={startRename}
                    onclick={(e) =>
                        selectLibraryItem(
                            { kind: 'adventure', id: adventure.id },
                            e.ctrlKey || e.metaKey
                        )}
                >
                    <Tent size="14" class="shrink-0 text-muted-foreground" />
                    <span class="truncate">{adventure.name}</span>
                </button>
            {/if}
        </ContextMenu.Trigger>
        <ContextMenu.Content>
            <ContextMenu.Item onclick={startRename}>{i18n._('library.rename')}</ContextMenu.Item>
            <ContextMenu.Item
                onclick={() => pendingDeletion.set({ kind: 'adventure', id: adventure.id })}
            >
                {i18n._('library.delete')}
            </ContextMenu.Item>
        </ContextMenu.Content>
    </ContextMenu.Root>
</div>
