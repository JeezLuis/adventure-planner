<script lang="ts">
    import { ChevronDown, ChevronRight, Mountain } from '@lucide/svelte';
    import * as ContextMenu from '$lib/components/ui/context-menu';
    import { Input } from '$lib/components/ui/input';
    import AdventureNode from './AdventureNode.svelte';
    import ExpeditionNode from './ExpeditionNode.svelte';
    import {
        adventures,
        expeditions,
        librarySelection,
        moveAdventure,
        moveExpedition,
        orderRelativeTo,
        pendingCreation,
        pendingDeletion,
        pendingMetadataEdit,
        renameExpedition,
        selectLibraryItem,
        sortByOrder,
        type Expedition,
    } from '$lib/library/library';
    import { dropZone, getLibraryDrag, isLibraryDrag, startLibraryDrag } from './dnd';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * One expedition in the library tree: a selectable header (click selects
     * the expedition, so the track pane and the map show every track nested
     * below it) followed by its nested expeditions and adventures. The chevron
     * collapses the subtree; the row can be dragged into another expedition
     * and receives adventure and expedition drops.
     */
    let { expedition }: { expedition: Expedition } = $props();

    let open = $state(true);
    let editing = $state(false);
    let editedName = $state('');
    let dropTarget = $state(false);

    let selected = $derived(
        $librarySelection.some((item) => item.kind === 'expedition' && item.id === expedition.id)
    );

    let childExpeditions = $derived(
        sortByOrder($expeditions.filter((candidate) => candidate.parentId === expedition.id))
    );
    let childAdventures = $derived(
        sortByOrder($adventures.filter((candidate) => candidate.expeditionId === expedition.id))
    );

    function startRename() {
        editedName = expedition.name;
        editing = true;
    }

    function commitRename() {
        editing = false;
        const name = editedName.trim();
        if (name.length > 0 && name !== expedition.name) {
            renameExpedition(expedition.id, name);
        }
    }

    function newAdventureHere() {
        pendingCreation.set({ kind: 'adventure', parentId: expedition.id });
        open = true;
    }

    function newExpeditionHere() {
        pendingCreation.set({ kind: 'expedition', parentId: expedition.id });
        open = true;
    }

    function onDrop(e: DragEvent) {
        dropTarget = false;
        const drag = getLibraryDrag(e);
        if (!drag) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (drag.kind === 'adventure') {
            moveAdventure(drag.id, expedition.id);
            open = true;
        } else if (drag.id !== expedition.id) {
            // The row's middle nests the dragged expedition inside; its edges
            // reorder it among this expedition's siblings.
            const zone = dropZone(e, true);
            if (zone === 'inside') {
                moveExpedition(drag.id, expedition.id);
                open = true;
            } else {
                const siblings = $expeditions.filter(
                    (candidate) => candidate.parentId === expedition.parentId
                );
                moveExpedition(
                    drag.id,
                    expedition.parentId,
                    orderRelativeTo(siblings, expedition.id, zone === 'before')
                );
            }
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
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="w-full flex flex-row items-center gap-1 rounded {selected
                        ? 'bg-accent'
                        : ''} {dropTarget ? 'ring-1 ring-ring' : ''}"
                    ondragover={(e) => {
                        if (isLibraryDrag(e)) {
                            e.preventDefault();
                            dropTarget = true;
                        }
                    }}
                    ondragleave={() => (dropTarget = false)}
                    ondrop={onDrop}
                >
                    <button
                        class="shrink-0 px-0.5 py-0.5 rounded hover:bg-accent"
                        aria-label={i18n._(open ? 'menu.collapse' : 'menu.expand')}
                        onclick={(e) => {
                            e.stopPropagation();
                            open = !open;
                        }}
                    >
                        {#if open}
                            <ChevronDown size="14" class="shrink-0" />
                        {:else}
                            <ChevronRight size="14" class="shrink-0" />
                        {/if}
                    </button>
                    <button
                        class="grow min-w-0 flex flex-row items-center gap-1.5 py-0.5 rounded text-sm font-semibold hover:bg-accent"
                        draggable="true"
                        ondragstart={(e) =>
                            startLibraryDrag(e, { kind: 'expedition', id: expedition.id })}
                        onclick={(e) =>
                            selectLibraryItem(
                                { kind: 'expedition', id: expedition.id },
                                e.ctrlKey || e.metaKey
                            )}
                        ondblclick={startRename}
                    >
                        <Mountain size="14" class="shrink-0 text-muted-foreground" />
                        <span class="truncate">{expedition.name}</span>
                    </button>
                </div>
            {/if}
        </ContextMenu.Trigger>
        <ContextMenu.Content>
            <ContextMenu.Item onclick={newAdventureHere}>
                {i18n._('library.new_adventure_here')}
            </ContextMenu.Item>
            <ContextMenu.Item onclick={newExpeditionHere}>
                {i18n._('library.new_expedition_here')}
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item
                onclick={() => pendingMetadataEdit.set({ kind: 'expedition', id: expedition.id })}
            >
                {i18n._('library.edit_expedition')}
            </ContextMenu.Item>
            <ContextMenu.Item onclick={startRename}>{i18n._('library.rename')}</ContextMenu.Item>
            <ContextMenu.Item
                onclick={() => pendingDeletion.set({ kind: 'expedition', id: expedition.id })}
            >
                {i18n._('library.delete')}
            </ContextMenu.Item>
        </ContextMenu.Content>
    </ContextMenu.Root>
    {#if open}
        <div class="ml-3 flex flex-col">
            {#each childExpeditions as child (child.id)}
                <ExpeditionNode expedition={child} />
            {/each}
            {#each childAdventures as adventure (adventure.id)}
                <AdventureNode {adventure} />
            {/each}
        </div>
    {/if}
</div>
