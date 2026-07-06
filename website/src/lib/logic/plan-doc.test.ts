import { describe, expect, it } from 'vitest';
import {
    isPlanDocEmpty,
    parsePlanDoc,
    serializePlanDoc,
    type ChecklistBlock,
    type NoteBlock,
    type PlanBlock,
    type TableBlock,
} from './plan-doc';

describe('parsePlanDoc', () => {
    it('returns no blocks for empty or whitespace input', () => {
        expect(parsePlanDoc('')).toEqual([]);
        expect(parsePlanDoc('   \n\n  ')).toEqual([]);
        expect(parsePlanDoc(undefined)).toEqual([]);
        expect(parsePlanDoc(null)).toEqual([]);
    });

    it('parses a titled checklist (the title is the category)', () => {
        const md = ['## Clothing', '- [ ] Rain jacket', '- [x] Gloves'].join('\n');
        const blocks = parsePlanDoc(md);
        expect(blocks).toEqual([
            {
                type: 'checklist',
                title: 'Clothing',
                items: [
                    { text: 'Rain jacket', checked: false, url: undefined, quantity: undefined, units: undefined },
                    { text: 'Gloves', checked: true, url: undefined, quantity: undefined, units: undefined },
                ],
            },
        ]);
    });

    it('keeps two titled checklists as separate blocks', () => {
        const md = ['## Clothing', '- [ ] Gloves', '', '## Spare parts', '- [ ] Tube'].join('\n');
        const blocks = parsePlanDoc(md);
        expect(blocks.map((b) => (b as ChecklistBlock).title)).toEqual(['Clothing', 'Spare parts']);
        expect(blocks).toHaveLength(2);
    });

    it('parses a titled note and keeps deeper headings as body', () => {
        const md = '## Border pass\n\nCarry passport.\n\n### Fees\n\nUnder 50 EUR.';
        const blocks = parsePlanDoc(md);
        expect(blocks).toHaveLength(1);
        const note = blocks[0] as NoteBlock;
        expect(note.type).toBe('note');
        expect(note.title).toBe('Border pass');
        expect(note.markdown).toBe('Carry passport.\n\n### Fees\n\nUnder 50 EUR.');
    });

    it('parses a titled table', () => {
        const md = ['## Fuel', '| Town | km |', '| :--- | ---: |', '| Faro | 210 |'].join('\n');
        const blocks = parsePlanDoc(md);
        const table = blocks[0] as TableBlock;
        expect(table.type).toBe('table');
        expect(table.title).toBe('Fuel');
        expect(table.headers).toEqual(['Town', 'km']);
        expect(table.align).toEqual(['left', 'right']);
        expect(table.rows).toEqual([['Faro', '210']]);
    });

    it('parses an untitled leading note before a titled block', () => {
        const blocks = parsePlanDoc('Intro text.\n\n## Packing\n- [ ] Tent');
        expect(blocks.map((b) => b.type)).toEqual(['note', 'checklist']);
        expect((blocks[0] as NoteBlock).title).toBeUndefined();
    });
});

describe('checklist item hyperlink and quantity', () => {
    it('parses a hyperlink item', () => {
        const item = (parsePlanDoc('## X\n- [ ] [Rain jacket](https://shop.example/x)')[0] as ChecklistBlock)
            .items[0];
        expect(item.text).toBe('Rain jacket');
        expect(item.url).toBe('https://shop.example/x');
    });

    it('parses a trailing quantity with units', () => {
        const item = (parsePlanDoc('## X\n- [ ] Water (2 L)')[0] as ChecklistBlock).items[0];
        expect(item).toMatchObject({ text: 'Water', quantity: '2', units: 'L' });
    });

    it('parses a quantity without units', () => {
        const item = (parsePlanDoc('## X\n- [ ] Spare tubes (4)')[0] as ChecklistBlock).items[0];
        expect(item).toMatchObject({ text: 'Spare tubes', quantity: '4' });
        expect(item.units).toBeUndefined();
    });

    it('leaves a non-numeric parenthetical as part of the label', () => {
        const item = (parsePlanDoc('## X\n- [ ] Bolt (M6)')[0] as ChecklistBlock).items[0];
        expect(item.text).toBe('Bolt (M6)');
        expect(item.quantity).toBeUndefined();
    });

    it('parses a link and a quantity together', () => {
        const item = (parsePlanDoc('## X\n- [ ] [Tube](https://shop.example/t) (2)')[0] as ChecklistBlock)
            .items[0];
        expect(item).toMatchObject({ text: 'Tube', url: 'https://shop.example/t', quantity: '2' });
    });

    it('serializes link and quantity back to Markdown', () => {
        const block: ChecklistBlock = {
            type: 'checklist',
            title: 'Spare parts',
            items: [{ text: 'Tube', checked: false, url: 'https://shop.example/t', quantity: '2', units: 'pcs' }],
        };
        expect(serializePlanDoc([block])).toBe(
            '## Spare parts\n- [ ] [Tube](https://shop.example/t) (2 pcs)'
        );
    });
});

