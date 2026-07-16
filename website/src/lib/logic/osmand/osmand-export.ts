import JSZip from 'jszip';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import {
    buildGPXFromType,
    distance,
    type GPXFile,
    type GPXFileExtensions,
    type GPXFileType,
    type MetadataExtensions,
    type TrackPoint,
    type WaypointType,
} from 'gpx';
import { parsePlanDoc } from '$lib/logic/plan-doc';
import {
    colorWithOpacity,
    sanitizeOsmandExportOptions,
    type OsmandExportOptions,
} from './osmand-options';
import { OSMAND_BACKGROUND, osmandWaypointStyle, type OsmandWaypointStyle } from './osmand-symbols';

/**
 * "Send to OsmAnd" export: packages one adventure as an OsmAnd `.osf` file.
 *
 * An `.osf` is a renamed zip holding an `items.json` manifest plus the files it
 * references. Opening it with OsmAnd (Android 3.7+ / iOS 4.0+, free app)
 * imports everything in one tap. We emit one GPX per track under
 * `tracks/<adventure>/...`, each manifest entry carrying the appearance OsmAnd
 * stores in its track database (color, width, arrows, start/finish), so the
 * whole adventure lands as a pre-styled folder: main tracks in one color,
 * alternatives in another (with opacity via the color's alpha channel).
 * The same appearance is ALSO written as `osmand:*` GPX extensions inside each
 * file, so a bare GPX pulled out of the package keeps its styling.
 *
 * References:
 * - GPX extensions: https://docs.osmand.net/docs/technical/osmand-file-formats/osmand-gpx
 * - .osf packaging:  https://docs.osmand.net/docs/user/plugins/custom/
 * - Appearance keys: OsmAnd `GpxAppearanceInfo.java` (color, width, show_arrows,
 *   show_start_finish), applied to the track database on import.
 * See docs/research/osmand-integration.md for the full feasibility study.
 *
 * This module is pure logic (no Svelte, no stores, no DOM) so it is unit
 * testable; the UI glue lives in $lib/components/export/utils.svelte.ts.
 */

/** The adventure-level inputs of the export. */
export type OsmandAdventureInput = {
    name: string;
    /** The adventure's plan document (Markdown), rendered to HTML descriptions. */
    planDoc?: string;
    /** Free-form adventure notes (the subtitle of the plan-mode overview). */
    description?: string;
    /** Numbering mode; 'date' makes stage labels read as trip dates. */
    numbering?: 'none' | 'numbers' | 'date';
};

/**
 * The translatable words used inside the generated descriptions. The export
 * module is pure (no i18n runtime), so the UI passes the localized words in;
 * defaults keep tests and headless callers working in English.
 */
export type OsmandExportLabels = {
    stages: string;
    alternatives: string;
    itinerary: string;
};

export const DEFAULT_OSMAND_EXPORT_LABELS: OsmandExportLabels = {
    stages: 'stages',
    alternatives: 'alternatives',
    itinerary: 'Itinerary',
};

/** One track of the adventure, in library order. */
export type OsmandTrackInput = {
    file: GPXFile;
    /** The library's numbering/date tag label, when the adventure has one. */
    stageLabel?: string;
    alternative: boolean;
    bufferDays?: number;
};

/** One GPX file of the package plus its items.json manifest entry. */
export type OsmandGpxEntry = {
    /** Path inside the .osf zip (also the item's `file` value). */
    path: string;
    fileName: string;
    xml: string;
    item: OsmandGpxItem;
};

/**
 * An items.json GPX entry. The appearance keys are flat on the item, exactly
 * as OsmAnd's `GpxAppearanceInfo` reads them, and are applied to the imported
 * track's appearance database.
 */
export type OsmandGpxItem = {
    type: 'GPX';
    file: string;
    color: string;
    width: string;
    show_arrows: boolean;
    show_start_finish: boolean;
};

export type OsmandPackageParts = {
    /** The adventure folder name under OsmAnd's Tracks directory. */
    folder: string;
    entries: OsmandGpxEntry[];
    itemsJson: string;
};

