<script lang="ts">
    import { untrack } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { parsePlanDoc, serializePlanDoc, type PlanBlock } from '$lib/logic/plan-doc';
    import NoteBlock from './blocks/NoteBlock.svelte';
    import ChecklistBlock from './blocks/ChecklistBlock.svelte';
    import TableBlock from './blocks/TableBlock.svelte';
    import { Input } from '$lib/components/ui/input';
    import { Button } from '$lib/components/ui/button';
    import { FileText, ListChecks, Table, Trash2, ChevronUp, ChevronDown, ChevronRight } from '@lucide/svelte';
    import { i18n } from '$lib/i18n.svelte';

    let { markdown, onchange }: { markdown: string; onchange: (md: string) => void } = $props();

    // The block model is the editing state; the Markdown string is the persisted
    // form. We re-parse only when the source changes from the outside (a different
    // adventure), never when it echoes back our own serialized commit, so
    // in-progress edits (including still-empty blocks) are never clobbered.
    let blocks = $state<PlanBlock[]>(untrack(() => parsePlanDoc(markdown)));
    let lastEmitted = untrack(() => markdown);
    // Collapsed blocks, tracked by block-object identity (transient, not persisted).
    const collapsed = new SvelteSet<PlanBlock>();

    $effect(() => {
        if (markdown !== lastEmitted) {
            blocks = parsePlanDoc(markdown);
            lastEmitted = markdown;
        }
    });

    function commit() {
        const md = serializePlanDoc(blocks);
        lastEmitted = md;
        onchange(md);
    }

    function addNote() {
        blocks.push({ type: 'note', title: '', markdown: '' });
    }
    function addChecklist() {
        blocks.push({ type: 'checklist', title: '', items: [{ text: '', checked: false }] });
    }
    function addTable() {
        blocks.push({ type: 'table', title: '', headers: ['', ''], align: [null, null], rows: [['', '']] });
    }
    function removeBlock(index: number) {
        blocks.splice(index, 1);
        commit();
    }
    function moveBlock(index: number, direction: -1 | 1) {
        const target = index + direction;
        if (target < 0 || target >= blocks.length) return;
        [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
        commit();
    }
</script>

<div class="flex flex-col gap-3">
    {#each blocks as block, index (block)}
        <div class="group rounded-lg border bg-card">
            <!-- Header: collapse toggle, editable title, and block controls. Keeping
                 the controls here (not over the body) avoids overlapping each block's
                 own content controls. -->
            <div class="flex flex-row items-center gap-1 px-1.5 py-1.5">
                <button
                    type="button"
                    class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={i18n._(collapsed.has(block) ? 'planning.expand' : 'planning.collapse')}
                    onclick={() => (collapsed.has(block) ? collapsed.delete(block) : collapsed.add(block))}
                >
                    <ChevronRight
                        size="16"
                        class="transition-transform {collapsed.has(block) ? '' : 'rotate-90'}"
                    />
                </button>
                <Input
                    value={block.title ?? ''}
                    oninput={(event) => (block.title = event.currentTarget.value)}
                    onblur={commit}
                    placeholder={i18n._('planning.block_title')}
                    class="h-7 grow border-transparent px-1 font-semibold hover:border-input focus-visible:border-ring"
                />
                <div
                    class="flex shrink-0 flex-row gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-muted-foreground"
                        aria-label={i18n._('planning.move_up')}
                        disabled={index === 0}
                        onclick={() => moveBlock(index, -1)}
                    >
                        <ChevronUp size="14" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-muted-foreground"
                        aria-label={i18n._('planning.move_down')}
                        disabled={index === blocks.length - 1}
                        onclick={() => moveBlock(index, 1)}
                    >
                        <ChevronDown size="14" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-destructive"
                        aria-label={i18n._('planning.remove_block')}
                        onclick={() => removeBlock(index)}
                    >
                        <Trash2 size="14" />
                    </Button>
                </div>
            </div>
            {#if !collapsed.has(block)}
                <div class="px-3 pb-3">
                    {#if block.type === 'note'}
                        <NoteBlock {block} oncommit={commit} />
                    {:else if block.type === 'checklist'}
                        <ChecklistBlock {block} oncommit={commit} />
                    {:else if block.type === 'table'}
                        <TableBlock {block} oncommit={commit} />
                    {/if}
                </div>
            {/if}
        </div>
    {/each}

    <div class="flex flex-row flex-wrap gap-2">
        <Button variant="outline" size="sm" onclick={addNote}>
            <FileText size="15" />
            {i18n._('planning.add_note')}
        </Button>
        <Button variant="outline" size="sm" onclick={addChecklist}>
            <ListChecks size="15" />
            {i18n._('planning.add_checklist')}
        </Button>
        <Button variant="outline" size="sm" onclick={addTable}>
            <Table size="15" />
            {i18n._('planning.add_table')}
        </Button>
    </div>
</div>
