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
    import OffroadLegend from '$lib/components/map/layer-control/OffroadLegend.svelte';
    import CoordinatesPopup from '$lib/components/map/CoordinatesPopup.svelte';
    import Resizer from '$lib/components/Resizer.svelte';
    import { Toaster } from '$lib/components/ui/sonner';
    import { i18n } from '$lib/i18n.svelte';
    import { settings } from '$lib/logic/settings';
    import { importAdventures } from '$lib/logic/file-actions';
    import { onDestroy, onMount } from 'svelte';
    import { page } from '$app/state';
    import { gpxStatistics, hoveredPoint, slicedGPXStatistics } from '$lib/logic/statistics';
    import { db } from '$lib/db';
    import { fileStateCollection } from '$lib/logic/file-state';
    import { selectedAdventureId, selectedAdventureIsAdvanced } from '$lib/library/library';
    import { currentTool } from '$lib/components/toolbar/tools';
    import { planningMode } from '$lib/logic/planning';
    import MapPlanToggle from '$lib/components/planning/MapPlanToggle.svelte';
    import PlanningView from '$lib/components/planning/PlanningView.svelte';

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

    // Planning is scoped to a single selected adventure; leaving that selection
    // returns to the map so the planning view never lingers over a stale target.
    $effect(() => {
        if ($selectedAdventureId === null && $planningMode) {
            $planningMode = false;
        }
    });

    // Planning is an advanced-mode feature: dropping the selected adventure out
    // of advanced mode (e.g. turning advanced mode off while its plan is open)
    // returns to the map, so the plan view can never outlive advanced mode.
    $effect(() => {
        if (!$selectedAdventureIsAdvanced && $planningMode) {
            $planningMode = false;
        }
    });

    // The planning view fully replaces the map, so its overlays and controls hide.
    let planningActive = $derived(
        $selectedAdventureId !== null && $selectedAdventureIsAdvanced && $planningMode
    );

    onMount(async () => {
        settings.connectToDatabase(db);
        fileStateCollection.connectToDatabase(db).then(() => {
            let urls: string[] = JSON.parse(page.url.searchParams.get('files') || '[]');

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
                    // Share/URL imports have no selected adventure, so import
                    // each as its own root-level adventure to keep every track
                    // reachable (no Unsorted limbo).
                    importAdventures(
                        files.filter((file): file is File => file !== null),
                        null
                    );
                });
            }
        });
    });

    onDestroy(() => {
        settings.disconnectFromDatabase();
        fileStateCollection.disconnectFromDatabase();
    });
</script>

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
        <div class="grow relative" class:planning-active={planningActive}>
            {#if $selectedAdventureId !== null && $selectedAdventureIsAdvanced}
                <!-- Segmented Map | Plan toggle over the map. Planning is an
                     advanced-mode feature, so it appears only when the single
                     selected adventure has advanced mode on. -->
                <div class="absolute top-2 left-1/2 -translate-x-1/2 z-40">
                    <MapPlanToggle />
                </div>
            {/if}
            {#if $selectedAdventureId !== null && !$planningMode}
                <!-- Floating tool bar hovering over the map, vertically centered at its
                     left edge. Editing tools only make sense inside an adventure: with
                     anything else selected the whole bar stays hidden. -->
                <div
                    class="absolute top-0 bottom-0 left-2 z-20 flex flex-col justify-center pointer-events-none"
                >
                    <Toolbar />
                </div>
            {/if}
            <!-- The map stays mounted underneath (it is expensive to recreate); the
                 planning view simply overlays it when the user switches to "Plan". -->
            <Map class="h-full" />
            {#if !planningActive}
                <StreetViewControl />
                <LayerControl />
                <OffroadLegend />
            {/if}
            <GPXLayers />
            <CoordinatesPopup />
            <Toaster richColors />
            {#if $selectedAdventureId !== null && !$planningMode}
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
            {/if}
            {#if $selectedAdventureId !== null && $selectedAdventureIsAdvanced && $planningMode}
                <div class="absolute inset-0 z-30 bg-background">
                    <PlanningView adventureId={$selectedAdventureId} />
                </div>
            {/if}
        </div>
        {#if $bottomPanelVisible && !$planningMode}
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

    /* In planning mode the map is fully covered, so hide MapLibre's own controls
       (zoom, geolocate, pitch, geocoder) that otherwise float above the overlay. */
    .planning-active :global(.maplibregl-control-container) {
        display: none;
    }
</style>
