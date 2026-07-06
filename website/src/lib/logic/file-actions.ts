import { fileStateCollection } from '$lib/logic/file-state';
import { fileActionManager } from '$lib/logic/file-action-manager';
import { applyToOrderedItemsFromFile, copied, cut, selection } from '$lib/logic/selection';
import { currentTool, Tool } from '$lib/components/toolbar/tools';
import { SplitType } from '$lib/components/toolbar/tools/scissors/scissors';
import {
    ListFileItem,
    ListLevel,
    ListRootItem,
    ListTrackItem,
    ListTrackSegmentItem,
    ListWaypointItem,
    ListWaypointsItem,
    sortItems,
    type ListItem,
} from '$lib/components/file-list/file-list';
import { i18n } from '$lib/i18n.svelte';
import { toast } from 'svelte-sonner';
import { freeze, type WritableDraft } from 'immer';
import {
    GPXFile,
    parseGPX,
    Track,
    TrackPoint,
    TrackSegment,
    Waypoint,
    distance,
    type Coordinates,
    type LineStyleExtension,
    type WaypointType,
} from 'gpx';
import { get } from 'svelte/store';
import { settings } from '$lib/logic/settings';
import { getClosestLinePoint, getClosestTrackSegments, getElevation } from '$lib/utils';
import { gpxStatistics } from '$lib/logic/statistics';
import { boundsManager } from './bounds';
import {
    adventures,
    adventureIdsOfSelection,
    clearRestoredPlacement,
    createAdventure,
    deleteAdventure,
    deleteExpeditionCascade,
    expeditions,
    queuePlacement,
    selectLibraryItem,
    trackPlacements,
    updateAdventure,
    type LibrarySelectionItem,
} from '$lib/library/library';
import {
    ADVENTURE_EXT_KEY,
    decodeAdventurePayload,
    type AdventurePayload,
} from '$lib/logic/adventure-gpx';
import { FERRY_COLOR, FERRY_TRACK_TYPE, getFerryRoute, shortPlaceName } from '$lib/logic/ferry';

/**
 * Deletes an adventure or an expedition (with everything nested below it)
 * together with all the tracks it contains. The tracks are deleted through
 * the file action manager, so THAT part is undoable; the library containers
 * themselves are not.
 */
export async function deleteLibraryItem(item: LibrarySelectionItem): Promise<void> {
    const adventureIds = adventureIdsOfSelection([item], get(expeditions), get(adventures));
    const fileIds: string[] = [];
    get(trackPlacements).forEach((adventureId, fileId) => {
        if (adventureIds.has(adventureId)) {
            fileIds.push(fileId);
        }
    });
    if (fileIds.length > 0) {
        fileActionManager.applyGlobal((draft) => {
            fileIds.forEach((fileId) => draft.delete(fileId));
        });
    }
    if (item.kind === 'adventure') {
        await deleteAdventure(item.id);
    } else {
        await deleteExpeditionCascade(item.id);
    }
}

// Generate unique file ids, different from the ones in the database
export function getFileIds(n: number) {
    let ids = [];
    for (let index = 0; ids.length < n; index++) {
        let id = `gpx-${index}`;
        if (!fileStateCollection.getFile(id)) {
            ids.push(id);
        }
    }
    // These ids belong to genuinely new files, so drop any restore-stash left
    // by a deleted track that once used the same id (R6): a new track must land
    // in the selected adventure, not inherit the deleted one's.
    ids.forEach(clearRestoredPlacement);
    return ids;
}

export function newGPXFile() {
    const newFileName = i18n._('menu.new_file');

    let file = new GPXFile();

    let maxNewFileNumber = 0;
    fileStateCollection.forEach((fileId, file) => {
        if (file.metadata.name && file.metadata.name.startsWith(newFileName)) {
            let number = parseInt(file.metadata.name.split(' ').pop() ?? '0');
            if (!isNaN(number) && number > maxNewFileNumber) {
                maxNewFileNumber = number;
            }
        }
    });

    file.metadata.name = `${newFileName} ${maxNewFileNumber + 1}`;

    return file;
}

export function createFile() {
    let file = newGPXFile();

    fileActions.add(file);
    selection.selectFileWhenLoaded(file._data.id);
    currentTool.set(Tool.ROUTING);
}

/**
 * Adds a ferry trip (a sea crossing) as a new track in the given adventure.
 * The maritime path comes from {@link getFerryRoute}; the track is marked with
 * the standard GPX `<trk><type>ferry</type>` and styled a maritime blue, both
 * of which round-trip through export/import and other editors with no
 * app-specific data. Timestamps are spread across the points by distance so the
 * leg runs at a constant speed between the scheduled departure and arrival; the
 * arrival's whole-day offset becomes the placement's buffer days, so a
 * date-numbered adventure pushes the following stages back by the length of the
 * crossing. Shows a toast and does nothing when not even a fallback line could
 * be produced.
 */
export async function createFerryTrip(opts: {
    adventureId: string;
    from: Coordinates;
    to: Coordinates;
    fromName: string;
    toName: string;
    departure: Date;
    arrival: Date;
    dayOffset: number;
}): Promise<void> {
    const { adventureId, from, to, fromName, toName, departure, arrival, dayOffset } = opts;

    const { points, approximate } = await getFerryRoute(from, to);
    if (points.length < 2) {
        toast.error(
            i18n._('library.ferry_error_route', 'Could not compute a sea route between these ports')
        );
        return;
    }

    // Constant speed: spread the scheduled duration across the points by their
    // cumulative distance, so the first point is exactly the departure and the
    // last exactly the arrival. Setting the times on the plain points before the
    // file is committed keeps the whole creation a single undoable action.
    const cumulative: number[] = [0];
    for (let i = 1; i < points.length; i++) {
        cumulative.push(
            cumulative[i - 1] + distance(points[i - 1].getCoordinates(), points[i].getCoordinates())
        );
    }
    const totalDistance = cumulative[cumulative.length - 1] || 1;
    const departureMs = departure.getTime();
    const spanMs = Math.max(0, arrival.getTime() - departureMs);
    points.forEach((point, i) => {
        point.time = new Date(departureMs + (spanMs * cumulative[i]) / totalDistance);
    });

    const file = newGPXFile();
    file.metadata.name = i18n
        ._('library.ferry_default_name', 'Ferry: {from} → {to}')
        .replace('{from}', shortPlaceName(fromName))
        .replace('{to}', shortPlaceName(toName));
    const track = new Track({
        type: FERRY_TRACK_TYPE,
        trkseg: [new TrackSegment({ trkpt: points })],
    });
    file.replaceTracks(0, file.trk.length - 1, [track]);
    file.setStyle({ 'gpx_style:color': FERRY_COLOR });

    const id = getFileIds(1)[0];
    file._data.id = id;
    // Queue the placement (with the crossing's whole-day span as buffer days)
    // before adding the file, so the library 'creating' hook writes the
    // complete row in one put rather than racing a later update.
    queuePlacement(id, adventureId, { bufferDays: Math.max(0, Math.floor(dayOffset)) });
    fileActions.add(file);

    selection.selectFileWhenLoaded(id);
    boundsManager.fitBoundsOnLoad([id]);

    if (approximate) {
        toast.warning(
            i18n._(
                'library.ferry_approximate',
                'No sea route found between these ports; drew a direct line instead'
            )
        );
    }
}

