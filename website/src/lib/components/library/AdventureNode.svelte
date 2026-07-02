<script lang="ts">
    import { Tent } from '@lucide/svelte';
    import * as ContextMenu from '$lib/components/ui/context-menu';
    import { Input } from '$lib/components/ui/input';
    import FileListNode from '$lib/components/file-list/FileListNode.svelte';
    import { ListRootItem, ListFileItem } from '$lib/components/file-list/file-list';
    import { fileStateCollection } from '$lib/logic/file-state';
    import { selection } from '$lib/logic/selection';
    import {
        deleteAdventure,
        placeTracks,
        renameAdventure,
        selectedAdventureId,
        trackPlacements,
        type Adventure,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * One adventure in the library panel: a clickable header (click selects
     * the adventure and all its tracks, so the bottom panel shows totals)
     * followed by the tracks placed in it.
     */
    let { adventure }: { adventure: Adventure } = $props();

    let editing = $state(false);
    let editedName = $state('');

    /** Tracks placed in this adventure, as the filtered file-state map the file tree renders. */
    let files = $derived.by(() => {
        const filtered = new Map();
        for (const [fileId, state] of $fileStateCollection) {
            if ($trackPlacements.get(fileId) === adventure.id) {
                filtered.set(fileId, state);
            }
        }
        return filtered;
    });

    function selectAdventureAndTracks() {
        selectedAdventureId.set(adventure.id);
        const fileIds = [...files.keys()];
        if (fileIds.length > 0) {
            selection.selectFile(fileIds[0]);
            fileIds.slice(1).forEach((fileId) => selection.addSelectFile(fileId));
        }
    }

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

    function moveSelectedTracksHere() {
        const fileIds = $selection
            .getSelected()
            .filter((item) => item instanceof ListFileItem)
            .map((item) => item.getFileId());
        if (fileIds.length > 0) {
            placeTracks(fileIds, adventure.id);
        }
    }
</script>

<div class="flex flex-col">
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
                    class="w-full flex flex-row items-center gap-1.5 px-1 py-0.5 rounded text-sm font-medium hover:bg-accent {$selectedAdventureId ===
                    adventure.id
                        ? 'bg-accent'
                        : ''}"
                    ondblclick={startRename}
                    onclick={selectAdventureAndTracks}
                >
                    <Tent size="14" class="shrink-0 text-muted-foreground" />
                    <span class="truncate">{adventure.name}</span>
                    <span class="ml-auto text-xs text-muted-foreground">{files.size}</span>
                </button>
            {/if}
        </ContextMenu.Trigger>
        <ContextMenu.Content>
            <ContextMenu.Item onclick={moveSelectedTracksHere} disabled={$selection.size === 0}>
                {i18n._('library.move_selected_here')}
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item onclick={startRename}>{i18n._('library.rename')}</ContextMenu.Item>
            <ContextMenu.Item onclick={() => deleteAdventure(adventure.id)}>
                {i18n._('library.delete')}
            </ContextMenu.Item>
        </ContextMenu.Content>
    </ContextMenu.Root>
    {#if files.size > 0}
        <div class="ml-3">
            <FileListNode node={files} item={new ListRootItem()} />
        </div>
    {/if}
</div>
