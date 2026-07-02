<script lang="ts">
    import { setContext } from 'svelte';
    import { ScrollArea } from '$lib/components/ui/scroll-area/index';
    import {
        MapPin,
        Mountain,
        MoveDownRight,
        MoveUpRight,
        Route,
        Ruler,
        Tent,
        Upload,
    } from '@lucide/svelte';
    import FileListNode from '$lib/components/file-list/FileListNode.svelte';
    import WithUnits from '$lib/components/WithUnits.svelte';
    import { ListFileItem, ListRootItem } from '$lib/components/file-list/file-list';
    import { fileStateCollection } from '$lib/logic/file-state';
    import { selection } from '$lib/logic/selection';
    import { loadFiles, triggerFileInput } from '$lib/logic/file-actions';
    import {
        adventures,
        expeditions,
        librarySelection,
        visibleFileIds,
    } from '$lib/library/library';
    import type { GPXFileWithStatistics } from '$lib/logic/statistics-tree';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * The track pane at the bottom of the library panel: a title naming the
     * current library selection, the tracks it contains, and a KPI footer
     * with the stats of the selected tracks (or of every listed track while
     * none is selected). This list and the map always show
     * the same tracks ({@link visibleFileIds}), so the panel reads as a
     * legend of the map. Track rows reuse the existing file tree components,
     * so per-track behavior (selection, visibility, context menu, drag
     * ordering) is unchanged. With a single adventure selected, dropped GPX
     * files are imported into it.
     */
    setContext('orientation', 'vertical');
    setContext('recursive', true);

    let title = $derived.by(() => {
        const names = $librarySelection
            .map((item) =>
                item.kind === 'adventure'
                    ? $adventures.find((a) => a.id === item.id)?.name
                    : $expeditions.find((e) => e.id === item.id)?.name
            )
            .filter((name) => name !== undefined);
        return names.length > 0 ? names.join(', ') : i18n._('library.no_selection');
    });

    /** The single selected adventure, when the selection is exactly that. */
    let singleAdventure = $derived(
        $librarySelection.length === 1 && $librarySelection[0].kind === 'adventure'
            ? $librarySelection[0].id
            : null
    );

    /** Description of the single selected library item, when it has one. */
    let description = $derived.by(() => {
        if ($librarySelection.length !== 1) {
            return undefined;
        }
        const item = $librarySelection[0];
        const found =
            item.kind === 'adventure'
                ? $adventures.find((a) => a.id === item.id)
                : $expeditions.find((e) => e.id === item.id);
        return found?.description;
    });

    /** Icon matching what is selected: tent for adventures, mountain for expeditions. */
    let titleIcon = $derived.by(() => {
        if ($librarySelection.length === 0) {
            return null;
        }
        if ($librarySelection.every((item) => item.kind === 'adventure')) {
            return Tent;
        }
        if ($librarySelection.every((item) => item.kind === 'expedition')) {
            return Mountain;
        }
        return null;
    });

    /** The tracks of the current library selection, as the file-state map the file tree renders. */
    let files = $derived.by(() => {
        const filtered = new Map();
        for (const [fileId, state] of $fileStateCollection) {
            if ($visibleFileIds.has(fileId)) {
                filtered.set(fileId, state);
            }
        }
        return filtered;
    });

    /** Per-track KPIs of the listed tracks, kept live by subscribing to each file. */
    type TrackKPIs = { distance: number; gain: number; loss: number; pois: number };
    let perTrack = $state(new Map<string, TrackKPIs>());
    $effect(() => {
        const values = new Map<string, TrackKPIs>();
        const unsubscribes = [...files].map(([fileId, state]) =>
            state.subscribe((value: GPXFileWithStatistics | undefined) => {
                if (value) {
                    const stats = value.statistics.getStatisticsFor(
                        new ListFileItem(value.file._data.id)
                    ).global;
                    values.set(fileId, {
                        distance: stats.distance.total,
                        gain: stats.elevation.gain,
                        loss: stats.elevation.loss,
                        pois: value.file.wpt.length,
                    });
                } else {
                    values.delete(fileId);
                }
                perTrack = new Map(values);
            })
        );
        perTrack = new Map(values);
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    });

    /**
     * The KPI footer follows the track selection: it sums the tracks with
     * something selected in them, and falls back to every listed track when
     * nothing is. Tracks are whole files here, so any selected child (a
     * segment, a waypoint) counts its whole track.
     */
    let totals = $derived.by(() => {
        const selectedFileIds = new Set(
            $selection.size > 0 ? $selection.getSelected().map((item) => item.getFileId()) : []
        );
        const listed = [...perTrack.keys()];
        const ids = selectedFileIds.size > 0
            ? listed.filter((fileId) => selectedFileIds.has(fileId))
            : listed;
        const totals = { distance: 0, gain: 0, loss: 0, pois: 0, tracks: ids.length };
        for (const fileId of ids) {
            const kpis = perTrack.get(fileId);
            if (kpis) {
                totals.distance += kpis.distance;
                totals.gain += kpis.gain;
                totals.loss += kpis.loss;
                totals.pois += kpis.pois;
            }
        }
        return totals;
    });

    /** GPX files dropped on the pane are imported into the selected adventure. */
    function onFilesDropped(e: DragEvent) {
        if (singleAdventure === null || !e.dataTransfer || e.dataTransfer.files.length === 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        loadFiles(e.dataTransfer.files);
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="h-full min-h-0 flex flex-col"
    ondragover={(e) => {
        if (singleAdventure !== null && e.dataTransfer?.types.includes('Files')) {
            e.preventDefault();
        }
    }}
    ondrop={onFilesDropped}
>
    <div
        class="shrink-0 flex flex-row items-center gap-1.5 px-2 py-1 border-b text-sm font-semibold"
    >
        {#if titleIcon}
            {@const TitleIcon = titleIcon}
            <TitleIcon size="14" class="shrink-0 text-muted-foreground" />
        {/if}
        <span class="truncate">{title}</span>
        {#if singleAdventure !== null}
            <!-- GPX import into the selected adventure; tracks never live outside one. -->
            <button
                class="ml-auto flex shrink-0 flex-row items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
                title={i18n._('library.import_tracks_tooltip')}
                onclick={() => triggerFileInput()}
            >
                <Upload size="12" class="shrink-0" />
                {i18n._('library.upload_gpx')}
            </button>
        {/if}
    </div>
    {#if description}
        <p
            class="shrink-0 border-b px-2 py-1 text-xs text-muted-foreground line-clamp-2"
            title={description}
        >
            {description}
        </p>
    {/if}
    <ScrollArea
        class="grow min-h-0 p-0 pr-3"
        orientation="vertical"
        scrollbarXClasses=""
        scrollbarYClasses=""
    >
        <div class="flex flex-col py-1 pl-1">
            {#if singleAdventure !== null && files.size === 0}
                <div
                    class="m-2 flex flex-col items-center gap-1.5 rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground"
                >
                    <Route size="16" />
                    {i18n._('library.empty_adventure_tracks')}
                </div>
            {/if}
            <FileListNode node={files} item={new ListRootItem()} />
        </div>
    </ScrollArea>
    <!-- KPI footer: stats of the selected tracks, or of the whole list. -->
    <div
        class="shrink-0 flex flex-row flex-wrap items-center gap-x-3 gap-y-0.5 border-t px-2 py-1 text-xs text-muted-foreground"
    >
        <span class="flex items-center gap-1" title={i18n._('quantities.distance')}>
            <Ruler size="12" class="shrink-0" />
            <WithUnits value={totals.distance} type="distance" />
        </span>
        <span class="flex items-center gap-1" title={i18n._('library.total_ascent')}>
            <MoveUpRight size="12" class="shrink-0" />
            <WithUnits value={totals.gain} type="elevation" />
        </span>
        <span class="flex items-center gap-1" title={i18n._('library.total_descent')}>
            <MoveDownRight size="12" class="shrink-0" />
            <WithUnits value={totals.loss} type="elevation" />
        </span>
        <span class="flex items-center gap-1" title={i18n._('library.track_count')}>
            <Route size="12" class="shrink-0" />
            {totals.tracks}
        </span>
        <span class="flex items-center gap-1" title={i18n._('library.poi_count')}>
            <MapPin size="12" class="shrink-0" />
            {totals.pois}
        </span>
    </div>
</div>