/** Group appearance of the generated milestone waypoints. */
export const MILESTONE_GROUP = 'Milestones';
export const MILESTONE_ICON = 'special_marker';
export const MILESTONE_COLOR = '#64748b';

/** Strips characters that are unsafe in file/folder names across platforms. */
function sanitizeFileName(name: string): string {
    return name
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/^[\s.]+|[\s.]+$/g, '');
}

const OSMAND_HTML_POLICY: sanitizeHtml.IOptions = {
    // The subset OsmAnd renders in track/waypoint descriptions (Android
    // Html.fromHtml-compatible; no tables, no scripts, no styling).
    allowedTags: ['p', 'br', 'b', 'i', 'strong', 'em', 'a', 'img', 'ul', 'ol', 'li', 'blockquote'],
    allowedAttributes: { a: ['href'], img: ['src', 'alt'] },
};

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Renders a plan document (Markdown) to the HTML subset OsmAnd displays in the
 * track Description. Checklists become ☑/☐ lines and tables become
 * pipe-separated lines, because OsmAnd's HTML view has no checkbox or table
 * support; notes go through the Markdown renderer and are then sanitized.
 */
export function planDocToHtml(markdown: string | undefined | null): string {
    const blocks = parsePlanDoc(markdown);
    const parts: string[] = [];
    for (const block of blocks) {
        const title = block.title ? `<p><b>${escapeHtml(block.title)}</b></p>` : '';
        if (block.type === 'note') {
            const rendered = block.markdown
                ? sanitizeHtml(
                      marked.parse(block.markdown, { gfm: true, async: false }) as string,
                      OSMAND_HTML_POLICY
                  )
                : '';
            if (title || rendered) {
                parts.push(title + rendered);
            }
        } else if (block.type === 'checklist') {
            const lines = block.items.map((item) => {
                const label = item.url
                    ? `<a href="${escapeHtml(item.url)}">${escapeHtml(item.text)}</a>`
                    : escapeHtml(item.text);
                const quantity = item.quantity
                    ? ` (${escapeHtml(item.quantity)}${item.units ? ` ${escapeHtml(item.units)}` : ''})`
                    : '';
                return `${item.checked ? '☑' : '☐'} ${label}${quantity}`;
            });
            if (title || lines.length > 0) {
                parts.push(`${title}${lines.length > 0 ? `<p>${lines.join('<br/>')}</p>` : ''}`);
            }
        } else {
            const rows = [block.headers, ...block.rows].map((row) =>
                row.map((cell) => escapeHtml(cell ?? '')).join(' | ')
            );
            parts.push(`${title}<p>${rows.join('<br/>')}</p>`);
        }
    }
    return parts.join('');
}

/** A plain-text note as an HTML paragraph, newlines preserved. */
function noteParagraph(note: string | undefined): string {
    const text = note?.trim();
    return text ? `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>` : '';
}

/** Per-track facts shown in the descriptions, mirroring the plan-mode page. */
type TrackFacts = {
    /** "[tag] Name" or "Name (ALT)": how the track is listed in the itinerary. */
    label: string;
    distanceKm: number;
    ascent: number;
    descent: number;
};

function trackFacts(input: OsmandTrackInput): TrackFacts {
    const stats = input.file.getStatistics().global;
    const base = input.file.metadata.name?.trim() || input.file.trk[0]?.name?.trim() || 'Track';
    const tag = input.stageLabel && !input.alternative ? `[${input.stageLabel}] ` : '';
    return {
        label: `${tag}${base}${input.alternative ? ' (ALT)' : ''}`,
        distanceKm: stats.distance.total,
        ascent: stats.elevation.gain,
        descent: stats.elevation.loss,
    };
}

function formatKm(km: number): string {
    return `${Math.round(km)} km`;
}

/**
 * The adventure header of every description: bold title (which doubles as
 * OsmAnd's collapsed summary line), the plan-mode overview facts (total km
 * over the main tracks, stage/alternative counts, the date range when the
 * adventure is numbered by dates) and the adventure notes as a subtitle.
 */
