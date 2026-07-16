/**
 * Options of the "Send to OsmAnd" export and their validation. Kept free of
 * heavy imports (gpx, jszip, marked, icon assets) so the settings registry and
 * the dialog can depend on it without pulling the whole exporter into their
 * import chain; the exporter itself lives in ./osmand-export.ts.
 */

/** OsmAnd activity ids we offer (verified against OsmAnd-resources activities.json). */
export const OSMAND_ACTIVITIES = [
    'none',
    'adventure_motorcycling',
    'enduro_motorcycling',
    'off_road',
    'car',
] as const;

export type OsmandActivity = (typeof OSMAND_ACTIVITIES)[number];

/** User-facing options of the OsmAnd export dialog; persisted as a setting. */
export type OsmandExportOptions = {
    /** Line color of main tracks, #RRGGBB. */
    mainColor: string;
    /** Line color of alternative tracks, #RRGGBB (alpha added separately). */
    alternativeColor: string;
    /** Opacity of alternative tracks, 0..1, encoded in the color's alpha channel. */
    alternativeOpacity: number;
    /** OsmAnd line width, integer 1..24. */
    width: number;
    /** Render direction arrows along the tracks. */
    showArrows: boolean;
    /** Render start and finish markers. */
    showStartFinish: boolean;
    /** Emit "done | left" milestone waypoints along the main route. */
    milestones: boolean;
    /** Distance between milestone waypoints, km. */
    milestoneIntervalKm: number;
    /** OsmAnd activity id stored in the track metadata ('none' = omit). */
    activity: OsmandActivity;
};

export const DEFAULT_OSMAND_EXPORT_OPTIONS: OsmandExportOptions = {
    mainColor: '#ff00ff',
    alternativeColor: '#00ff00',
    alternativeOpacity: 0.5,
    width: 20,
    showArrows: true,
    showStartFinish: true,
    // Off by default: the milestone waypoints are an acquired taste; the
    // dialog remembers the choice once enabled.
    milestones: false,
    milestoneIntervalKm: 25,
    activity: 'adventure_motorcycling',
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Sanitizes persisted/user-provided options field by field, falling back to
 * the defaults, so a stale or hand-edited settings row can never produce an
 * invalid package (also used as the setting's validator).
 */
export function sanitizeOsmandExportOptions(value: unknown): OsmandExportOptions {
    const defaults = DEFAULT_OSMAND_EXPORT_OPTIONS;
    if (typeof value !== 'object' || value === null) {
        return { ...defaults };
    }
    const raw = value as Record<string, unknown>;
    const color = (field: string, fallback: string) =>
        typeof raw[field] === 'string' && HEX_COLOR.test(raw[field] as string)
            ? (raw[field] as string).toLowerCase()
            : fallback;
    const bool = (field: string, fallback: boolean) =>
        typeof raw[field] === 'boolean' ? (raw[field] as boolean) : fallback;
    return {
        mainColor: color('mainColor', defaults.mainColor),
        alternativeColor: color('alternativeColor', defaults.alternativeColor),
        alternativeOpacity:
            typeof raw.alternativeOpacity === 'number' && Number.isFinite(raw.alternativeOpacity)
                ? clamp(raw.alternativeOpacity, 0, 1)
                : defaults.alternativeOpacity,
        width:
            typeof raw.width === 'number' && Number.isFinite(raw.width)
                ? clamp(Math.round(raw.width), 1, 24)
                : defaults.width,
        showArrows: bool('showArrows', defaults.showArrows),
        showStartFinish: bool('showStartFinish', defaults.showStartFinish),
        milestones: bool('milestones', defaults.milestones),
        milestoneIntervalKm:
            typeof raw.milestoneIntervalKm === 'number' && Number.isFinite(raw.milestoneIntervalKm)
                ? clamp(Math.round(raw.milestoneIntervalKm), 5, 500)
                : defaults.milestoneIntervalKm,
        activity: OSMAND_ACTIVITIES.includes(raw.activity as OsmandActivity)
            ? (raw.activity as OsmandActivity)
            : defaults.activity,
    };
}

/**
 * Applies an opacity to a #RRGGBB color as an alpha channel, producing the
 * #AARRGGBB form OsmAnd uses for translucent tracks. Full opacity keeps the
 * plain 6-digit form.
 */
export function colorWithOpacity(color: string, opacity: number): string {
    const normalized = color.toLowerCase();
    if (opacity >= 1) {
        return normalized;
    }
    const alpha = Math.round(clamp(opacity, 0, 1) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${alpha}${normalized.slice(1)}`;
}
