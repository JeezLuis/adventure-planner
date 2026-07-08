import { describe, expect, it } from 'vitest';
import {
    ADVENTURE_EXT_KEY,
    encodeAdventurePayload,
    decodeAdventurePayload,
} from '$lib/logic/adventure-gpx';

describe('adventure payload codec', () => {
    it('exposes the namespaced extension key the serializer round-trips', () => {
        expect(ADVENTURE_EXT_KEY).toBe('ap:data');
    });

    it('round-trips a full adventure + per-track payload', () => {
        const encoded = encodeAdventurePayload(
            {
                numbering: 'date',
                startDate: '2026-07-01',
                showYear: true,
                description: 'Trip & notes',
            },
            [{ bufferDays: 2 }, { alternative: true }, {}]
        );
        const decoded = decodeAdventurePayload(encoded);
        expect(decoded).toEqual({
            v: 1,
            adventure: {
                numbering: 'date',
                startDate: '2026-07-01',
                showYear: true,
                description: 'Trip & notes',
            },
            tracks: [{ bufferDays: 2 }, { alternative: true }, {}],
        });
    });

    it('round-trips the advanced-mode flag when on, and omits it when off', () => {
        const on = decodeAdventurePayload(encodeAdventurePayload({ advancedMode: true }, []));
        expect(on?.adventure.advancedMode).toBe(true);

        const offEncoded = encodeAdventurePayload({ advancedMode: false }, []);
        expect(JSON.parse(offEncoded).adventure.advancedMode).toBeUndefined();
        expect(decodeAdventurePayload(offEncoded)?.adventure.advancedMode).toBeUndefined();
    });

    it('omits default/empty fields so the payload stays small', () => {
        const encoded = encodeAdventurePayload({ numbering: 'none', showYear: false }, [
            { bufferDays: 0, alternative: false },
        ]);
        const parsed = JSON.parse(encoded);
        expect(parsed.adventure).toEqual({}); // 'none'/false/empty all dropped
        expect(parsed.tracks).toEqual([{}]); // zero buffer + false flag dropped
    });

    it('returns null for a missing, empty, or unparseable payload', () => {
        expect(decodeAdventurePayload(undefined)).toBeNull();
        expect(decodeAdventurePayload('')).toBeNull();
        expect(decodeAdventurePayload('not json')).toBeNull();
        expect(decodeAdventurePayload('42')).toBeNull();
    });

    it('rejects an unknown payload version so a newer file falls back safely', () => {
        expect(
            decodeAdventurePayload(JSON.stringify({ v: 2, adventure: {}, tracks: [] }))
        ).toBeNull();
    });

    it('sanitizes wrong-shaped fields instead of trusting the file', () => {
        const decoded = decodeAdventurePayload(
            JSON.stringify({
                v: 1,
                adventure: { numbering: 'bogus', startDate: 5, showYear: 'yes', description: 1 },
                tracks: [{ bufferDays: -3 }, { bufferDays: 1.9, alternative: 'no' }, 'nope'],
            })
        );
        // Invalid enum/types dropped; negative/fractional buffers handled.
        expect(decoded).toEqual({
            v: 1,
            adventure: {},
            tracks: [{}, { bufferDays: 1 }, {}],
        });
    });
});
