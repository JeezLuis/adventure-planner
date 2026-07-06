import { lexer, type Tokens } from 'marked';

/**
 * Plan documents are the adventure planning content: free-form notes, checklists
 * (packing, spare parts, medicines, ...) and simple tables. They are authored
 * through a structured block editor but persisted as plain **Markdown** inside
 * standard GPX text fields (`<metadata><desc>` for the adventure, `<trk><cmt>`
 * per track). Storing standard Markdown, rather than a custom XML payload, keeps
 * the exported GPX valid and human-readable in any other app, in line with the
 * project's "the GPX is always right" principle.
 *
 * This module is the single place that converts between the Markdown string and
 * the editor's block model. It is pure logic (no Svelte, no DB) so it can be unit
 * tested in isolation, and the block model is the write-back mechanism: the editor
 * mutates blocks and re-serializes rather than doing string surgery on the source.
 *
 * Block model: each block has an optional user title, serialized as a level-2
 * Markdown heading (`## Title`). That heading doubles as the **block delimiter**:
 * a `#`/`##` heading starts a new block, and the content beneath it is classified
 * as a checklist (a task list), a table (a GFM table), or a note (anything else,
 * preserved verbatim). Titling blocks is what keeps adjacent blocks distinct on a
 * round-trip; untitled adjacent blocks of the same shape may merge, which is
 * acceptable because the editor surfaces the title prominently.
 */

/** Column alignment of a table, mirroring marked's table token. */
export type TableAlign = 'left' | 'center' | 'right' | null;

/** Free-form Markdown that the editor renders but does not decompose further. */
export interface NoteBlock {
    type: 'note';
    title?: string;
    /** Raw Markdown body (paragraphs, quotes, code, sub-headings, ...). */
    markdown: string;
}

/**
 * A single checklist entry. Beyond its label and done-state it may carry an
 * optional hyperlink (stored as a Markdown link) and an optional quantity with
 * optional units (stored as a trailing `(amount units)`), so both survive as
 * readable, standard Markdown.
 */
export interface ChecklistItem {
    text: string;
    checked: boolean;
    /** Optional hyperlink, e.g. a shop URL. */
    url?: string;
    /** Optional amount, kept as a string to allow values like "1.5". */
    quantity?: string;
    /** Optional units for the amount (e.g. "L", "kg"); free-form. */
    units?: string;
}

/** An interactive checklist. The block title acts as the category (e.g. "Clothing"). */
export interface ChecklistBlock {
    type: 'checklist';
    title?: string;
    items: ChecklistItem[];
}

/** A GFM pipe table. Rows are normalized to the header's column count on serialize. */
export interface TableBlock {
    type: 'table';
    title?: string;
    headers: string[];
    align: TableAlign[];
    rows: string[][];
}

/** A block in a plan document. */
export type PlanBlock = NoteBlock | ChecklistBlock | TableBlock;

/** True when a list token is a pure task list (every item is a checkbox item). */
function isTaskList(list: Tokens.List): boolean {
    return list.items.length > 0 && list.items.every((item) => item.task === true);
}

/**
 * Parse a task-list item into a {@link ChecklistItem}, pulling out an optional
 * trailing `(amount units)` quantity and an optional `[label](url)` hyperlink.
 * Guards against a stray `[ ]`/`[x]` prefix and collapses newlines so one item
 * is always one Markdown line.
 */
function parseChecklistItem(item: Tokens.ListItem): ChecklistItem {
    let raw = (item.text ?? '')
        .replace(/^\s*\[(?: |x|X)\]\s*/, '')
        .replace(/\s*\n\s*/g, ' ')
        .trim();

    let quantity: string | undefined;
    let units: string | undefined;
    // Trailing "(amount units?)" where amount starts with a digit; a parenthetical
    // that does not start with a number (e.g. "(M6)") is left as part of the label.
    const quantityMatch = raw.match(/\s*\((\d+(?:[.,]\d+)?)(?:\s+([^)]+))?\)\s*$/);
    if (quantityMatch) {
        quantity = quantityMatch[1];
        units = quantityMatch[2]?.trim() || undefined;
        raw = raw.slice(0, quantityMatch.index).trim();
    }

    let url: string | undefined;
    // A whole-item Markdown link "[label](url)".
    const linkMatch = raw.match(/^\[(.*)\]\((\S+)\)$/);
    let text = raw;
    if (linkMatch) {
        text = linkMatch[1].trim();
        url = linkMatch[2].trim();
    }

    return { text, checked: item.checked === true, url, quantity, units };
}

/** Build a title-less {@link TableBlock} from marked's table token. */
function tableFromToken(token: Tokens.Table): Omit<TableBlock, 'title'> {
    return {
        type: 'table',
        headers: token.header.map((cell) => cell.text.trim()),
        align: token.align.slice(),
        rows: token.rows.map((row) => row.map((cell) => cell.text.trim())),
    };
}

/**
 * Classify the tokens accumulated under one title into a block, or null when
 * there is nothing worth keeping (no title and no content).
 */