/**
 * Opens the GPX file picker and hands the chosen files to `onFiles`. Defaults
 * to "import track" ({@link loadFiles}); "import adventure" passes its own
 * handler (see {@link importAdventures}).
 */
export function triggerFileInput(onFiles: (files: FileList) => void = loadFiles) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx';
    input.multiple = true;
    input.className = 'hidden';
    input.onchange = () => {
        if (input.files) {
            onFiles(input.files);
        }
    };
    input.click();
}

async function loadAll(list: FileList | File[]): Promise<GPXFile[]> {
    let files: GPXFile[] = [];
    for (let i = 0; i < list.length; i++) {
        let file = await loadFile(list[i]);
        if (file) {
            files.push(file);
        }
    }
    return files;
}

/**
 * Imports GPX files as tracks in the currently selected adventure ("import
 * track"): each file becomes one track, placed by the library's 'creating'
 * hook. Callers guard this on a selected adventure (see LibraryActions /
 * LibraryTracks), so no track is left unplaced.
 */
export async function loadFiles(list: FileList | File[]) {
    let files = await loadAll(list);
    if (files.length === 0) {
        return;
    }
    let ids = fileActions.addMultiple(files);
    selection.selectFileWhenLoaded(ids[0]);
    boundsManager.fitBoundsOnLoad(ids);
}

/**
 * Splits a loaded GPX file into one GPXFile per "section" - per track when it
 * has several, otherwise per segment of its single track - so "import
 * adventure" can turn each section into its own track. Waypoints stay on the
 * first section; ids are assigned by the caller.
 */
function buildSections(file: GPXFile): GPXFile[] {
    const sections: GPXFile[] = [];
    const clearWaypointsIfNotFirst = (newFile: GPXFile) => {
        if (sections.length > 0 && newFile.wpt.length > 0) {
            newFile.replaceWaypoints(0, newFile.wpt.length - 1, []);
        }
    };
    if (file.trk.length > 1) {
        file.trk.forEach((track, index) => {
            const newFile = file.clone();
            newFile.replaceTracks(0, file.trk.length - 1, [track.clone()]);
            newFile.metadata = {
                ...newFile.metadata,
                name: track.name ?? `${file.metadata.name ?? ''} (${index + 1})`,
            };
            clearWaypointsIfNotFirst(newFile);
            sections.push(newFile);
        });
    } else if (file.trk.length === 1 && file.trk[0].trkseg.length > 1) {
        const track = file.trk[0];
        track.trkseg.forEach((segment, index) => {
            const newFile = file.clone();
            const newTrack = track.clone();
            newTrack.replaceTrackSegments(0, track.trkseg.length - 1, [segment]);
            newFile.replaceTracks(0, 0, [newTrack]);
            newFile.metadata = {
                ...newFile.metadata,
                name: `${track.name ?? file.metadata.name ?? ''} (${index + 1})`,
            };
            clearWaypointsIfNotFirst(newFile);
            sections.push(newFile);
        });
    } else {
        sections.push(file);
    }
    return sections;
}

/**
 * Splits a file into one GPXFile per `<trk>`, used when re-importing an
 * adventure we exported: the export writes exactly one `<trk>` per track, so
 * this restores the same tracks 1:1 - unlike {@link buildSections}, it never
 * splits a single multi-segment track by segment. Each track's name comes from
 * the `<trk>` name the export stamped; waypoints stay on the first section.
 */
function splitByTrack(file: GPXFile): GPXFile[] {
    if (file.trk.length === 0) {
        return [file];
    }
    return file.trk.map((track, index) => {
        const newFile = file.clone();
        newFile.replaceTracks(0, file.trk.length - 1, [track.clone()]);
        newFile.metadata = {
            ...newFile.metadata,
            name: track.name ?? `${file.metadata.name ?? ''} (${index + 1})`,
        };
        if (index > 0 && newFile.wpt.length > 0) {
            newFile.replaceWaypoints(0, newFile.wpt.length - 1, []);
        }
        return newFile;
    });
}

/**
 * Imports each GPX file as a new adventure inside the given expedition (null =
 * root): the file name becomes the adventure name and each of its sections
 * becomes a track. This is the "import adventure" action and the destination
 * for share/URL imports, keeping the "every track lives in an adventure"
 * invariant even when no adventure is selected.
 */
