<script lang="ts">
    import { SvelteSet } from 'svelte/reactivity';
    import type { ChecklistBlock, ChecklistItem } from '$lib/logic/plan-doc';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { Input } from '$lib/components/ui/input';
    import { Button } from '$lib/components/ui/button';
    import * as Popover from '$lib/components/ui/popover';
    import { Plus, X, Link2, Hash, ExternalLink, Pencil } from '@lucide/svelte';
    import { i18n } from '$lib/i18n.svelte';

    let { block, oncommit }: { block: ChecklistBlock; oncommit: () => void } = $props();

    // Items being edited inline, tracked by item-object identity. An item with no
    // text always shows its input (nothing to display yet).
    const editing = new SvelteSet<ChecklistItem>();
    const showsInput = (item: ChecklistItem) => editing.has(item) || item.text.trim().length === 0;

    function toggle(index: number, checked: boolean) {
        block.items[index].checked = checked;
        oncommit();
    }
    function addItem() {
        block.items.push({ text: '', checked: false });
        // No commit: an empty item is not persisted until it has text.
    }
    function removeItem(index: number) {
        const [removed] = block.items.splice(index, 1);
        editing.delete(removed);
        oncommit();
    }
    function stopEditing(item: ChecklistItem) {
        editing.delete(item);
        oncommit();
    }
</script>

<div class="flex flex-col gap-1">
    {#each block.items as item, index (item)}
        <div class="flex flex-row items-center gap-1.5">
            <Checkbox
                checked={item.checked}
                onCheckedChange={(checked) => toggle(index, checked === true)}
            />

            {#if showsInput(item)}
                <!-- svelte-ignore a11y_autofocus -->
                <Input
                    value={item.text}
                    oninput={(event) => (item.text = event.currentTarget.value)}
                    onfocus={() => editing.add(item)}
                    onblur={() => stopEditing(item)}
                    autofocus
                    placeholder={i18n._('planning.item_placeholder')}
                    class="h-7 grow border-transparent px-1 hover:border-input focus-visible:border-ring {item.checked
                        ? 'text-muted-foreground line-through'
                        : ''}"
                />
            {:else if item.url?.trim()}
                <a
                    href={item.url.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="grow truncate px-1 text-sm text-primary hover:underline {item.checked
                        ? 'line-through opacity-70'
                        : ''}"
                >
                    {item.text}
                </a>
                <button
                    type="button"
                    class="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={i18n._('planning.edit_item')}
                    onclick={() => editing.add(item)}
                >
                    <Pencil size="13" />
                </button>
            {:else}
                <button
                    type="button"
                    class="grow truncate px-1 text-left text-sm {item.checked
                        ? 'text-muted-foreground line-through'
                        : ''}"
                    onclick={() => editing.add(item)}
                >
                    {item.text}
                </button>
            {/if}

            {#if item.quantity?.trim()}
                <span
                    class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums"
                >
                    {item.quantity.trim()}{item.units?.trim() ? ` ${item.units.trim()}` : ''}
                </span>
            {/if}

            <!-- Quantity + units editor -->
            <Popover.Root>
                <Popover.Trigger
                    class="shrink-0 rounded p-1 hover:bg-accent {item.quantity?.trim()
                        ? 'text-foreground'
                        : 'text-muted-foreground'}"
                    title={i18n._('planning.quantity')}
                >
                    <Hash size="14" />
                </Popover.Trigger>
                <Popover.Content class="flex w-56 flex-col gap-2" side="top">
                    <span class="text-xs font-medium">{i18n._('planning.quantity')}</span>
                    <div class="flex flex-row gap-2">
                        <Input
                            value={item.quantity ?? ''}
                            oninput={(event) => (item.quantity = event.currentTarget.value)}
                            onblur={oncommit}
                            placeholder={i18n._('planning.amount')}
                            class="h-8 w-20"
                        />
                        <Input
                            value={item.units ?? ''}
                            oninput={(event) => (item.units = event.currentTarget.value)}
                            onblur={oncommit}
                            placeholder={i18n._('planning.units')}
                            class="h-8 grow"
                        />
                    </div>
                </Popover.Content>
            </Popover.Root>

            <!-- Hyperlink editor -->
            <Popover.Root>
                <Popover.Trigger
                    class="shrink-0 rounded p-1 hover:bg-accent {item.url?.trim()
                        ? 'text-primary'
                        : 'text-muted-foreground'}"
                    title={i18n._('planning.link')}
                >
                    <Link2 size="14" />
                </Popover.Trigger>
                <Popover.Content class="flex w-72 flex-col gap-2" side="top">
                    <span class="text-xs font-medium">{i18n._('planning.link')}</span>
                    <Input
                        value={item.url ?? ''}
                        oninput={(event) => (item.url = event.currentTarget.value)}
                        onblur={oncommit}
                        placeholder="https://..."
                        class="h-8"
                    />
                    {#if item.url?.trim()}
                        <a
                            href={item.url.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="flex flex-row items-center gap-1 text-xs text-primary hover:underline"
                        >
                            <ExternalLink size="12" />
                            {i18n._('planning.open_link')}
                        </a>
                    {/if}
                </Popover.Content>
            </Popover.Root>

            <Button
                variant="ghost"
                size="icon"
                class="h-6 w-6 shrink-0 text-muted-foreground"
                aria-label={i18n._('planning.remove_item')}
                onclick={() => removeItem(index)}
            >
                <X size="14" />
            </Button>
        </div>
    {/each}
    <Button variant="ghost" size="sm" class="h-7 w-fit pl-1 text-muted-foreground" onclick={addItem}>
        <Plus size="14" />
        {i18n._('planning.add_item')}
    </Button>
</div>
