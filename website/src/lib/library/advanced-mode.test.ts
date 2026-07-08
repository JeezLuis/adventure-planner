import { describe, expect, it, beforeEach, vi } from 'vitest';

// library.ts pulls in the i18n rune module transitively; stub it so the module
// loads under Node (fake-indexeddb is wired up globally by the vitest setup).
vi.mock('$lib/i18n.svelte', () => ({
    i18n: { _: (key: string, fallback?: string) => fallback ?? key },
}));

import { db } from '$lib/db';
import {
    disableAdvancedMode,
    enableAdvancedMode,
    hasAdvancedData,
    type Adventure,
    type TrackPlacement,
} from '$lib/library/library';

async function clearDb() {
    await db.transaction('rw', db.adventures, db.trackPlacements, async () => {
        await Promise.all([db.adventures.clear(), db.trackPlacements.clear()]);
    });
}

beforeEach(async () => {
    await clearDb();
});

describe('hasAdvancedData', () => {
    const plainPlacement: Pick<TrackPlacement, 'alternative' | 'bufferDays'> = {};

    it('is true when the adventure numbers its tracks', () => {
        expect(hasAdvancedData({ numbering: 'numbers' }, [])).toBe(true);
        expect(hasAdvancedData({ numbering: 'date' }, [])).toBe(true);
    });

    it('is true when the adventure has a non-empty plan document', () => {
        expect(hasAdvancedData({ planDoc: '# Day one' }, [])).toBe(true);
    });

    it('is true when any track is an alternative or has buffer days', () => {
        expect(hasAdvancedData({}, [plainPlacement, { alternative: true }])).toBe(true);
        expect(hasAdvancedData({}, [{ bufferDays: 2 }])).toBe(true);
    });

    it('is false for a plain adventure with plain tracks', () => {
        expect(hasAdvancedData({ numbering: 'none' }, [plainPlacement])).toBe(false);
        expect(hasAdvancedData({}, [])).toBe(false);
        // Whitespace-only plan doc and zero buffer days do not count.
        expect(hasAdvancedData({ planDoc: '   ' }, [{ bufferDays: 0, alternative: false }])).toBe(
            false
        );
    });
});

describe('enableAdvancedMode', () => {
    it('sets the flag without touching other fields', async () => {
        const adventure: Adventure = {
            id: 'a1',
            name: 'Trip',
            expeditionId: 'e1',
            description: 'notes',
        };
        await db.adventures.put(adventure);

        await enableAdvancedMode('a1');

        expect(await db.adventures.get('a1')).toEqual({ ...adventure, advancedMode: true });
    });
});

describe('disableAdvancedMode', () => {
    beforeEach(async () => {
        // Target adventure with every kind of advanced data.
        await db.adventures.put({
            id: 'a1',
            name: 'Alps',
            expeditionId: 'e1',
            advancedMode: true,
            numbering: 'date',
            startDate: '2026-07-01',
            showYear: true,
            planDoc: '# Plan',
        });
        // A second advanced adventure that must stay untouched.
        await db.adventures.put({
            id: 'a2',
            name: 'Coast',
            expeditionId: 'e1',
            advancedMode: true,
            numbering: 'numbers',
        });
        await db.trackPlacements.bulkPut([
            { fileId: 'f1', adventureId: 'a1', alternative: true },
            { fileId: 'f2', adventureId: 'a1', bufferDays: 3 },
            { fileId: 'f3', adventureId: 'a2', bufferDays: 5 },
        ]);
    });

    it('clears the adventure-level advanced data', async () => {
        await disableAdvancedMode('a1');

        const a1 = await db.adventures.get('a1');
        expect(a1?.advancedMode).toBe(false);
        expect(a1?.numbering).toBe('none');
        expect(a1?.startDate).toBeUndefined();
        expect(a1?.showYear).toBeUndefined();
        expect(a1?.planDoc).toBeUndefined();
        // Untouched identity fields survive.
        expect(a1?.name).toBe('Alps');
        expect(a1?.expeditionId).toBe('e1');
    });

    it('clears the alternative and buffer-day marks of the adventure tracks', async () => {
        await disableAdvancedMode('a1');

        const f1 = await db.trackPlacements.get('f1');
        const f2 = await db.trackPlacements.get('f2');
        expect(f1?.alternative).toBe(false);
        expect(f1?.bufferDays).toBe(0);
        expect(f2?.alternative).toBe(false);
        expect(f2?.bufferDays).toBe(0);
    });

    it('leaves other adventures and their tracks untouched', async () => {
        await disableAdvancedMode('a1');

        const a2 = await db.adventures.get('a2');
        expect(a2?.advancedMode).toBe(true);
        expect(a2?.numbering).toBe('numbers');

        const f3 = await db.trackPlacements.get('f3');
        expect(f3?.bufferDays).toBe(5);
        expect(f3?.alternative).toBeUndefined();
    });
});