export async function importAdventures(
    list: FileList | File[],
    expeditionId: string | null
): Promise<void> {
    const files = await loadAll(list);
    if (files.length === 0) {
        return;
    }
    // One entry per file: the created adventure plus the optional round-trip
    // payload, present only for GPX files that "Export adventure" produced.
    const perFile: {
        file: GPXFile;
        adventureId: string;
        payload: AdventurePayload | null;
    }[] = [];
    for (const file of files) {
        const payload = decodeAdventurePayload(file.metadata.extensions?.[ADVENTURE_EXT_KEY]);
        const name =
            file.metadata.name?.trim() ||
            i18n._('library.imported_adventure', 'Imported adventure');
        const adventureId = await createAdventure(expeditionId, name);
        // Restore the adventure-level metadata now: the row already exists and
        // has no dependency on the tracks created below. Per-track metadata is
        // handled through queuePlacement instead (see below).
        if (payload) {
            await updateAdventure(adventureId, {
                name,
                description: payload.adventure.description,
                numbering: payload.adventure.numbering,
                startDate: payload.adventure.startDate,
                showYear: payload.adventure.showYear,
            });
        }
        perFile.push({ file, adventureId, payload });
    }
    const createdIds: string[] = [];
    await fileActionManager.applyGlobal((draft) => {
        const built = perFile.flatMap(({ file, adventureId, payload }) => {
            // A payload guarantees one <trk> per track, so split by track to
            // rebuild them 1:1; otherwise fall back to the section heuristic.
            const sections = payload ? splitByTrack(file) : buildSections(file);
            return sections.map((section, sectionIndex) => ({
                section,
                adventureId,
                trackMeta: payload ? payload.tracks[sectionIndex] : undefined,
            }));
        });
        const ids = getFileIds(built.length);
        built.forEach(({ section, adventureId, trackMeta }, index) => {
            section._data.id = ids[index];
            // Queue the per-track metadata WITH the placement so the 'creating'
            // hook writes the complete row in one put; applying it afterwards
            // would race with (and be clobbered by) that deferred write.
            queuePlacement(
                section._data.id,
                adventureId,
                trackMeta
                    ? trackMeta.alternative
                        ? { alternative: true }
                        : { bufferDays: trackMeta.bufferDays }
                    : undefined
            );
            draft.set(section._data.id, freeze(section));
            createdIds.push(section._data.id);
        });
    });
    if (createdIds.length > 0) {
        // Select the first new adventure so the library shows it and its tracks
        // render on the map (visibleFileIds follows the library selection).
        selectLibraryItem({ kind: 'adventure', id: perFile[0].adventureId }, false);
        boundsManager.fitBoundsOnLoad(createdIds);
    }
}

export async function loadFile(file: File): Promise<GPXFile | null> {
    const notifyImportError = () =>
        toast.error(
            `${i18n._('library.import_error', 'Could not import this file - it may be corrupt or not a valid GPX file')}: ${file.name}`
        );
    let result = await new Promise<GPXFile | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            let data = reader.result?.toString() ?? null;
            if (!data) {
                resolve(null);
                return;
            }
            try {
                let gpx = parseGPX(data);
                if (gpx.metadata === undefined) {
                    gpx.metadata = {};
                }
                if (gpx.metadata.name === undefined || gpx.metadata.name.trim() === '') {
                    gpx.metadata.name = file.name.split('.').slice(0, -1).join('.');
                }
                resolve(gpx);
            } catch (e) {
                // Corrupt / non-GPX input (GPXParseError) or any unexpected parse
                // failure: reject this one file instead of hanging the batch.
                notifyImportError();
                resolve(null);
            }
        };
        reader.onerror = () => {
            notifyImportError();
            resolve(null);
        };
        reader.readAsText(file);
    });
    return result;
}

