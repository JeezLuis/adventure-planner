<script lang="ts">
    import {
        adventures,
        trackPlacements,
        trackAlternatives,
        updateAdventure,
    } from '$lib/library/library';
    import { settings } from '$lib/logic/settings';
    import { fileStateCollection } from '$lib/logic/file-state';
    import { ListFileItem } from '$lib/components/file-list/file-list';
    import PlanEditor from './PlanEditor.svelte';
    import TrackPlanSection from './TrackPlanSection.svelte';
    import WithUnits from '$lib/components/WithUnits.svelte';
    import { i18n } from '$lib/i18n.svelte';
    import { Route, Eye, EyeOff } from '@lucide/svelte';

    let { adventureId }: { adventureId: string } = $props();

    const { fileOrder, showAlternativesOnMap } = settings;

    let adventure = $derived($adventures.find((a) => a.id === adventureId));
    // The adventure's tracks in the same manual order as the track pane and the
    // numbering tags, so the planning sections line up with what the user sees.
    let allTrackIds = $derived($fileOrder.filter((id) => $trackPlacements.get(id) === adventureId));
    // Main (official) tracks: everything not flagged as an alternative.
    let mainTrackIds = $derived(allTrackIds.filter((id) => !$trackAlternatives.has(id)));
    // Alternatives are hidden by default here (official traces only); the same
    // show-alternatives switch reveals them. Uses the raw alternative flag so it
    // works whether or not the adventure is numbered.
    let trackIds = $derived(
        allTrackIds.filter((id) => $showAlternativesOnMap || !$trackAlternatives.has(id))
    );
    let hasAlternatives = $derived(allTrackIds.some((id) => $trackAlternatives.has(id)));

    // Live per-track distances, summed over the main tracks for the overview total.
    let distances = $state(new Map<string, number>());
    $effect(() => {
        const ids = mainTrackIds;
        const collection = $fileStateCollection;
        const values = new Map<string, number>();
        const unsubscribes = ids.map((id) => {
            const state = collection.get(id);
            if (!state) return () => {};
            return state.subscribe((value) => {
                if (value) {
                    try {
                        values.set(
                            id,
                            value.statistics.getStatisticsFor(new ListFileItem(value.file._data.id))
                                .global.distance.total
                        );
                    } catch {
                        values.delete(id);
                    }
                } else {
                    values.delete(id);
                }
                distances = new Map(values);
            });
        });
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    });
    let totalDistance = $derived(
        mainTrackIds.reduce((sum, id) => sum + (distances.get(id) ?? 0), 0)
    );

    function saveAdventurePlan(markdown: string) {
        updateAdventure(adventureId, { planDoc: markdown });
    }
</script>

<div class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-5xl flex-col gap-6 p-4 pt-14">
        <div class="flex flex-col gap-1">
            <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {i18n._('planning.overview')}
            </span>
            <!-- Adventure title size: change `text-4xl` below (Tailwind steps:
                 text-3xl=30px, text-4xl=36px, text-5xl=48px, text-6xl=60px). -->
            <h2 class="text-5xl font-bold tracking-tight">{adventure?.name ?? ''}</h2>
            {#if mainTrackIds.length > 0}
                <div class="flex flex-row items-center gap-1.5 text-sm text-muted-foreground">
                    <Route size="14" />
                    <span class="font-medium text-foreground">
                        <WithUnits value={totalDistance} type="distance" />
                    </span>
                    <span>· {i18n._('planning.main_tracks_total')}</span>
                </div>
            {/if}
            {#if adventure?.description}
                <!-- The adventure's description (edited in the metadata dialog),
                     shown here as a subtitle rather than in the left tracks pane. -->
                <p class="mt-1 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
                    {adventure.description}
                </p>
            {/if}
        </div>

        <PlanEditor markdown={adventure?.planDoc ?? ''} onchange={saveAdventurePlan} />

        {#if allTrackIds.length > 0}
            <div class="flex flex-col gap-2">
                <div class="flex flex-row items-center gap-2 text-sm font-semibold">
                    <Route size="16" class="text-muted-foreground" />
                    {i18n._('planning.tracks')}
                    {#if hasAlternatives}
                        <button
                            type="button"
                            class="ml-auto flex flex-row items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
                            title={i18n._(
                                $showAlternativesOnMap
                                    ? 'library.hide_alternatives'
                                    : 'library.show_alternatives'
                            )}
                            onclick={() => showAlternativesOnMap.update((show) => !show)}
                        >
                            {#if $showAlternativesOnMap}
                                <Eye size="13" />
                            {:else}
                                <EyeOff size="13" />
                            {/if}
                            {i18n._('planning.alternatives')}
                        </button>
                    {/if}
                </div>
                {#each trackIds as fileId (fileId)}
                    <TrackPlanSection {fileId} />
                {/each}
            </div>
        {/if}
    </div>
</div>
