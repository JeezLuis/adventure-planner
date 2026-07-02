<script lang="ts">
    import GPXLayers from '$lib/components/map/gpx-layer/GPXLayers.svelte';
    import ElevationProfile from '$lib/components/elevation-profile/ElevationProfile.svelte';
    import LibraryTree from '$lib/components/library/LibraryTree.svelte';
    import LibraryTracks from '$lib/components/library/LibraryTracks.svelte';
    import GPXStatistics from '$lib/components/GPXStatistics.svelte';
    import Map from '$lib/components/map/Map.svelte';
    import Menu from '$lib/components/Menu.svelte';
    import Toolbar from '$lib/components/toolbar/Toolbar.svelte';
    import LibraryActions from '$lib/components/library/LibraryActions.svelte';
    import { ChevronDown, ChevronUp, Heart } from '@lucide/svelte';
    import StreetViewControl from '$lib/components/map/street-view-control/StreetViewControl.svelte';
    import LayerControl from '$lib/components/map/layer-control/LayerControl.svelte';
    import CoordinatesPopup from '$lib/components/map/CoordinatesPopup.svelte';
    import Resizer from '$lib/components/Resizer.svelte';
    import { Toaster } from '$lib/components/ui/sonner';
    import { i18n } from '$lib/i18n.svelte';
    import { settings } from '$lib/logic/settings';
    import { loadFiles } from '$lib/logic/file-actions';
    import { onDestroy, onMount } from 'svelte';
    import { page } from '$app/state';
    import { gpxStatistics, hoveredPoint, slicedGPXStatistics } from '$lib/logic/statistics';
    import { getURLForGoogleDriveFile } from '$lib/components/embedding/embedding';
    import { db } from '$lib/db';
    import { fileStateCollection } from '$lib/logic/file-state';
    import { selectedAdventureId } from '$lib/library/library';
    import { currentTool } from '$lib/components/toolbar/tools';

    const {
        elevationProfile,
        bottomPanelSize,
        bottomPanelVisible,
        leftPanelSize,
        libraryTracksPanelSize,
        additionalDatasets,
        elevationFill,
    } = settings;

    let bottomPanelWidth: number | undefined = $state();
    let bottomPanelOrientation = $derived(
        bottomPanelWidth && bottomPanelWidth >= 540 && $elevationProfile ? 'horizontal' : 'vertical'
    );

    // The editing tools vanish with the toolbar, so no tool may stay active.
    $effect(() => {
        if ($selectedAdventureId === null && $currentTool !== null) {
            $currentTool = null;
        }
    });

    onMount(async () => {
        settings.connectToDatabase(db);
        fileStateCollection.connectToDatabase(db).then(() => {
            let files: string[] = JSON.parse(page.url.searchParams.get('files') || '[]');
            let ids: string[] = JSON.parse(page.url.searchParams.get('ids') || '[]');
            let urls: string[] = files.concat(ids.map(getURLForGoogleDriveFile));

            if (urls.length > 0) {
                let downloads: Promise<File | null>[] = [];
                urls.forEach((url) => {
                    downloads.push(
                        fetch(url)
                            .then((response) => response.blob())
                            .then((blob) => new File([blob], url.split('/').pop() ?? ''))
                    );
                });

                Promise.all(downloads).then((files) => {
                    loadFiles(files.filter((file) => file !== null));
                });
            }
        });
    });

    onDestroy(() => {
        settings.disconnectFromDatabase();
        fileStateCollection.disconnectFromDatabase();
    });
</script>

<div class="fixed mt-[100%] -z-10 text-transparent">
    <h1>{i18n._('metadata.home_title')} - {i18n._('metadata.app_title')}</h1>
    <p>{i18n._('metadata.description')}</p>
    <h2>{i18n._('toolbar.routing.tooltip')}</h2>
    <p>{i18n._('toolbar.routing.help_no_file')}</p>
    <p>{i18n._('toolbar.routing.help')}</p>
    <h3>{i18n._('toolbar.routing.reverse.button')}</h3>
    <p>{i18n._('toolbar.routing.reverse.tooltip')}</p>
    <h3>{i18n._('toolbar.routing.route_back_to_start.button')}</h3>
    <p>{i18n._('toolbar.routing.route_back_to_start.tooltip')}</p>
    <h3>{i18n._('toolbar.routing.round_trip.button')}</h3>
    <p>{i18n._('toolbar.routing.round_trip.tooltip')}</p>
    <h3>{i18n._('toolbar.routing.start_loop_here')}</h3>
    <h2>{i18n._('toolbar.scissors.tooltip')}</h2>
    <p>{i18n._('toolbar.scissors.help')}</p>
    <h2>{i18n._('toolbar.time.tooltip')}</h2>
    <p>{i18n._('toolbar.time.help')}</p>
    <h2>{i18n._('toolbar.merge.tooltip')}</h2>
    <h3>{i18n._('toolbar.merge.merge_traces')}</h3>
    <p>{i18n._('toolbar.merge.help_merge_traces')}</p>
    <h3>{i18n._('toolbar.merge.merge_contents')}</h3>
    <p>{i18n._('toolbar.merge.help_merge_contents')}</p>
    <h2>{i18n._('toolbar.elevation.button')}</h2>
    <p>{i18n._('toolbar.elevation.help')}</p>
    <h2>{i18n._('toolbar.waypoint.tooltip')}</h2>
    <p>{i18n._('toolbar.waypoint.help')}</p>
    <h2>{i18n._('toolbar.reduce.tooltip')}</h2>
    <p>{i18n._('toolbar.reduce.help')}</p>
    <h2>{i18n._('toolbar.clean.tooltip')}</h2>
    <p>{i18n._('toolbar.clean.help')}</p>
    <h2>
        {i18n._('gpx.files')}, {i18n._('gpx.tracks')}, {i18n._('gpx.segments')}, {i18n._(
            'gpx.waypoints'
        )}
    </h2>