// Helper functions for file operations
export const fileActions = {
    add: (file: GPXFile) => {
        if (file._data.id === undefined) {
            file._data.id = getFileIds(1)[0];
        }
        return fileActionManager.applyGlobal((draft) => {
            draft.set(file._data.id, freeze(file));
        });
    },
    addMultiple: (files: GPXFile[]) => {
        let ids = getFileIds(files.length);
        fileActionManager.applyGlobal((draft) => {
            files.forEach((file, index) => {
                file._data.id = ids[index];
                draft.set(file._data.id, freeze(file));
            });
        });
        return ids;
    },
    duplicateSelection: () => {
        if (get(selection).size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            let ids = getFileIds(get(selection).size);
            let index = 0;
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                if (level === ListLevel.FILE) {
                    let file = fileStateCollection.getFile(fileId);
                    if (file) {
                        let newFile = file.clone();
                        newFile._data.id = ids[index++];
                        // The copy belongs next to its source, not in the
                        // currently selected adventure.
                        queuePlacement(newFile._data.id, get(trackPlacements).get(fileId) ?? null);
                        draft.set(newFile._data.id, freeze(newFile));
                    }
                } else {
                    let file = draft.get(fileId);
                    if (file) {
                        if (level === ListLevel.TRACK) {
                            for (let item of items) {
                                let trackIndex = (item as ListTrackItem).getTrackIndex();
                                file.replaceTracks(trackIndex + 1, trackIndex, [
                                    file.trk[trackIndex].clone(),
                                ]);
                            }
                        } else if (level === ListLevel.SEGMENT) {
                            for (let item of items) {
                                let trackIndex = (item as ListTrackSegmentItem).getTrackIndex();
                                let segmentIndex = (item as ListTrackSegmentItem).getSegmentIndex();
                                file.replaceTrackSegments(
                                    trackIndex,
                                    segmentIndex + 1,
                                    segmentIndex,
                                    [file.trk[trackIndex].trkseg[segmentIndex].clone()]
                                );
                            }
                        } else if (level === ListLevel.WAYPOINTS) {
                            file.replaceWaypoints(
                                file.wpt.length,
                                file.wpt.length - 1,
                                file.wpt.map((wpt) => wpt.clone())
                            );
                        } else if (level === ListLevel.WAYPOINT) {
                            for (let item of items) {
                                let waypointIndex = (item as ListWaypointItem).getWaypointIndex();
                                file.replaceWaypoints(waypointIndex + 1, waypointIndex, [
                                    file.wpt[waypointIndex].clone(),
                                ]);
                            }
                        }
                    }
                }
            });
        });
    },
    copyFilesTo: (fileIds: string[], adventureId: string) => {
        fileActionManager.applyGlobal((draft) => {
            let ids = getFileIds(fileIds.length);
            fileIds.forEach((fileId, index) => {
                let file = fileStateCollection.getFile(fileId);
                if (file) {
                    let newFile = file.clone();
                    newFile._data.id = ids[index];
                    queuePlacement(newFile._data.id, adventureId);
                    draft.set(newFile._data.id, freeze(newFile));
                }
            });
        });
    },
    addNewTrack: (fileId: string) => {
        fileActionManager.applyToFile(fileId, (file) =>
            file.replaceTracks(file.trk.length, file.trk.length, [new Track()])
        );
    },
    addNewSegment: (fileId: string, trackIndex: number) => {
        fileActionManager.applyToFile(fileId, (file) => {
            let track = file.trk[trackIndex];
            track.replaceTrackSegments(track.trkseg.length, track.trkseg.length, [
                new TrackSegment(),
            ]);
        });
    },
    reverseSelection: () => {
        if (
            !get(selection).hasAnyChildren(new ListRootItem(), true, ['waypoints']) ||
            get(gpxStatistics).global.length <= 1
        ) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                let file = draft.get(fileId);
                if (file) {
                    if (level === ListLevel.FILE) {
                        file.reverse();
                    } else if (level === ListLevel.TRACK) {
                        for (let item of items) {
                            let trackIndex = (item as ListTrackItem).getTrackIndex();
                            file.reverseTrack(trackIndex);
                        }
                    } else if (level === ListLevel.SEGMENT) {
                        for (let item of items) {
                            let trackIndex = (item as ListTrackSegmentItem).getTrackIndex();
                            let segmentIndex = (item as ListTrackSegmentItem).getSegmentIndex();
                            file.reverseTrackSegment(trackIndex, segmentIndex);
                        }
                    }
                }
            });
        });
    },
    createRoundTripForSelection() {
        if (!get(selection).hasAnyChildren(new ListRootItem(), true, ['waypoints'])) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                let file = draft.get(fileId);
                if (file) {
                    if (level === ListLevel.FILE) {
                        file.roundTrip();
                    } else if (level === ListLevel.TRACK) {
                        for (let item of items) {
                            let trackIndex = (item as ListTrackItem).getTrackIndex();
                            file.roundTripTrack(trackIndex);
                        }
                    } else if (level === ListLevel.SEGMENT) {
                        for (let item of items) {
                            let trackIndex = (item as ListTrackSegmentItem).getTrackIndex();
                            let segmentIndex = (item as ListTrackSegmentItem).getSegmentIndex();
                            file.roundTripTrackSegment(trackIndex, segmentIndex);
                        }
                    }
                }
            });
        });
    },
    mergeSelection: (mergeTraces: boolean, removeGaps: boolean) => {
        if (get(selection).size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            let first = true;
            let target: ListItem = new ListRootItem();
            let targetFile: GPXFile | undefined = undefined;
            let toMerge: {
                trk: Track[];
                trkseg: TrackSegment[];
                wpt: Waypoint[];
            } = {
                trk: [],
                trkseg: [],
                wpt: [],
            };
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                let file = draft.get(fileId);
                let originalFile = fileStateCollection.getFile(fileId);
                if (file && originalFile) {
                    if (level === ListLevel.FILE) {
                        toMerge.trk.push(...originalFile.trk.map((track) => track.clone()));
                        for (const wpt of originalFile.wpt) {
                            if (!toMerge.wpt.some((w) => w.equals(wpt))) {
                                toMerge.wpt.push(wpt.clone());
                            }
                        }
                        if (first) {
                            target = items[0];
                            targetFile = file;
                        } else {
                            draft.delete(fileId);
                        }
                    } else {
                        if (level === ListLevel.TRACK) {
                            items.forEach((item, index) => {
                                let trackIndex = (item as ListTrackItem).getTrackIndex();
                                toMerge.trkseg.splice(
                                    0,
                                    0,
                                    ...originalFile.trk[trackIndex].trkseg.map((segment) =>
                                        segment.clone()
                                    )
                                );
                                if (index === items.length - 1) {
                                    // Order is reversed, so the last track is the first one and the one to keep
                                    target = item;
                                    file.trk[trackIndex].trkseg = [];
                                } else {
                                    file.trk.splice(trackIndex, 1);
                                }
                            });
                        } else if (level === ListLevel.SEGMENT) {
                            items.forEach((item, index) => {
                                let trackIndex = (item as ListTrackSegmentItem).getTrackIndex();
                                let segmentIndex = (item as ListTrackSegmentItem).getSegmentIndex();
                                if (index === items.length - 1) {
                                    // Order is reversed, so the last segment is the first one and the one to keep
                                    target = item;
                                }
                                toMerge.trkseg.splice(
                                    0,
                                    0,
                                    originalFile.trk[trackIndex].trkseg[segmentIndex].clone()
                                );
                                file.trk[trackIndex].trkseg.splice(segmentIndex, 1);
                            });
                        }
                        targetFile = file;
                    }
                    first = false;
                }
            });
            if (mergeTraces) {
                let statistics = get(gpxStatistics);
                let speed =
                    statistics.global.speed.moving > 0 ? statistics.global.speed.moving : undefined;
                let startTime: Date | undefined = undefined;
                if (speed !== undefined) {
                    if (
                        statistics.global.length > 0 &&
                        statistics.getTrackPoint(0)!.trkpt.time !== undefined
                    ) {
                        startTime = statistics.getTrackPoint(0)!.trkpt.time;
                    } else {
                        for (let i = 0; i < statistics.global.length; i++) {
                            const point = statistics.getTrackPoint(i)!;
                            if (point.trkpt.time !== undefined) {
                                startTime = new Date(
                                    point.trkpt.time.getTime() -
                                        (1000 * 3600 * point.distance.total) / speed
                                );
                                break;
                            }
                        }
                    }
                }
                if (toMerge.trk.length > 0 && toMerge.trk[0].trkseg.length > 0) {
                    let s = new TrackSegment();
                    toMerge.trk.map((track) => {
                        track.trkseg.forEach((segment) => {
                            s.replaceTrackPoints(
                                s.trkpt.length,
                                s.trkpt.length,
                                segment.trkpt.slice(),
                                speed,
                                startTime,
                                removeGaps
                            );
                        });
                    });
                    toMerge.trk = [toMerge.trk[0]];
                    toMerge.trk[0].trkseg = [s];
                }
                if (toMerge.trkseg.length > 0) {
                    let s = new TrackSegment();
                    toMerge.trkseg.forEach((segment) => {
                        s.replaceTrackPoints(
                            s.trkpt.length,
                            s.trkpt.length,
                            segment.trkpt.slice(),
                            speed,
                            startTime,
                            removeGaps
                        );
                    });
                    toMerge.trkseg = [s];
                }
            }
            if (targetFile) {
                targetFile = targetFile as GPXFile;
                if (target instanceof ListFileItem) {
                    targetFile.replaceTracks(0, targetFile.trk.length - 1, toMerge.trk);
                    targetFile.replaceWaypoints(0, targetFile.wpt.length - 1, toMerge.wpt);
                } else if (target instanceof ListTrackItem) {
                    let trackIndex = target.getTrackIndex();
                    targetFile.replaceTrackSegments(trackIndex, 0, -1, toMerge.trkseg);
                } else if (target instanceof ListTrackSegmentItem) {
                    let trackIndex = target.getTrackIndex();
                    let segmentIndex = target.getSegmentIndex();
                    targetFile.replaceTrackSegments(
                        trackIndex,
                        segmentIndex,
                        segmentIndex - 1,
                        toMerge.trkseg
                    );
                }
            }
        });
    },
    cropSelection: (start: number, end: number) => {
        if (get(selection).size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                let file = draft.get(fileId);
                if (file) {
                    if (level === ListLevel.FILE) {
                        let length = file.getNumberOfTrackPoints();
                        if (start >= length || end < 0) {
                            draft.delete(fileId);
                        } else if (start > 0 || end < length - 1) {
                            file.crop(Math.max(0, start), Math.min(length - 1, end));
                        }
                        start -= length;
                        end -= length;
                    } else if (level === ListLevel.TRACK) {
                        let trackIndices = items.map((item) =>
                            (item as ListTrackItem).getTrackIndex()
                        );
                        file.crop(start, end, trackIndices);
                    } else if (level === ListLevel.SEGMENT) {
                        let trackIndices = [(items[0] as ListTrackSegmentItem).getTrackIndex()];
                        let segmentIndices = items.map((item) =>
                            (item as ListTrackSegmentItem).getSegmentIndex()
                        );
                        file.crop(start, end, trackIndices, segmentIndices);
                    }
                }
            }, false);
        });
    },
    extractSelection: () => {
        if (get(selection).size === 0) {
            return;
        }
        return fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                if (level === ListLevel.FILE) {
                    let file = fileStateCollection.getFile(fileId);
                    let statistics = fileStateCollection.getStatistics(fileId);
                    if (file && statistics) {
                        if (file.trk.length > 1) {
                            let fileIds = getFileIds(file.trk.length);
                            let closest = file.wpt.map((wpt) =>
                                getClosestTrackSegments(file, statistics, wpt.getCoordinates())
                            );
                            file.trk.forEach((track, index) => {
                                let newFile = file.clone();
                                let tracks = track.trkseg.map((segment, segmentIndex) => {
                                    let t = track.clone();
                                    t.replaceTrackSegments(0, track.trkseg.length - 1, [segment]);
                                    if (track.name) {
                                        t.name = `${track.name} (${segmentIndex + 1})`;
                                    }
                                    return t;
                                });
                                newFile.replaceTracks(0, file.trk.length - 1, tracks);
                                newFile.replaceWaypoints(
                                    0,
                                    file.wpt.length - 1,
                                    file.wpt.filter((wpt, wptIndex) =>
                                        closest[wptIndex].some(
                                            ([trackIndex, segmentIndex]) => trackIndex === index
                                        )
                                    )
                                );
                                newFile._data.id = fileIds[index];
                                newFile.metadata.name =
                                    track.name ?? `${file.metadata.name} (${index + 1})`;
                                draft.set(newFile._data.id, freeze(newFile));
                            });
                        } else if (file.trk.length === 1) {
                            let fileIds = getFileIds(file.trk[0].trkseg.length);
                            let closest = file.wpt.map((wpt) =>
                                getClosestTrackSegments(file, statistics, wpt.getCoordinates())
                            );
                            file.trk[0].trkseg.forEach((segment, index) => {
                                let newFile = file.clone();
                                newFile.replaceTrackSegments(0, 0, file.trk[0].trkseg.length - 1, [
                                    segment,
                                ]);
                                newFile.replaceWaypoints(
                                    0,
                                    file.wpt.length - 1,
                                    file.wpt.filter((wpt, wptIndex) =>
                                        closest[wptIndex].some(
                                            ([trackIndex, segmentIndex]) => segmentIndex === index
                                        )
                                    )
                                );
                                newFile._data.id = fileIds[index];
                                newFile.metadata.name = `${file.trk[0].name ?? file.metadata.name} (${index + 1})`;
                                draft.set(newFile._data.id, freeze(newFile));
                            });
                        }
                        draft.delete(fileId);
                    }
                } else if (level === ListLevel.TRACK) {
                    let file = draft.get(fileId);
                    if (file) {
                        for (let item of items) {
                            let trackIndex = (item as ListTrackItem).getTrackIndex();
                            let track = file.trk[trackIndex];
                            let tracks = track.trkseg.map((segment, segmentIndex) => {
                                let t = track.clone();
                                t.replaceTrackSegments(0, track.trkseg.length - 1, [segment]);
                                if (track.name) {
                                    t.name = `${track.name} (${segmentIndex + 1})`;
                                }
                                return t;
                            });
                            file.replaceTracks(trackIndex, trackIndex, tracks);
                        }
                    }
                }
            });
        });
    },
    split(
        splitType: SplitType,
        fileId: string,
        trackIndex: number,
        segmentIndex: number,
        coordinates: Coordinates,
        trkptIndex?: number
    ) {
        return fileActionManager.applyGlobal((draft) => {
            let file = fileStateCollection.getFile(fileId);
            if (file) {
                let segment = file.trk[trackIndex].trkseg[segmentIndex];
                let minIndex = 0;
                if (trkptIndex === undefined) {
                    // Find the point closest to split
                    let closest = getClosestLinePoint(segment.trkpt, coordinates);
                    minIndex = closest._data.index;
                } else {
                    minIndex = trkptIndex;
                }
                let absoluteIndex = minIndex;
                file.forEachSegment((seg, trkIndex, segIndex) => {
                    if (
                        (trkIndex < trackIndex && splitType === SplitType.FILES) ||
                        (trkIndex === trackIndex && segIndex < segmentIndex)
                    ) {
                        absoluteIndex += seg.trkpt.length;
                    }
                });
                if (splitType === SplitType.FILES) {
                    let newFile = draft.get(fileId);
                    if (newFile) {
                        newFile.crop(0, absoluteIndex);
                        let newFile2 = file.clone();
                        newFile2._data.id = getFileIds(1)[0];
                        newFile2.crop(absoluteIndex, file.getNumberOfTrackPoints() - 1);
                        draft.set(newFile2._data.id, freeze(newFile2));
                    }
                } else if (splitType === SplitType.TRACKS) {
                    let newFile = draft.get(fileId);
                    if (newFile) {
                        let start = file.trk[trackIndex].clone();
                        start.crop(0, absoluteIndex);
                        let end = file.trk[trackIndex].clone();
                        end.crop(absoluteIndex, file.trk[trackIndex].getNumberOfTrackPoints() - 1);
                        newFile.replaceTracks(trackIndex, trackIndex, [start, end]);
                    }
                } else if (splitType === SplitType.SEGMENTS) {
                    let newFile = draft.get(fileId);
                    if (newFile) {
                        let start = segment.clone();
                        start.crop(0, minIndex);
                        let end = segment.clone();
                        end.crop(minIndex, segment.trkpt.length - 1);
                        newFile.replaceTrackSegments(trackIndex, segmentIndex, segmentIndex, [
                            start,
                            end,
                        ]);
                    }
                }
            }
        });
    },
    cleanSelection: (
        bounds: [Coordinates, Coordinates],
        inside: boolean,
        deleteTrackPoints: boolean,
        deleteWaypoints: boolean
    ) => {
        if (get(selection).size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                let file = draft.get(fileId);
                if (file) {
                    if (level === ListLevel.FILE) {
                        file.clean(bounds, inside, deleteTrackPoints, deleteWaypoints);
                    } else if (level === ListLevel.TRACK) {
                        let trackIndices = items.map((item) =>
                            (item as ListTrackItem).getTrackIndex()
                        );
                        file.clean(
                            bounds,
                            inside,
                            deleteTrackPoints,
                            deleteWaypoints,
                            trackIndices
                        );
                    } else if (level === ListLevel.SEGMENT) {
                        let trackIndices = [(items[0] as ListTrackSegmentItem).getTrackIndex()];
                        let segmentIndices = items.map((item) =>
                            (item as ListTrackSegmentItem).getSegmentIndex()
                        );
                        file.clean(
                            bounds,
                            inside,
                            deleteTrackPoints,
                            deleteWaypoints,
                            trackIndices,
                            segmentIndices
                        );
                    } else if (level === ListLevel.WAYPOINTS) {
                        file.clean(bounds, inside, false, deleteWaypoints);
                    } else if (level === ListLevel.WAYPOINT) {
                        let waypointIndices = items.map((item) =>
                            (item as ListWaypointItem).getWaypointIndex()
                        );
                        file.clean(bounds, inside, false, deleteWaypoints, [], [], waypointIndices);
                    }
                }
            });
        });
    },
    reduce: (itemsAndPoints: Map<ListItem, TrackPoint[]>) => {
        if (itemsAndPoints.size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            let allItems = Array.from(itemsAndPoints.keys());
            applyToOrderedItemsFromFile(allItems, (fileId, level, items) => {
                let file = draft.get(fileId);
                if (file) {
                    for (let item of items) {
                        if (item instanceof ListTrackSegmentItem) {
                            let trackIndex = item.getTrackIndex();
                            let segmentIndex = item.getSegmentIndex();
                            let points = itemsAndPoints.get(item);
                            if (points) {
                                file.replaceTrackPoints(
                                    trackIndex,
                                    segmentIndex,
                                    0,
                                    file.trk[trackIndex].trkseg[
                                        segmentIndex
                                    ].getNumberOfTrackPoints() - 1,
                                    points
                                );
                            }
                        }
                    }
                }
            });
        });
    },
    addOrUpdateWaypoint: (waypoint: WaypointType, item?: ListWaypointItem) => {
        getElevation([waypoint.attributes]).then((elevation) => {
            if (item) {
                fileActionManager.applyToFile(item.getFileId(), (file) => {
                    let wpt = file.wpt[item.getWaypointIndex()];
                    wpt.name = waypoint.name;
                    wpt.desc = waypoint.desc;
                    wpt.cmt = waypoint.cmt;
                    wpt.sym = waypoint.sym;
                    wpt.link = waypoint.link;
                    wpt.setCoordinates(waypoint.attributes);
                    wpt.ele = elevation[0];
                });
            } else {
                let fileIds = new Set<string>();
                get(selection)
                    .getSelected()
                    .forEach((item) => {
                        fileIds.add(item.getFileId());
                    });
                let wpt = new Waypoint(waypoint);
                wpt.ele = elevation[0];
                fileActionManager.applyToFiles(Array.from(fileIds), (file) =>
                    file.replaceWaypoints(file.wpt.length, file.wpt.length, [wpt])
                );
            }
        });
    },
    deleteWaypoint: (fileId: string, waypointIndex: number) => {
        fileActionManager.applyToFile(fileId, (file) =>
            file.replaceWaypoints(waypointIndex, waypointIndex, [])
        );
    },
    setStyleToSelection: (style: LineStyleExtension) => {
        if (get(selection).size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                let file = draft.get(fileId);
                if (file && (level === ListLevel.FILE || level === ListLevel.TRACK)) {
                    if (level === ListLevel.FILE) {
                        file.setStyle(style);
                    } else if (level === ListLevel.TRACK) {
                        if (items.length === file.trk.length) {
                            file.setStyle(style);
                        } else {
                            for (let item of items) {
                                let trackIndex = (item as ListTrackItem).getTrackIndex();
                                file.trk[trackIndex].setStyle(style);
                            }
                        }
                    }
                }
            });
        });
    },
    setHiddenToSelection: (hidden: boolean) => {
        if (get(selection).size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                let file = draft.get(fileId);
                if (file) {
                    if (level === ListLevel.FILE) {
                        file.setHidden(hidden);
                    } else if (level === ListLevel.TRACK) {
                        let trackIndices = items.map((item) =>
                            (item as ListTrackItem).getTrackIndex()
                        );
                        file.setHidden(hidden, trackIndices);
                    } else if (level === ListLevel.SEGMENT) {
                        let trackIndices = [(items[0] as ListTrackSegmentItem).getTrackIndex()];
                        let segmentIndices = items.map((item) =>
                            (item as ListTrackSegmentItem).getSegmentIndex()
                        );
                        file.setHidden(hidden, trackIndices, segmentIndices);
                    } else if (level === ListLevel.WAYPOINTS) {
                        file.setHiddenWaypoints(hidden);
                    } else if (level === ListLevel.WAYPOINT) {
                        let waypointIndices = items.map((item) =>
                            (item as ListWaypointItem).getWaypointIndex()
                        );
                        file.setHiddenWaypoints(hidden, waypointIndices);
                    }
                }
            });
        });
    },
    deleteSelection: () => {
        if (get(selection).size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                if (level === ListLevel.FILE) {
                    draft.delete(fileId);
                } else {
                    let file = draft.get(fileId);
                    if (file) {
                        if (level === ListLevel.TRACK) {
                            for (let item of items) {
                                let trackIndex = (item as ListTrackItem).getTrackIndex();
                                file.replaceTracks(trackIndex, trackIndex, []);
                            }
                        } else if (level === ListLevel.SEGMENT) {
                            for (let item of items) {
                                let trackIndex = (item as ListTrackSegmentItem).getTrackIndex();
                                let segmentIndex = (item as ListTrackSegmentItem).getSegmentIndex();
                                file.replaceTrackSegments(
                                    trackIndex,
                                    segmentIndex,
                                    segmentIndex,
                                    []
                                );
                            }
                        } else if (level === ListLevel.WAYPOINTS) {
                            file.replaceWaypoints(0, file.wpt.length - 1, []);
                        } else if (level === ListLevel.WAYPOINT) {
                            for (let item of items) {
                                let waypointIndex = (item as ListWaypointItem).getWaypointIndex();
                                file.replaceWaypoints(waypointIndex, waypointIndex, []);
                            }
                        }
                    }
                }
            });
        });
    },
    addElevationToSelection: async () => {
        if (get(selection).size === 0) {
            return;
        }
        let points: (TrackPoint | Waypoint)[] = [];
        selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
            let file = fileStateCollection.getFile(fileId);
            if (file) {
                if (level === ListLevel.FILE) {
                    points.push(...file.getTrackPoints());
                    points.push(...file.wpt);
                } else if (level === ListLevel.TRACK) {
                    let trackIndices = items.map((item) => (item as ListTrackItem).getTrackIndex());
                    trackIndices.forEach((trackIndex) => {
                        points.push(...file.trk[trackIndex].getTrackPoints());
                    });
                } else if (level === ListLevel.SEGMENT) {
                    let trackIndex = (items[0] as ListTrackSegmentItem).getTrackIndex();
                    let segmentIndices = items.map((item) =>
                        (item as ListTrackSegmentItem).getSegmentIndex()
                    );
                    segmentIndices.forEach((segmentIndex) => {
                        points.push(...file.trk[trackIndex].trkseg[segmentIndex].getTrackPoints());
                    });
                } else if (level === ListLevel.WAYPOINTS) {
                    points.push(...file.wpt);
                } else if (level === ListLevel.WAYPOINT) {
                    let waypointIndices = items.map((item) =>
                        (item as ListWaypointItem).getWaypointIndex()
                    );
                    points.push(...waypointIndices.map((waypointIndex) => file.wpt[waypointIndex]));
                }
            }
        });
        if (points.length === 0) {
            return;
        }
        getElevation(points).then((elevations) => {
            fileActionManager.applyGlobal((draft) => {
                selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                    let file = draft.get(fileId);
                    if (file) {
                        if (level === ListLevel.FILE) {
                            file.addElevation(elevations);
                        } else if (level === ListLevel.TRACK) {
                            let trackIndices = items.map((item) =>
                                (item as ListTrackItem).getTrackIndex()
                            );
                            file.addElevation(elevations, trackIndices, undefined, []);
                        } else if (level === ListLevel.SEGMENT) {
                            let trackIndices = [(items[0] as ListTrackSegmentItem).getTrackIndex()];
                            let segmentIndices = items.map((item) =>
                                (item as ListTrackSegmentItem).getSegmentIndex()
                            );
                            file.addElevation(elevations, trackIndices, segmentIndices, []);
                        } else if (level === ListLevel.WAYPOINTS) {
                            file.addElevation(elevations, [], [], undefined);
                        } else if (level === ListLevel.WAYPOINT) {
                            let waypointIndices = items.map((item) =>
                                (item as ListWaypointItem).getWaypointIndex()
                            );
                            file.addElevation(elevations, [], [], waypointIndices);
                        }
                    }
                });
            });
        });
    },
    deleteSelectedFiles: () => {
        if (get(selection).size === 0) {
            return;
        }
        fileActionManager.applyGlobal((draft) => {
            selection.applyToOrderedSelectedItemsFromFile((fileId, level, items) => {
                draft.delete(fileId);
            });
        });
    },
};