function overviewHtml(
    adventure: OsmandAdventureInput,
    tracks: OsmandTrackInput[],
    facts: TrackFacts[],
    labels: OsmandExportLabels
): string {
    const mains = tracks.filter((input) => !input.alternative);
    const totalKm = facts.reduce(
        (sum, fact, index) => sum + (tracks[index].alternative ? 0 : fact.distanceKm),
        0
    );
    const bits = [formatKm(totalKm), `${mains.length} ${labels.stages}`];
    const alternatives = tracks.length - mains.length;
    if (alternatives > 0) {
        bits.push(`${alternatives} ${labels.alternatives}`);
    }
    if (adventure.numbering === 'date') {
        const dates = mains
            .map((input) => input.stageLabel)
            .filter((label): label is string => !!label);
        if (dates.length > 0) {
            bits.push(`${dates[0]} - ${dates[dates.length - 1]}`);
        }
    }
    return (
        `<p><b>${escapeHtml(adventure.name)}</b></p>` +
        `<p>${bits.map(escapeHtml).join(' · ')}</p>` +
        (adventure.description?.trim()
            ? `<p><i>${escapeHtml(adventure.description.trim()).replace(/\n/g, '<br/>')}</i></p>`
            : '')
    );
}

/** The "this track" line: label, distance and (when present) ascent/descent. */
function stageHtml(fact: TrackFacts): string {
    const bits = [formatKm(fact.distanceKm)];
    if (Math.round(fact.ascent) > 0 || Math.round(fact.descent) > 0) {
        bits.push(`+${Math.round(fact.ascent)} m / -${Math.round(fact.descent)} m`);
    }
    return `<p><b>${escapeHtml(fact.label)}</b> · ${bits.map(escapeHtml).join(' · ')}</p>`;
}

/** The full track list with distances, appended to every description. */
function itineraryHtml(facts: TrackFacts[], labels: OsmandExportLabels): string {
    const lines = facts.map((fact) => escapeHtml(`${fact.label} · ${formatKm(fact.distanceKm)}`));
    return `<p><b>${escapeHtml(labels.itinerary)}</b></p><p>${lines.join('<br/>')}</p>`;
}

/**
 * Places "done | left" milestone waypoints every `intervalKm` along the main
 * route (alternatives excluded), with the distance accumulating continuously
 * across the adventure's main tracks in order. Returns the milestones grouped
 * by the index of the track they fall on. Gaps between consecutive tracks
 * (transfers, ferries docking elsewhere) do not add distance.
 */
function computeMilestones(
    tracks: OsmandTrackInput[],
    intervalKm: number
): Map<number, WaypointType[]> {
    const mains: { index: number; points: TrackPoint[] }[] = [];
    tracks.forEach((input, index) => {
        if (input.alternative) {
            return;
        }
        const points = input.file.trk
            .flatMap((track) => track.trkseg)
            .flatMap((segment) => segment.trkpt);
        if (points.length > 1) {
            mains.push({ index, points });
        }
    });

    let totalKm = 0;
    for (const { points } of mains) {
        for (let i = 1; i < points.length; i++) {
            totalKm += distance(points[i - 1], points[i]) / 1000;
        }
    }

    const milestones = new Map<number, WaypointType[]>();
    if (totalKm < intervalKm) {
        return milestones;
    }

    let doneKm = 0;
    let nextMarkKm = intervalKm;
    for (const { index, points } of mains) {
        for (let i = 1; i < points.length; i++) {
            doneKm += distance(points[i - 1], points[i]) / 1000;
            while (doneKm >= nextMarkKm) {
                const leftKm = Math.round(totalKm - nextMarkKm);
                if (leftKm >= 1) {
                    const wpts = milestones.get(index) ?? [];
                    wpts.push({
                        attributes: {
                            lat: points[i].attributes.lat,
                            lon: points[i].attributes.lon,
                        },
                        ele: points[i].ele,
                        name: `${nextMarkKm} km | ${leftKm} km left`,
                        type: MILESTONE_GROUP,
                        extensions: {
                            'osmand:icon': MILESTONE_ICON,
                            'osmand:color': MILESTONE_COLOR,
                            'osmand:background': OSMAND_BACKGROUND,
                        },
                    });
                    milestones.set(index, wpts);
                }
                nextMarkKm += intervalKm;
            }
        }
    }
    return milestones;
}