describe('serializePlanDoc', () => {
    it('serializes an empty block list to an empty string', () => {
        expect(serializePlanDoc([])).toBe('');
    });

    it('renders checklist items with the correct checkbox state', () => {
        const block: ChecklistBlock = {
            type: 'checklist',
            title: 'Clothing',
            items: [{ text: 'Gloves', checked: true }],
        };
        expect(serializePlanDoc([block])).toBe('## Clothing\n- [x] Gloves');
    });

    it('drops empty checklist items', () => {
        const block: ChecklistBlock = {
            type: 'checklist',
            title: 'Clothing',
            items: [
                { text: 'Gloves', checked: false },
                { text: '   ', checked: false },
            ],
        };
        expect(serializePlanDoc([block])).toBe('## Clothing\n- [ ] Gloves');
    });

    it('emits a title heading for a titled note', () => {
        const block: NoteBlock = { type: 'note', title: 'Intro', markdown: 'Hello.' };
        expect(serializePlanDoc([block])).toBe('## Intro\n\nHello.');
    });

    it('pads short table rows to the header column count', () => {
        const block: TableBlock = {
            type: 'table',
            headers: ['A', 'B', 'C'],
            align: [null, null, null],
            rows: [['1']],
        };
        expect(serializePlanDoc([block])).toBe('| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |');
    });

    it('escapes pipe characters inside table cells', () => {
        const md = ['## T', '| K | V |', '|---|---|', '| a | pipe \\| here |'].join('\n');
        const table = parsePlanDoc(md)[0] as TableBlock;
        expect(table.rows[0][1]).toBe('pipe | here');
        expect((parsePlanDoc(serializePlanDoc([table]))[0] as TableBlock).rows[0][1]).toBe('pipe | here');
    });
});

describe('round-trip stability', () => {
    const cases: Record<string, string> = {
        checklist: '## Clothing\n- [ ] Rain jacket\n- [x] Gloves',
        twoChecklists: '## Clothing\n- [ ] Gloves\n\n## Spare parts\n- [ ] Tube',
        table: '## Fuel\n\n| Town | km |\n| :--- | ---: |\n| Faro | 210 |',
        note: '## Heading\n\nSome **bold** text and a [link](https://example.com).',
        linkAndQty: '## Spare parts\n- [ ] [Tube](https://shop.example/t) (2 pcs)',
        mixed: 'Intro.\n\n## Packing\n- [ ] Tent\n\n## Fuel\n\n| Stop | km |\n| --- | --- |\n| A | 10 |',
    };

    for (const [name, md] of Object.entries(cases)) {
        it(`parse -> serialize -> parse is stable for ${name}`, () => {
            const once = parsePlanDoc(md);
            const twice = parsePlanDoc(serializePlanDoc(once));
            expect(twice).toEqual(once);
        });

        it(`serialize is idempotent for ${name}`, () => {
            const normalized = serializePlanDoc(parsePlanDoc(md));
            expect(serializePlanDoc(parsePlanDoc(normalized))).toBe(normalized);
        });
    }

    it('preserves unmodeled markdown (blockquote, code fence) in a note', () => {
        const md = '## Notes\n\n> a quote\n\n```\ncode line\n```';
        const blocks = parsePlanDoc(md);
        expect(parsePlanDoc(serializePlanDoc(blocks))).toEqual(blocks);
    });
});

describe('write-back through the block model', () => {
    it('toggling an item and re-serializing flips the checkbox', () => {
        const blocks = parsePlanDoc('## Clothing\n- [ ] Gloves');
        (blocks[0] as ChecklistBlock).items[0].checked = true;
        expect(serializePlanDoc(blocks)).toBe('## Clothing\n- [x] Gloves');
    });

    it('editing a block title re-serializes the heading', () => {
        const blocks: PlanBlock[] = parsePlanDoc('## Clothing\n- [ ] Gloves');
        (blocks[0] as ChecklistBlock).title = 'Warm clothing';
        expect(serializePlanDoc(blocks)).toBe('## Warm clothing\n- [ ] Gloves');
    });
});

describe('isPlanDocEmpty', () => {
    it('is true for empty content and false once a block exists', () => {
        expect(isPlanDocEmpty('')).toBe(true);
        expect(isPlanDocEmpty('   ')).toBe(true);
        expect(isPlanDocEmpty('## Packing\n- [ ] something')).toBe(false);
        expect(isPlanDocEmpty('a note')).toBe(false);
    });
});
