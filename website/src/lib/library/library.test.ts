import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/i18n.svelte', () => ({ i18n: { _: (key: string, fallback?: string) => fallback ?? key } }));

import {
    sortByOrder,
    orderRelativeTo,
    orderedFilesByAdventure,
    tripDayOffsets,
} from '$lib/library/library';

describe('sortByOrder', () => {
    it('orders items by their manual position', () => {
        const items = [{ order: 3 }, { order: 1 }, { order: 2 }];
        expect(sortByOrder(items).map((i) => i.order)).toEqual([1, 2, 3]);
    });

    it('treats a missing order as 0 and does not mutate the input', () => {
        const items = [{ id: 'y', order: 5 }, { id: 'x' }];
        const sorted = sortByOrder(items);
        expect(sorted.map((i) => i.id)).toEqual(['x', 'y']);
        expect(items.map((i) => i.id)).toEqual(['y', 'x']); // original untouched
    });
});

describe('orderRelativeTo (fractional midpoint ordering)', () => {
    const siblings = [
        { id: 'a', order: 1 },
        { id: 'b', order: 2 },
        { id: 'c', order: 3 },
    ];

    it('places before the first item just below it', () => {
        expect(orderRelativeTo(siblings, 'a', true)).toBe(0);
    });

    it('places after the last item just above it', () => {
        expect(orderRelativeTo(siblings, 'c', false)).toBe(4);
    });

    it('places between two items at their midpoint', () => {
        expect(orderRelativeTo(siblings, 'b', true)).toBe(1.5);
        expect(orderRelativeTo(siblings, 'b', false)).toBe(2.5);
    });

    it('falls back to the end when the target is not found', () => {
        expect(orderRelativeTo(siblings, 'missing', true)).toBe(4);
    });

    it('keeps halving so repeated inserts never need renumbering', () => {
        const first = orderRelativeTo(siblings, 'b', true); // 1.5
        const withInserted = [...siblings, { id: 'd', order: first }];
        const second = orderRelativeTo(withInserted, 'd', true); // between a(1) and d(1.5)
        expect(second).toBe(1.25);
    });
});

describe('orderedFilesByAdventure', () => {
    it('groups files by adventure in fileOrder, appending unknown files at the end', () => {
        const placements = new Map([
            ['f1', 'A'],
            ['f2', 'B'],
            ['f3', 'A'],
            ['f4', 'A'], // not in fileOrder -> appended after the known ones
        ]);
        const result = orderedFilesByAdventure(placements, ['f3', 'f1', 'f2']);
        expect(result.get('A')).toEqual(['f3', 'f1', 'f4']);
        expect(result.get('B')).toEqual(['f2']);
    });
});

describe('tripDayOffsets', () => {
    it('advances one day per track, skips alternatives, and adds buffer days', () => {
        const files = ['f1', 'f2', 'f3', 'f4'];
        const alternatives = new Set(['f2']); // holds no slot
        const buffers = new Map([['f1', 2]]); // f1 pushes the following tracks back
        const offsets = tripDayOffsets(files, alternatives, buffers);
        expect(offsets.get('f1')).toBe(0);
        expect(offsets.has('f2')).toBe(false); // alternative: no slot
        expect(offsets.get('f3')).toBe(3); // 0 + 1 + 2 buffer days
        expect(offsets.get('f4')).toBe(4); // 3 + 1
    });
});