/** Applies the OsmAnd waypoint appearance and registers the waypoint's group. */
function styleWaypoint(wpt: WaypointType, groups: Map<string, OsmandWaypointStyle>): WaypointType {
    const style = osmandWaypointStyle(wpt.sym);
    if (!groups.has(style.group)) {
        groups.set(style.group, style);
    }
    return {
        ...wpt,
        type: style.group,
        extensions: {
            ...wpt.extensions,
            'osmand:icon': style.icon,
            'osmand:color': style.color,
            'osmand:background': style.background,
        },
    };
}

type EntryContext = {
    folder: string;
    adventure: OsmandAdventureInput;
    options: OsmandExportOptions;
    facts: TrackFacts[];
    /** Description parts shared by every file of the package. */
    overviewHtml: string;
    planHtml: string;
    itineraryHtml: string;
    milestones: Map<number, WaypointType[]>;
    usedNames: Set<string>;
};

function buildTrackEntry(
    input: OsmandTrackInput,
    index: number,
    ctx: EntryContext
): OsmandGpxEntry {
    const gpx = input.file.toGPXFileType([]);

    // One <trk> per file: OsmAnd names the imported track after the file, so
    // the track name is carried by the file name and the single <trk>.
    if (gpx.trk.length > 1) {
        gpx.trk = [{ ...gpx.trk[0], trkseg: gpx.trk.flatMap((track) => track.trkseg) }];
    }
    if (gpx.trk.length === 1) {
        gpx.trk[0].name = gpx.metadata.name ?? gpx.trk[0].name;
    }

    const color = input.alternative
        ? colorWithOpacity(ctx.options.alternativeColor, ctx.options.alternativeOpacity)
        : ctx.options.mainColor;

    const groups = new Map<string, OsmandWaypointStyle>();
    gpx.wpt = gpx.wpt.map((wpt) => styleWaypoint(wpt, groups));
    const milestones = ctx.milestones.get(index);
    if (milestones && milestones.length > 0) {
        gpx.wpt.push(...milestones);
        groups.set(MILESTONE_GROUP, {
            group: MILESTONE_GROUP,
            icon: MILESTONE_ICON,
            color: MILESTONE_COLOR,
            background: OSMAND_BACKGROUND,
        });
    }

    // The description mirrors the plan-mode page: adventure header (title,
    // totals, dates, notes), this track's own line and note, the plan
    // document, and the full itinerary.
    gpx.metadata.desc =
        ctx.overviewHtml +
        stageHtml(ctx.facts[index]) +
        noteParagraph(gpx.trk[0]?.desc) +
        ctx.planHtml +
        ctx.itineraryHtml;

    // Readable metadata tags: OsmAnd (Android 5.0+) lists them in the track
    // context menu. The app-private ap:data payload is dropped: this export is
    // one-way and the JSON blob would only show up as noise in OsmAnd's UI.
    const metaExtensions: MetadataExtensions = { ...gpx.metadata.extensions };
    delete metaExtensions['ap:data'];
    if (ctx.options.activity !== 'none') {
        metaExtensions['osmand:activity'] = ctx.options.activity;
    }
    metaExtensions.adventure = ctx.adventure.name;
    if (input.stageLabel && !input.alternative) {
        metaExtensions.stage = input.stageLabel;
    }
    if (input.alternative) {
        metaExtensions.alternative = 'yes';
    }
    if (input.bufferDays && input.bufferDays > 0) {
        metaExtensions.buffer_days = String(input.bufferDays);
    }
    gpx.metadata.extensions = metaExtensions;

    const extensions: GPXFileExtensions = {
        'osmand:color': color,
        'osmand:width': String(ctx.options.width),
        'osmand:show_arrows': ctx.options.showArrows ? 'true' : 'false',
        'osmand:show_start_finish': ctx.options.showStartFinish ? 'true' : 'false',
    };
    if (groups.size > 0) {
        extensions['osmand:points_groups'] = {
            group: [...groups.values()].map((style) => ({
                attributes: {
                    name: style.group,
                    color: style.color,
                    icon: style.icon,
                    background: style.background,
                },
            })),
        };
    }

    const output: GPXFileType = { ...gpx, extensions };
    const xml = buildGPXFromType(output);

    const base = gpx.metadata.name?.trim() || gpx.trk[0]?.name?.trim() || 'Track';
    const stagePrefix =
        input.stageLabel && !input.alternative
            ? `[${input.stageLabel.replace(/[/\\]/g, '-')}] `
            : '';
    const altSuffix = input.alternative ? ' (ALT)' : '';
    const stem = sanitizeFileName(
        `${String(index + 1).padStart(2, '0')} - ${stagePrefix}${base}${altSuffix}`
    );
    let fileName = `${stem}.gpx`;
    for (let n = 1; ctx.usedNames.has(fileName); n++) {
        fileName = `${stem}-${n}.gpx`;
    }
    ctx.usedNames.add(fileName);

    const path = `tracks/${ctx.folder}/${fileName}`;
    return {
        path,
        fileName,
        xml,
        item: {
            type: 'GPX',
            file: path,
            color,
            width: String(ctx.options.width),
            show_arrows: ctx.options.showArrows,
            show_start_finish: ctx.options.showStartFinish,
        },
    };
}