function classify(title: string | undefined, raw: Tokens.Generic[]): PlanBlock | null {
    const content = raw.filter((token) => token.type !== 'space');
    const hasTitle = title !== undefined && title.length > 0;

    if (content.length === 0) {
        return hasTitle ? { type: 'note', title, markdown: '' } : null;
    }

    // Every content token is a task list -> a checklist (items flattened).
    if (content.every((token) => token.type === 'list' && isTaskList(token as Tokens.List))) {
        const items: ChecklistItem[] = [];
        for (const token of content) {
            for (const item of (token as Tokens.List).items) {
                items.push(parseChecklistItem(item));
            }
        }
        return { type: 'checklist', title, items };
    }

    // A single table -> a table block.
    if (content.length === 1 && content[0].type === 'table') {
        return { title, ...tableFromToken(content[0] as Tokens.Table) };
    }

    // Anything else is a note, preserved verbatim (marked's raw values concatenate
    // back to the source, so joining them reconstructs the original body exactly).
    return { type: 'note', title, markdown: raw.map((token) => token.raw).join('').trim() };
}

/**
 * Parse a Markdown plan document into editor blocks. A level-1 or level-2 heading
 * starts a new block and becomes its title; deeper headings stay as note content.
 * Returns an empty array for blank/empty input.
 */
export function parsePlanDoc(markdown: string | undefined | null): PlanBlock[] {
    const source = markdown ?? '';
    if (source.trim().length === 0) return [];

    const tokens = lexer(source, { gfm: true });
    const blocks: PlanBlock[] = [];
    let title: string | undefined;
    let raw: Tokens.Generic[] = [];

    const flush = () => {
        const block = classify(title, raw);
        if (block) blocks.push(block);
        title = undefined;
        raw = [];
    };

    for (const token of tokens) {
        if (token.type === 'heading' && (token as Tokens.Heading).depth <= 2) {
            flush();
            title = (token as Tokens.Heading).text.trim() || undefined;
        } else {
            raw.push(token);
        }
    }
    flush();
    return blocks;
}

/** Markdown separator row cell for a given column alignment. */
function alignSeparator(align: TableAlign): string {
    switch (align) {
        case 'left':
            return ':---';
        case 'right':
            return '---:';
        case 'center':
            return ':---:';
        default:
            return '---';
    }
}

/** Escape a value so it is safe inside a single Markdown table cell. */
function escapeCell(value: string): string {
    return (value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\s*\n\s*/g, ' ')
        .trim();
}

/** The `## Title` line for a block, or '' when it has no title. */
function titleLine(title: string | undefined): string {
    const trimmed = title?.trim();
    return trimmed ? `## ${trimmed}` : '';
}

function serializeNote(block: NoteBlock): string {
    const parts: string[] = [];
    const heading = titleLine(block.title);
    if (heading) parts.push(heading);
    const body = block.markdown.trim();
    if (body) parts.push(body);
    return parts.join('\n\n');
}

/**
 * Serialize a checklist to its title heading (if any) plus a task list. Empty
 * items are dropped: Markdown has no notion of a blank task item (marked would
 * not read `- [ ]` back as a task), so persisting one would corrupt the block on
 * the next parse. The editor keeps empty items locally until the user types.
 */
function serializeChecklist(block: ChecklistBlock): string {
    const heading = titleLine(block.title);
    const items = block.items.filter((item) => item.text.trim().length > 0);
    if (!heading && items.length === 0) return '';
    const lines: string[] = [];
    if (heading) lines.push(heading);
    for (const item of items) {
        const box = item.checked ? '[x]' : '[ ]';
        const label = item.text.trim();
        const labelMd = item.url?.trim() ? `[${label}](${item.url.trim()})` : label;
        const quantity = item.quantity?.trim();
        const quantityMd = quantity
            ? ` (${quantity}${item.units?.trim() ? ` ${item.units.trim()}` : ''})`
            : '';
        lines.push(`- ${box} ${labelMd}${quantityMd}`);
    }
    return lines.join('\n');
}

/** Serialize a table to its title heading (if any) plus a GFM pipe table. */
function serializeTable(block: TableBlock): string {
    const heading = titleLine(block.title);
    const columnCount = block.headers.length;
    const hasContent =
        columnCount > 0 &&
        (block.headers.some((header) => header.trim().length > 0) ||
            block.rows.some((row) => row.some((cell) => (cell ?? '').trim().length > 0)));
    if (!hasContent) return heading;

    const headerRow = `| ${block.headers.map(escapeCell).join(' | ')} |`;
    const separatorRow = `| ${block.headers
        .map((_, index) => alignSeparator(block.align[index] ?? null))
        .join(' | ')} |`;
    const bodyRows = block.rows.map(
        (row) =>
            `| ${Array.from({ length: columnCount }, (_, index) =>
                escapeCell(row[index] ?? '')
            ).join(' | ')} |`
    );
    const table = [headerRow, separatorRow, ...bodyRows].join('\n');
    return heading ? `${heading}\n\n${table}` : table;
}

/**
 * Serialize editor blocks back to a Markdown plan document. Blocks are separated
 * by a blank line; empty blocks are omitted so an empty document serializes to `''`
 * (which means no `<desc>`/`<cmt>` is written and the GPX export stays byte-clean).
 */
export function serializePlanDoc(blocks: PlanBlock[]): string {
    return blocks
        .map((block) => {
            switch (block.type) {
                case 'note':
                    return serializeNote(block);
                case 'checklist':
                    return serializeChecklist(block);
                case 'table':
                    return serializeTable(block);
            }
        })
        .filter((part) => part.length > 0)
        .join('\n\n')
        .trim();
}

/** True when a document has no renderable content (used for empty-state UI). */
export function isPlanDocEmpty(markdown: string | undefined | null): boolean {
    return parsePlanDoc(markdown).length === 0;
}