</div>

<div class="fixed flex flex-row w-dvw h-dvh">
    <!-- Permanent library panel: menu bar, creation actions, and two stacked
         panes with a draggable divider: the organisation tree (expeditions
         and adventures) on top, the tracks of the current selection below. -->
    <div
        class="h-full shrink-0 flex flex-col bg-background z-30 overflow-hidden"
        style="width: {$leftPanelSize}px"
    >
        <Menu />
        <LibraryActions />
        <div class="grow min-h-0">
            <LibraryTree />
        </div>
        <Resizer
            orientation="row"
            bind:after={$libraryTracksPanelSize}
            minAfter={120}
            maxAfter={600}
        />
        <div class="shrink-0 min-h-0" style="height: {$libraryTracksPanelSize}px">
            <LibraryTracks />
        </div>
        <!-- Credit banner. -->
        <div
            class="shrink-0 flex flex-row items-center justify-center gap-1 border-t px-2 py-1 text-[11px] text-muted-foreground"
        >
            {i18n._('library.made_with')}
            <Heart size="11" class="shrink-0 fill-red-500 text-red-500" />
            <a
                href="https://www.instagram.com/trinxats.adv/"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:underline"
            >
                {i18n._('library.by_club')}
            </a>
        </div>
    </div>
    <Resizer
        orientation="col"
        invert={true}
        bind:after={$leftPanelSize}
        minAfter={270}
        maxAfter={450}
    />
    <div class="flex flex-col grow h-full min-w-0">
        <div class="grow relative">
            {#if $selectedAdventureId !== null}
                <!-- Floating tool bar hovering over the map, vertically centered at its
                     left edge. Editing tools only make sense inside an adventure: with
                     anything else selected the whole bar stays hidden. -->
                <div
                    class="absolute top-0 bottom-0 left-2 z-20 flex flex-col justify-center pointer-events-none"
                >
                    <Toolbar />
                </div>
            {/if}
            <Map class="h-full" />
            <StreetViewControl />
            <LayerControl />
            <GPXLayers />
            <CoordinatesPopup />
            <Toaster richColors />
            <!-- Collapse/expand toggle for the track-info panel below. -->
            <button
                class="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 bg-background rounded-md shadow-md p-0.5 border"
                aria-label={i18n._($bottomPanelVisible ? 'menu.collapse' : 'menu.expand')}
                onclick={() => ($bottomPanelVisible = !$bottomPanelVisible)}
            >
                {#if $bottomPanelVisible}
                    <ChevronDown size="18" />
                {:else}
                    <ChevronUp size="18" />
                {/if}
            </button>
        </div>
        {#if $bottomPanelVisible}
            {#if $elevationProfile}
                <Resizer
                    orientation="row"
                    bind:after={$bottomPanelSize}
                    minAfter={100}
                    maxAfter={300}
                />
            {/if}
            <div
                bind:offsetWidth={bottomPanelWidth}
                class="flex {bottomPanelOrientation == 'vertical'
                    ? 'flex-col'
                    : 'flex-row py-2'} gap-1 px-4"
                style={$elevationProfile ? `height: ${$bottomPanelSize}px` : ''}
            >
                <GPXStatistics
                    {gpxStatistics}
                    {slicedGPXStatistics}
                    orientation={bottomPanelOrientation == 'horizontal' ? 'vertical' : 'horizontal'}
                />
                {#if $elevationProfile}
                    <ElevationProfile
                        {gpxStatistics}
                        {slicedGPXStatistics}
                        {hoveredPoint}
                        {additionalDatasets}
                        {elevationFill}
                    />
                {/if}
            </div>
        {/if}
    </div>
</div>

<style lang="postcss">
    @reference "tailwindcss";

    div :global(.toaster.group) {
        @apply absolute;
        @apply right-2;
        --offset: 50px !important;
    }
</style>