/**
 * Builds the package contents: one styled GPX per track plus the items.json
 * manifest. Pure and synchronous, for tests; {@link buildOsmandPackage} wraps
 * it into the downloadable .osf blob.
 */
export function buildOsmandPackageParts(
    adventure: OsmandAdventureInput,
    tracks: OsmandTrackInput[],
    rawOptions: OsmandExportOptions,
    labels: OsmandExportLabels = DEFAULT_OSMAND_EXPORT_LABELS
): OsmandPackageParts {
    if (tracks.length === 0) {
        throw new Error('Cannot build an OsmAnd package without tracks');
    }
    const options = sanitizeOsmandExportOptions(rawOptions);
    const folder = sanitizeFileName(adventure.name) || 'Adventure';
    const facts = tracks.map(trackFacts);
    const ctx: EntryContext = {
        folder,
        adventure,
        options,
        facts,
        overviewHtml: overviewHtml(adventure, tracks, facts, labels),
        planHtml: planDocToHtml(adventure.planDoc),
        itineraryHtml: itineraryHtml(facts, labels),
        milestones: options.milestones
            ? computeMilestones(tracks, options.milestoneIntervalKm)
            : new Map(),
        usedNames: new Set(),
    };
    const entries = tracks.map((input, index) => buildTrackEntry(input, index, ctx));
    const itemsJson = JSON.stringify(
        { version: 1, items: entries.map((entry) => entry.item) },
        null,
        1
    );
    return { folder, entries, itemsJson };
}

/** Builds the final .osf (a zip): items.json + tracks/<adventure>/<track>.gpx. */
export async function buildOsmandPackage(
    adventure: OsmandAdventureInput,
    tracks: OsmandTrackInput[],
    options: OsmandExportOptions,
    labels: OsmandExportLabels = DEFAULT_OSMAND_EXPORT_LABELS
): Promise<{ fileName: string; blob: Blob }> {
    const parts = buildOsmandPackageParts(adventure, tracks, options, labels);
    const zip = new JSZip();
    zip.file('items.json', parts.itemsJson);
    for (const entry of parts.entries) {
        zip.file(entry.path, entry.xml);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return { fileName: `${parts.folder}.osf`, blob };
}