export function pasteSelection() {
    let fromItems = get(copied);
    if (fromItems === undefined || fromItems.length === 0) {
        return;
    }

    let selected = get(selection).getSelected();
    if (selected.length === 0) {
        selected = [new ListRootItem()];
    }

    let fromParent = fromItems[0].getParent();
    let toParent = selected[selected.length - 1];

    let startIndex: number | undefined = undefined;

    if (fromItems[0].level === toParent.level) {
        if (
            toParent instanceof ListTrackItem ||
            toParent instanceof ListTrackSegmentItem ||
            toParent instanceof ListWaypointItem
        ) {
            startIndex = toParent.getId() + 1;
        }
        toParent = toParent.getParent();
    }

    let toItems: ListItem[] = [];
    if (toParent.level === ListLevel.ROOT) {
        let fileIds = getFileIds(fromItems.length);
        fileIds.forEach((fileId) => {
            toItems.push(new ListFileItem(fileId));
        });
    } else {
        let toFile = fileStateCollection.getFile(toParent.getFileId());
        if (toFile) {
            fromItems.forEach((item, index) => {
                if (toParent instanceof ListFileItem) {
                    if (item instanceof ListTrackItem || item instanceof ListTrackSegmentItem) {
                        toItems.push(
                            new ListTrackItem(
                                toParent.getFileId(),
                                (startIndex ?? toFile.trk.length) + index
                            )
                        );
                    } else if (item instanceof ListWaypointsItem) {
                        toItems.push(new ListWaypointsItem(toParent.getFileId()));
                    } else if (item instanceof ListWaypointItem) {
                        toItems.push(
                            new ListWaypointItem(
                                toParent.getFileId(),
                                (startIndex ?? toFile.wpt.length) + index
                            )
                        );
                    }
                } else if (toParent instanceof ListTrackItem) {
                    if (item instanceof ListTrackSegmentItem) {
                        let toTrackIndex = toParent.getTrackIndex();
                        toItems.push(
                            new ListTrackSegmentItem(
                                toParent.getFileId(),
                                toTrackIndex,
                                (startIndex ?? toFile.trk[toTrackIndex].trkseg.length) + index
                            )
                        );
                    }
                } else if (toParent instanceof ListWaypointsItem) {
                    if (item instanceof ListWaypointItem) {
                        toItems.push(
                            new ListWaypointItem(
                                toParent.getFileId(),
                                (startIndex ?? toFile.wpt.length) + index
                            )
                        );
                    }
                }
            });
        }
    }

    if (fromItems.length === toItems.length) {
        moveItems(fromParent, toParent, fromItems, toItems, get(cut));
        selection.resetCopied();
    }
}

