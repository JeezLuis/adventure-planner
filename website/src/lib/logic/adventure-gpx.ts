import type { Adventure } from '$lib/library/library';

/**
 * Adventure/track metadata (numbering, dates, buffer days, alternative flags)
 * lives in the local database, not in GPX. To make "Export adventure" and
 * "Import adventure" a faithful round-trip, an exported adventure carries this
 * metadata as a single JSON payload under `<metadata><extensions><ap:data>`
 * (see MetadataExtensions in the gpx package). This module is the one place
 * that defines the payload shape and validates it on the way back in, so a
 * foreign or hand-edited GPX can never inject malformed data.
 */

/** The `<metadata><extensions>` key that carries {@link AdventurePayload}. */
export const ADVENTURE_EXT_KEY = 'ap:data';

/** Current payload schema version; bump on an incompatible shape change. */
const PAYLOAD_VERSION = 1;

const NUMBERING_VALUES = new Set<Adventure['numbering']>(['none', 'numbers', 'date']);

/** Per-track metadata, indexed by the track's position within the adventure. */
export type TrackMeta = {
    bufferDays?: number;
    alternative?: boolean;
};

/** The adventure-level metadata that has no native GPX representation. */
export type AdventureMeta = Pick<
    Adventure,
    'numbering' | 'startDate' | 'showYear' | 'description' | 'advancedMode'
>;

/** The JSON payload embedded in an exported adventure GPX. */
export type AdventurePayload = {
    v: number;
    adventure: AdventureMeta;
    tracks: TrackMeta[];
};

/**
 * Encodes an adventure and its per-track metadata as the JSON string stored
 * under {@link ADVENTURE_EXT_KEY}. Empty/default fields are omitted to keep the
 * payload small and stable (e.g. numbering 'none', zero buffers, false flags).
 * `tracks` must be in the same order as the exported `<trk>` elements.
 */
export function encodeAdventurePayload(adventure: AdventureMeta, tracks: TrackMeta[]): string {
    const adv: AdventureMeta = {};
    if (adventure.numbering && adventure.numbering !== 'none') {
        adv.numbering = adventure.numbering;
    }
    if (adventure.startDate) {
        adv.startDate = adventure.startDate;
    }
    if (adventure.showYear) {
        adv.showYear = true;
    }
    if (adventure.description) {
        adv.description = adventure.description;
    }
    if (adventure.advancedMode) {
        adv.advancedMode = true;
    }
    const payload: AdventurePayload = {
        v: PAYLOAD_VERSION,
        adventure: adv,
        tracks: tracks.map((track) => {
            const meta: TrackMeta = {};
            if (track.bufferDays && track.bufferDays > 0) {
                meta.bufferDays = track.bufferDays;
            }
            if (track.alternative) {
                meta.alternative = true;
            }
            return meta;
        }),
    };
    return JSON.stringify(payload);
}

/**
 * Decodes and validates the payload from {@link ADVENTURE_EXT_KEY}. Returns
 * null for a missing, unparseable, or unknown-version payload so the importer
 * can fall back to the plain "name + tracks" behaviour. Every field is
 * sanitized, so a valid-JSON-but-wrong-shape file yields safe defaults rather
 * than corrupt adventure state.
 */
export function decodeAdventurePayload(raw: string | undefined): AdventurePayload | null {
    if (!raw) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.v !== PAYLOAD_VERSION) {
        return null;
    }
    return {
        v: PAYLOAD_VERSION,
        adventure: sanitizeAdventureMeta(obj.adventure),
        tracks: Array.isArray(obj.tracks) ? obj.tracks.map(sanitizeTrackMeta) : [],
    };
}

function sanitizeAdventureMeta(value: unknown): AdventureMeta {
    const meta: AdventureMeta = {};
    if (typeof value !== 'object' || value === null) {
        return meta;
    }
    const obj = value as Record<string, unknown>;
    if (
        typeof obj.numbering === 'string' &&
        NUMBERING_VALUES.has(obj.numbering as Adventure['numbering'])
    ) {
        meta.numbering = obj.numbering as Adventure['numbering'];
    }
    if (typeof obj.startDate === 'string') {
        meta.startDate = obj.startDate;
    }
    if (typeof obj.showYear === 'boolean') {
        meta.showYear = obj.showYear;
    }
    if (typeof obj.description === 'string') {
        meta.description = obj.description;
    }
    if (typeof obj.advancedMode === 'boolean') {
        meta.advancedMode = obj.advancedMode;
    }
    return meta;
}

function sanitizeTrackMeta(value: unknown): TrackMeta {
    const meta: TrackMeta = {};
    if (typeof value !== 'object' || value === null) {
        return meta;
    }
    const obj = value as Record<string, unknown>;
    if (
        typeof obj.bufferDays === 'number' &&
        Number.isFinite(obj.bufferDays) &&
        obj.bufferDays > 0
    ) {
        meta.bufferDays = Math.floor(obj.bufferDays);
    }
    if (typeof obj.alternative === 'boolean') {
        meta.alternative = obj.alternative;
    }
    return meta;
}
