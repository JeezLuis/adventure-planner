import { selection } from '$lib/logic/selection';
import { fileStateCollection } from '$lib/logic/file-state';
import { settings } from '$lib/logic/settings';
import {
    adventures,
    trackPlacements,
    trackBufferDays,
    trackAlternatives,
    trackTags,
} from '$lib/library/library';
import {
    ADVENTURE_EXT_KEY,
    encodeAdventurePayload,
    type TrackMeta,
} from '$lib/logic/adventure-gpx';
import { buildGPX, type GPXFile, type Track } from 'gpx';
import { toast } from 'svelte-sonner';
import { i18n } from '$lib/i18n.svelte';
import FileSaver from 'file-saver';
import JSZip from 'jszip';
import { get } from 'svelte/store';

export enum ExportState {
    NONE,
    SELECTION,
    ALL,
}
export const exportState = $state({
    current: ExportState.NONE,
});

async function exportFiles(fileIds: string[], exclude: string[]) {
    if (fileIds.length > 1) {
        await exportFilesAsZip(fileIds, exclude);
    } else {
        const firstFileId = fileIds.at(0);
        if (firstFileId != null) {
            const file = fileStateCollection.getFile(firstFileId);
            if (file) {
                exportFile(firstFileId, file, exclude);
            }
        }
    }
}

/**
 * The base file name (no extension) for a track export: the track name, prefixed
 * with its numbering/date/ALT tag in brackets when the track has one, e.g.
 * "[3] Day three" or "[ALT] Scenic detour". Slashes from date tags are replaced
 * so the tag is safe in a file name.
 */
function trackExportName(fileId: string, file: GPXFile): string {
    const tag = get(trackTags).get(fileId);
    const prefix = tag ? `[${tag.label.replace(/[/\\]/g, '-')}] ` : '';
    return `${prefix}${file.metadata.name}`;
}

export async function exportSelectedFiles(exclude: string[]) {
    const fileIds: string[] = [];
    selection.applyToOrderedSelectedItemsFromFile(async (fileId, level, items) => {
        fileIds.push(fileId);
    });
    await exportFiles(fileIds, exclude);
}

export async function exportAllFiles(exclude: string[]) {
    await exportFiles(get(settings.fileOrder), exclude);
}

function exportFile(fileId: string, file: GPXFile, exclude: string[]) {
    const blob = new Blob([buildGPX(file, exclude)], { type: 'application/gpx+xml' });
    FileSaver.saveAs(blob, `${trackExportName(fileId, file)}.gpx`);
}

async function exportFilesAsZip(fileIds: string[], exclude: string[]) {
    const zip = new JSZip();
    for (const fileId of fileIds) {
        const file = fileStateCollection.getFile(fileId);
        if (file) {
            const gpx = buildGPX(file, exclude);
            const base = trackExportName(fileId, file);
            let filename = base;
            for (let i = 1; zip.files[filename + '.gpx']; i++) {
                filename = base + `-${i}`;
            }
            zip.file(filename + '.gpx', gpx);
        }
    }
    if (Object.keys(zip.files).length > 0) {
        const blob = await zip.generateAsync({ type: 'blob' });
        FileSaver.saveAs(blob, 'gpx-files.zip');
    }
}

/**
 * Exports one adventure as a single GPX file: one `<trk>` per track (in the
 * library's manual order) plus an `ap:data` payload carrying the adventure's
 * numbering/date/buffer/alternative metadata, so "Import adventure" can rebuild
 * it faithfully. Called from the File menu, guarded on exactly one adventure
 * being selected.
 */
export function exportAdventure(adventureId: string) {
    const adventure = get(adventures).find((a) => a.id === adventureId);
    if (!adventure) {
        return;
    }

    // The adventure's tracks, ordered like the library (same manual order as trackTags).
    const orderIndex = new Map(get(settings.fileOrder).map((id, index) => [id, index]));
    const orderedIds = [...get(trackPlacements).entries()]
        .filter(([, id]) => id === adventureId)
        .map(([fileId]) => fileId)
        .sort((a, b) => (orderIndex.get(a) ?? Infinity) - (orderIndex.get(b) ?? Infinity));

    const entries = orderedIds
        .map((id) => ({ id, file: fileStateCollection.getFile(id) }))
        .filter((entry): entry is { id: string; file: GPXFile } => entry.file != null);

    const trackFiles = entries.filter((entry) => entry.file.trk.length > 0);
    if (trackFiles.length === 0) {
        toast.error(i18n._('library.export_empty', 'This adventure has no tracks to export'));
        return;
    }

    const bufferDays = get(trackBufferDays);
    const alternatives = get(trackAlternatives);
    const tracksMeta: TrackMeta[] = trackFiles.map((entry) => ({
        bufferDays: bufferDays.get(entry.id),
        alternative: alternatives.has(entry.id),
    }));

    // Merge into one file: clone a track file as a scaffold, then swap in one
    // flattened <trk> per adventure track and the union of all waypoints.
    const merged = trackFiles[0].file.clone();
    merged.replaceTracks(
        0,
        merged.trk.length - 1,
        trackFiles.map((entry) => fileToSingleTrack(entry.file))
    );
    const waypoints = entries.flatMap((entry) =>
        entry.file.wpt.map((waypoint) => waypoint.clone())
    );
    merged.replaceWaypoints(0, merged.wpt.length - 1, waypoints);
    merged.metadata = {
        name: adventure.name,
        extensions: { [ADVENTURE_EXT_KEY]: encodeAdventurePayload(adventure, tracksMeta) },
    };

    const blob = new Blob([buildGPX(merged, [])], { type: 'application/gpx+xml' });
    FileSaver.saveAs(blob, `${adventure.name}.gpx`);
}

/**
 * Collapses a track file into a single Track (one `<trk>`): the first track's
 * clone, with any further tracks' segments appended, named after the file so
 * the track name survives re-import. Callers pass only files with a track.
 */
function fileToSingleTrack(file: GPXFile): Track {
    const track = file.trk[0].clone();
    for (let i = 1; i < file.trk.length; i++) {
        track.trkseg.push(...file.trk[i].clone().trkseg);
    }
    track.name = file.metadata.name ?? track.name;
    return track;
}