export function moveItems(
    fromParent: ListItem,
    toParent: ListItem,
    fromItems: ListItem[],
    toItems: ListItem[],
    remove: boolean = true
) {
    if (fromItems.length === 0) {
        return;
    }

    sortItems(fromItems, false);
    sortItems(toItems, false);

    let context: (GPXFile | Track | TrackSegment | Waypoint[] | Waypoint)[] = [];
    fromItems.forEach((item) => {
        let file = fileStateCollection.getFile(item.getFileId());
        if (file) {
            if (item instanceof ListFileItem) {
                context.push(file.clone());
            } else if (item instanceof ListTrackItem && item.getTrackIndex() < file.trk.length) {
                context.push(file.trk[item.getTrackIndex()].clone());
            } else if (
                item instanceof ListTrackSegmentItem &&
                item.getTrackIndex() < file.trk.length &&
                item.getSegmentIndex() < file.trk[item.getTrackIndex()].trkseg.length
            ) {
                context.push(file.trk[item.getTrackIndex()].trkseg[item.getSegmentIndex()].clone());
            } else if (item instanceof ListWaypointsItem) {
                context.push(file.wpt.map((wpt) => wpt.clone()));
            } else if (
                item instanceof ListWaypointItem &&
                item.getWaypointIndex() < file.wpt.length
            ) {
                context.push(file.wpt[item.getWaypointIndex()].clone());
            }
        }
    });

    if (remove && !(fromParent instanceof ListRootItem)) {
        sortItems(fromItems, true);
    }

    let files = [fromParent.getFileId(), toParent.getFileId()];
    let callbacks = [
        (
            file: WritableDraft<GPXFile>,
            context: (GPXFile | Track | TrackSegment | Waypoint[] | Waypoint)[]
        ) => {
            fromItems.forEach((item) => {
                if (item instanceof ListTrackItem) {
                    file.replaceTracks(item.getTrackIndex(), item.getTrackIndex(), []);
                } else if (item instanceof ListTrackSegmentItem) {
                    file.replaceTrackSegments(
                        item.getTrackIndex(),
                        item.getSegmentIndex(),
                        item.getSegmentIndex(),
                        []
                    );
                } else if (item instanceof ListWaypointsItem) {
                    file.replaceWaypoints(0, file.wpt.length - 1, []);
                } else if (item instanceof ListWaypointItem) {
                    file.replaceWaypoints(item.getWaypointIndex(), item.getWaypointIndex(), []);
                }
            });
        },
        (
            file: WritableDraft<GPXFile>,
            context: (GPXFile | Track | TrackSegment | Waypoint[] | Waypoint)[]
        ) => {
            toItems.forEach((item, i) => {
                if (item instanceof ListTrackItem) {
                    if (context[i] instanceof Track) {
                        file.replaceTracks(item.getTrackIndex(), item.getTrackIndex() - 1, [
                            context[i],
                        ]);
                    } else if (context[i] instanceof TrackSegment) {
                        file.replaceTracks(item.getTrackIndex(), item.getTrackIndex() - 1, [
                            new Track({
                                trkseg: [context[i]],
                            }),
                        ]);
                    }
                } else if (
                    item instanceof ListTrackSegmentItem &&
                    context[i] instanceof TrackSegment
                ) {
                    file.replaceTrackSegments(
                        item.getTrackIndex(),
                        item.getSegmentIndex(),
                        item.getSegmentIndex() - 1,
                        [context[i]]
                    );
                } else if (item instanceof ListWaypointsItem) {
                    if (
                        Array.isArray(context[i]) &&
                        context[i].length > 0 &&
                        context[i][0] instanceof Waypoint
                    ) {
                        file.replaceWaypoints(file.wpt.length, file.wpt.length - 1, context[i]);
                    } else if (context[i] instanceof Waypoint) {
                        file.replaceWaypoints(file.wpt.length, file.wpt.length - 1, [context[i]]);
                    }
                } else if (item instanceof ListWaypointItem && context[i] instanceof Waypoint) {
                    file.replaceWaypoints(item.getWaypointIndex(), item.getWaypointIndex() - 1, [
                        context[i],
                    ]);
                }
            });
        },
    ];

    if (fromParent instanceof ListRootItem) {
        files = [];
        callbacks = [];
    } else if (!remove) {
        files.splice(0, 1);
        callbacks.splice(0, 1);
    }

    fileActionManager.applyEachToFilesAndGlobal(
        files,
        callbacks,
        (files, context: (GPXFile | Track | TrackSegment | Waypoint[] | Waypoint)[]) => {
            toItems.forEach((item, i) => {
                if (item instanceof ListFileItem) {
                    if (context[i] instanceof GPXFile) {
                        let newFile = context[i];
                        if (remove) {
                            files.delete(newFile._data.id);
                        }
                        newFile._data.id = item.getFileId();
                        files.set(item.getFileId(), freeze(newFile));
                    } else if (context[i] instanceof Track) {
                        let newFile = newGPXFile();
                        newFile._data.id = item.getFileId();
                        if (context[i].name) {
                            newFile.metadata.name = context[i].name;
                        }
                        newFile.replaceTracks(0, 0, [context[i]]);
                        files.set(item.getFileId(), freeze(newFile));
                    } else if (context[i] instanceof TrackSegment) {
                        let newFile = newGPXFile();
                        newFile._data.id = item.getFileId();
                        newFile.replaceTracks(0, 0, [
                            new Track({
                                trkseg: [context[i]],
                            }),
                        ]);
                        files.set(item.getFileId(), freeze(newFile));
                    }
                }
            });
        },
        context
    );

    selection.set(toItems);
}
