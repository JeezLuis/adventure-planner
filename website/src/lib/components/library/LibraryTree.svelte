<script lang="ts">
    import { setContext } from 'svelte';
    import { ScrollArea } from '$lib/components/ui/scroll-area/index';
    import { Inbox } from '@lucide/svelte';
    import ExpeditionNode from './ExpeditionNode.svelte';
    import AdventureNode from './AdventureNode.svelte';
    import FileListNode from '$lib/components/file-list/FileListNode.svelte';
    import { ListRootItem } from '$lib/components/file-list/file-list';
    import { fileStateCollection } from '$lib/logic/file-state';
    import {
        adventures,
        expeditions,
        selectedAdventureId,
        trackPlacements,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * The library panel tree: expeditions (nestable) ▸ adventures ▸ tracks,
     * plus an "Unsorted" section for tracks not placed in any adventure.
     * Track rows reuse the existing file tree components, so per-track
     * behavior (selection, visibility, context menu, drag ordering) is
     * unchanged.
     */
    setContext('orientation', 'vertical');
    setContext('recursive', true);

    let rootExpeditions = $derived($expeditions.filter((e) => e.parentId === null));
    let rootAdventures = $derived($adventures.filter((a) => a.expeditionId === null));

    /** Tracks not placed in any adventure. */
    let unsortedFiles = $derived.by(() => {
        const filtered = new Map();
        for (const [fileId, state] of $fileStateCollection) {
            if (!$trackPlacements.has(fileId)) {
                filtered.set(fileId, state);
            }
        }
        return filtered;
    });
</script>

<ScrollArea
    class="h-full min-h-0 p-0 pr-3"
    orientation="vertical"
    scrollbarXClasses=""
    scrollbarYClasses=""
>
    <div class="flex flex-col py-1 pl-1 min-h-screen">
        {#each rootExpeditions as expedition (expedition.id)}
            <ExpeditionNode {expedition} />
        {/each}
        {#each rootAdventures as adventure (adventure.id)}
            <AdventureNode {adventure} />
        {/each}
        {#if unsortedFiles.size > 0}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="flex flex-row items-center gap-1.5 px-1 py-0.5 text-sm font-medium text-muted-foreground {$selectedAdventureId ===
                null
                    ? ''
                    : 'opacity-80'}"
                onclick={() => selectedAdventureId.set(null)}
            >
                <Inbox size="14" class="shrink-0" />
                {i18n._('library.unsorted')}
            </div>
            <div class="ml-3">
                <FileListNode node={unsortedFiles} item={new ListRootItem()} />
            </div>
        {/if}
    </div>
</ScrollArea>
