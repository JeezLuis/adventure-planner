<script lang="ts">
    import { fileStateCollection } from '$lib/logic/file-state';
    import type { GPXFileWithStatistics } from '$lib/logic/statistics-tree';
    import { fileActionManager } from '$lib/logic/file-action-manager';
    import { trackTags } from '$lib/library/library';
    import { planningMode } from '$lib/logic/planning';
    import { boundsManager } from '$lib/logic/bounds';
    import { ListFileItem } from '$lib/components/file-list/file-list';
    import TrackPreview from './TrackPreview.svelte';
    import WithUnits from '$lib/components/WithUnits.svelte';
    import { Textarea } from '$lib/components/ui/textarea';
    import { Button } from '$lib/components/ui/button';
    import * as Collapsible from '$lib/components/ui/collapsible';
    import { ChevronRight, Map } from '@lucide/svelte';
    import { i18n } from '$lib/i18n.svelte';

    let { fileId }: { fileId: string } = $props();

    // Re-resolve the file's state whenever the collection changes (add/remove),
    // then subscribe to it for live content updates. (Named `fileState`, not
    // `state`, so it does not shadow the `$state` rune.)
    let fileState = $derived($fileStateCollection.get(fileId));
    let fileWithStats = $state<GPXFileWithStatistics | undefined>(undefined);
    $effect(() => {
        const current = fileState;
        if (!current) {
            fileWithStats = undefined;
            return;
        }
        return current.subscribe((value) => (fileWithStats = value));
    });

    let file = $derived(fileWithStats?.file);
    let name = $derived(file?.metadata.name ?? '');
    let tag = $derived($trackTags.get(fileId));

    let stats = $derived.by(() => {
        if (!fileWithStats) return null;
        try {
            return fileWithStats.statistics.getStatisticsFor(new ListFileItem(fileWithStats.file._data.id))
                .global;
        } catch {
            return null;
        }
    });
    let trackPoints = $derived(
        file
            ? file.trk.reduce((n, t) => n + t.trkseg.reduce((m, s) => m + s.trkpt.length, 0), 0)
            : 0
    );

    // The track's description is its single planning text field, shared with the
    // metadata dialog and round-tripped as <trk><desc>. Echo-guard so committing
    // does not reset the field mid-edit; re-sync only on an external change.
    let descValue = $state('');
    let lastDesc = '';
    $effect(() => {
        const current = file?.trk[0]?.desc ?? '';
        if (current !== lastDesc) {
            descValue = current;
            lastDesc = current;
        }
    });
    function saveDescription() {
        lastDesc = descValue;
        fileActionManager.applyToFile(fileId, (draft) => {
            if (draft.trk[0]) draft.trk[0].desc = descValue;
        });
    }

    function showInMap() {
        planningMode.set(false);
        boundsManager.fitBoundsOnLoad([fileId]);
    }

    let open = $state(false);
</script>

<Collapsible.Root bind:open class="rounded-lg border bg-background">
    <div class="flex flex-row items-center gap-1 pr-2">
        <Collapsible.Trigger
            class="flex min-w-0 grow flex-row items-center gap-2 px-3 py-2 text-left"
        >
            <ChevronRight
                size="16"
                class="shrink-0 text-muted-foreground transition-transform {open ? 'rotate-90' : ''}"
            />
            {#if tag}
                <span
                    class="shrink-0 rounded px-1.5 py-0.5 text-xs {tag.alternative
                        ? 'bg-green-500/15 font-semibold text-green-600'
                        : 'bg-muted text-muted-foreground'}"
                    title={tag.alternative ? i18n._('library.alternative_title') : undefined}
                >
                    {tag.label}
                </span>
            {/if}
            <span class="min-w-0 truncate text-base font-semibold leading-tight">{name}</span>
        </Collapsible.Trigger>
        <Button
            variant="ghost"
            size="sm"
            class="shrink-0 gap-1.5 text-muted-foreground"
            onclick={showInMap}
        >
            <Map size="15" />
            <span class="hidden sm:inline">{i18n._('planning.show_in_map')}</span>
        </Button>
    </div>
    <Collapsible.Content class="px-3 pb-3">
        {#if file}
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div class="w-full sm:w-64">
                    <TrackPreview {file} />
                </div>
                <dl class="grid grow grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                        <dt class="text-xs text-muted-foreground">{i18n._('planning.distance')}</dt>
                        <dd class="font-medium">
                            {#if stats}<WithUnits value={stats.distance.total} type="distance" />{:else}—{/if}
                        </dd>
                    </div>
                    <div>
                        <dt class="text-xs text-muted-foreground">{i18n._('planning.points')}</dt>
                        <dd class="font-medium tabular-nums">{trackPoints}</dd>
                    </div>
                    <div>
                        <dt class="text-xs text-muted-foreground">{i18n._('planning.ascent')}</dt>
                        <dd class="font-medium">
                            {#if stats}<WithUnits value={stats.elevation.gain} type="elevation" />{:else}—{/if}
                        </dd>
                    </div>
                    <div>
                        <dt class="text-xs text-muted-foreground">{i18n._('planning.descent')}</dt>
                        <dd class="font-medium">
                            {#if stats}<WithUnits value={stats.elevation.loss} type="elevation" />{:else}—{/if}
                        </dd>
                    </div>
                </dl>
            </div>
            <!-- Single description field: the track's <desc>, shared with the metadata dialog. -->
            <div class="mt-3 mb-0.5 text-xs text-muted-foreground">
                {i18n._('menu.metadata.description')}
            </div>
            <Textarea
                value={descValue}
                oninput={(event) => (descValue = event.currentTarget.value)}
                onblur={saveDescription}
                rows={3}
                placeholder={i18n._('planning.description_placeholder')}
                class="w-full resize-y"
            />
        {:else}
            <p class="text-sm text-muted-foreground">{i18n._('planning.track_unavailable')}</p>
        {/if}
    </Collapsible.Content>
</Collapsible.Root>
