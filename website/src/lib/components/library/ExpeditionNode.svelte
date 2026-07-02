<script lang="ts">
    import { ChevronDown, ChevronRight, Mountain } from '@lucide/svelte';
    import * as ContextMenu from '$lib/components/ui/context-menu';
    import { Input } from '$lib/components/ui/input';
    import AdventureNode from './AdventureNode.svelte';
    import ExpeditionNode from './ExpeditionNode.svelte';
    import {
        adventures,
        createAdventure,
        createExpedition,
        deleteExpedition,
        expeditions,
        renameExpedition,
        selectedAdventureId,
        type Expedition,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * One expedition in the library panel: a collapsible header followed by
     * its nested expeditions and adventures. Renders itself recursively.
     */
    let { expedition }: { expedition: Expedition } = $props();

    let open = $state(true);
    let editing = $state(false);
    let editedName = $state('');

    let childExpeditions = $derived(
        $expeditions.filter((candidate) => candidate.parentId === expedition.id)
    );
    let childAdventures = $derived(
        $adventures.filter((candidate) => candidate.expeditionId === expedition.id)
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

    async function newAdventureHere() {
        const id = await createAdventure(
            expedition.id,
            `${i18n._('library.new_adventure_name')} ${childAdventures.length + 1}`
        );
        selectedAdventureId.set(id);
        open = true;
    }

    async function newExpeditionHere() {
        await createExpedition(
            expedition.id,
            `${i18n._('library.new_expedition_name')} ${childExpeditions.length + 1}`
        );
        open = true;
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
                    class="w-full flex flex-row items-center gap-1.5 px-1 py-0.5 rounded text-sm font-semibold hover:bg-accent"
                    onclick={() => (open = !open)}
                    ondblclick={startRename}
                >
                    {#if open}
                        <ChevronDown size="14" class="shrink-0" />
                    {:else}
                        <ChevronRight size="14" class="shrink-0" />
                    {/if}
                    <Mountain size="14" class="shrink-0 text-muted-foreground" />
                    <span class="truncate">{expedition.name}</span>
                </button>
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
            <ContextMenu.Item onclick={startRename}>{i18n._('library.rename')}</ContextMenu.Item>
            <ContextMenu.Item onclick={() => deleteExpedition(expedition.id)}>
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
