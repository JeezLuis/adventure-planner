<script lang="ts">
    import { ScrollArea } from '$lib/components/ui/scroll-area/index';
    import { Mountain, Tent } from '@lucide/svelte';
    import ExpeditionNode from './ExpeditionNode.svelte';
    import AdventureNode from './AdventureNode.svelte';
    import TrackDropDialog from './TrackDropDialog.svelte';
    import DeleteLibraryItemDialog from './DeleteLibraryItemDialog.svelte';
    import CreateLibraryItemDialog from './CreateLibraryItemDialog.svelte';
    import LibraryMetadataDialog from './LibraryMetadataDialog.svelte';
    import BufferDaysDialog from './BufferDaysDialog.svelte';
    import FerryTripDialog from './FerryTripDialog.svelte';
    import DisableAdvancedModeDialog from './DisableAdvancedModeDialog.svelte';
    import { adventures, expeditions, moveExpedition, sortByOrder } from '$lib/library/library';
    import { getLibraryDrag, isExpeditionDrag } from './dnd';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * The organisation tree of the library panel: expeditions (nestable) and
     * adventures. Tracks themselves live in the pane below
     * ({@link LibraryTracks}); the selected rows (several with ctrl/cmd+click)
     * decide which tracks that pane and the map show. Expeditions dropped on
     * the empty area move to the root; adventures always stay inside an
     * expedition. While the library is empty, inline hints walk the user
     * through the Expedition > Adventure > Track hierarchy.
     */
    let rootExpeditions = $derived(sortByOrder($expeditions.filter((e) => e.parentId === null)));
    // Root-level adventures should no longer exist (adventures are created
    // inside expeditions), but older libraries may still contain them.
    let rootAdventures = $derived(sortByOrder($adventures.filter((a) => a.expeditionId === null)));

    function onRootDrop(e: DragEvent) {
        const drag = getLibraryDrag(e);
        if (drag?.kind !== 'expedition') {
            return;
        }
        e.preventDefault();
        moveExpedition(drag.id, null);
    }
</script>

<ScrollArea
    class="h-full min-h-0 p-0 pr-3"
    orientation="vertical"
    scrollbarXClasses=""
    scrollbarYClasses=""
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="flex flex-col py-1 pl-1 min-h-full"
        ondragover={(e) => {
            if (isExpeditionDrag(e)) {
                e.preventDefault();
            }
        }}
        ondrop={onRootDrop}
    >
        {#each rootExpeditions as expedition (expedition.id)}
            <ExpeditionNode {expedition} />
        {/each}
        {#each rootAdventures as adventure (adventure.id)}
            <AdventureNode {adventure} />
        {/each}
        {#if $expeditions.length === 0}
            <div
                class="m-2 flex flex-col items-center gap-1.5 rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground"
            >
                <Mountain size="16" />
                {i18n._('library.empty_expeditions')}
            </div>
        {:else if $adventures.length === 0}
            <div
                class="m-2 flex flex-col items-center gap-1.5 rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground"
            >
                <Tent size="16" />
                {i18n._('library.empty_adventures')}
            </div>
        {/if}
    </div>
</ScrollArea>

<TrackDropDialog />
<DeleteLibraryItemDialog />
<CreateLibraryItemDialog />
<LibraryMetadataDialog />
<BufferDaysDialog />
<FerryTripDialog />
<DisableAdvancedModeDialog />
