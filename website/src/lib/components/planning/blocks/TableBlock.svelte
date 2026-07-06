<script lang="ts">
    import { untrack } from 'svelte';
    import type { TableBlock } from '$lib/logic/plan-doc';
    import { Button } from '$lib/components/ui/button';
    import { Plus, X } from '@lucide/svelte';
    import { i18n } from '$lib/i18n.svelte';

    let { block, oncommit }: { block: TableBlock; oncommit: () => void } = $props();

    const DEFAULT_WIDTH = 176;
    const CONTROL_WIDTH = 36;
    const MIN_WIDTH = 80;

    // Per-column widths (px). View-only: GFM table Markdown has no width syntax, so
    // these are not persisted and reset on reload; the cell text still round-trips.
    let colWidths = $state<number[]>(untrack(() => block.headers.map(() => DEFAULT_WIDTH)));
    // Keep in sync if the column count changes (external reparse, add/remove).
    $effect(() => {
        if (colWidths.length !== block.headers.length) {
            colWidths = block.headers.map((_, index) => colWidths[index] ?? DEFAULT_WIDTH);
        }
    });
    let tableWidth = $derived(colWidths.reduce((sum, w) => sum + w, 0) + CONTROL_WIDTH);

    function addColumn() {
        block.headers.push('');
        block.align.push(null);
        for (const row of block.rows) row.push('');
        colWidths.push(DEFAULT_WIDTH);
        oncommit();
    }
    function removeColumn(columnIndex: number) {
        block.headers.splice(columnIndex, 1);
        block.align.splice(columnIndex, 1);
        for (const row of block.rows) row.splice(columnIndex, 1);
        colWidths.splice(columnIndex, 1);
        oncommit();
    }
    function addRow() {
        block.rows.push(block.headers.map(() => ''));
        oncommit();
    }
    function removeRow(rowIndex: number) {
        block.rows.splice(rowIndex, 1);
        oncommit();
    }

    /** Drag a column's right edge to set its width. */
    function startResize(event: PointerEvent, columnIndex: number) {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = colWidths[columnIndex];
        const move = (moveEvent: PointerEvent) => {
            colWidths[columnIndex] = Math.max(MIN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)));
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    /**
     * Auto-grow a cell textarea's height to fit its wrapped content, and re-fit when
     * the column is resized (width change). Keeps typing past the width flowing onto
     * new lines with the cell growing taller instead of scrolling.
     */
    function autogrow(node: HTMLTextAreaElement) {
        const fit = () => {
            node.style.height = 'auto';
            node.style.height = `${node.scrollHeight}px`;
        };
        let lastWidth = node.clientWidth;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0].contentRect.width;
            if (Math.abs(width - lastWidth) > 0.5) {
                lastWidth = width;
                fit();
            }
        });
        node.addEventListener('input', fit);
        observer.observe(node);
        fit();
        return {
            destroy() {
                node.removeEventListener('input', fit);
                observer.disconnect();
            },
        };
    }

    const cellClass =
        'block w-full resize-none rounded-none border-none bg-transparent px-1.5 py-1 text-sm leading-snug outline-none focus-visible:ring-1 focus-visible:ring-ring [overflow-wrap:anywhere]';
</script>

<div class="flex flex-col gap-2">
    <div class="overflow-x-auto">
        <table class="border-collapse text-sm" style="table-layout: fixed; width: {tableWidth}px">
            <colgroup>
                {#each colWidths as width, index (index)}
                    <col style="width: {width}px" />
                {/each}
                <col style="width: {CONTROL_WIDTH}px" />
            </colgroup>
            <thead>
                <tr>
                    {#each block.headers as header, columnIndex (columnIndex)}
                        <th class="relative border border-border p-0 align-top">
                            <div class="flex flex-row items-start">
                                <textarea
                                    value={header}
                                    oninput={(event) => (block.headers[columnIndex] = event.currentTarget.value)}
                                    onblur={oncommit}
                                    rows="1"
                                    use:autogrow
                                    placeholder={i18n._('planning.column_placeholder')}
                                    class="{cellClass} font-semibold"
                                ></textarea>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-6 w-6 shrink-0 text-muted-foreground"
                                    aria-label={i18n._('planning.remove_column')}
                                    onclick={() => removeColumn(columnIndex)}
                                >
                                    <X size="13" />
                                </Button>
                            </div>
                            <!-- Drag the right edge to set this column's width. -->
                            <div
                                class="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={i18n._('planning.resize_column')}
                                onpointerdown={(event) => startResize(event, columnIndex)}
                            ></div>
                        </th>
                    {/each}
                    <th class="p-0.5 align-top">
                        <Button
                            variant="ghost"
                            size="icon"
                            class="h-6 w-6 text-muted-foreground"
                            aria-label={i18n._('planning.add_column')}
                            onclick={addColumn}
                        >
                            <Plus size="14" />
                        </Button>
                    </th>
                </tr>
            </thead>
            <tbody>
                {#each block.rows as row, rowIndex (rowIndex)}
                    <tr>
                        {#each block.headers as _header, columnIndex (columnIndex)}
                            <td class="border border-border p-0 align-top">
                                <textarea
                                    value={row[columnIndex] ?? ''}
                                    oninput={(event) => (row[columnIndex] = event.currentTarget.value)}
                                    onblur={oncommit}
                                    rows="1"
                                    use:autogrow
                                    class={cellClass}
                                ></textarea>
                            </td>
                        {/each}
                        <td class="p-0.5 align-top">
                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-6 w-6 text-muted-foreground"
                                aria-label={i18n._('planning.remove_row')}
                                onclick={() => removeRow(rowIndex)}
                            >
                                <X size="13" />
                            </Button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <Button variant="ghost" size="sm" class="w-fit text-muted-foreground" onclick={addRow}>
        <Plus size="14" />
        {i18n._('planning.add_row')}
    </Button>
</div>
