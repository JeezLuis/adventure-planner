<script lang="ts">
    import { settings } from '$lib/logic/settings';
    import { isSelected } from '$lib/components/map/layer-control/utils';
    import { OFFROAD_COLORS } from '$lib/assets/layers';
    import { i18n } from '$lib/i18n.svelte';
    import { ChevronDown, ChevronUp } from '@lucide/svelte';

    // The legend is gated on the offroad overlay being enabled: it appears only
    // while that layer is on, and disappears when it is toggled off.
    const { currentOverlays } = settings;

    let collapsed = $state(false);

    const c = OFFROAD_COLORS;

    // Each row mirrors an offroad map layer: color + line style (dashed track,
    // dotted path, dash-dot bridleway, solid road). Colors come straight from
    // OFFROAD_COLORS so the legend can never drift from the paint.
    type Row = { key: string; color: string; dash: string; cap: 'butt' | 'round' };

    const tracks: Row[] = [
        { key: 'grade1', color: c.grade1, dash: '6 3', cap: 'butt' },
        { key: 'grade2', color: c.grade2, dash: '6 3', cap: 'butt' },
        { key: 'grade3', color: c.grade3, dash: '6 3', cap: 'butt' },
        { key: 'grade4', color: c.grade4, dash: '6 3', cap: 'butt' },
        { key: 'grade5', color: c.grade5, dash: '6 3', cap: 'butt' },
        { key: 'ungraded', color: c.ungraded, dash: '6 3', cap: 'butt' },
    ];
    const nonMotorized: Row[] = [
        { key: 'path', color: c.path, dash: '0 5', cap: 'round' },
        { key: 'bridleway', color: c.bridleway, dash: '8 4 0 4', cap: 'round' },
    ];
    const roads: Row[] = [
        { key: 'road_major', color: c.roadMajor, dash: '', cap: 'butt' },
        { key: 'road_secondary', color: c.roadSecondary, dash: '', cap: 'butt' },
        { key: 'road_tertiary', color: c.roadTertiary, dash: '', cap: 'butt' },
        { key: 'road_residential', color: c.roadResidential, dash: '', cap: 'butt' },
    ];
</script>

{#snippet legendRow(r: Row)}
    <div class="flex flex-row items-center gap-2">
        <svg width="28" height="8" class="shrink-0" aria-hidden="true">
            <line
                x1="2"
                y1="4"
                x2="26"
                y2="4"
                stroke={r.color}
                stroke-width="3"
                stroke-dasharray={r.dash}
                stroke-linecap={r.cap}
            />
        </svg>
        <span class="leading-tight">{i18n._(`layers.offroad_legend.${r.key}`)}</span>
    </div>
{/snippet}

{#if $currentOverlays && isSelected($currentOverlays, 'offroad')}
    <div
        data-testid="offroad-legend"
        class="absolute top-2 left-2 z-20 max-w-[230px] rounded-md border bg-background/95 shadow-md text-xs"
    >
        <button
            type="button"
            class="flex w-full flex-row items-center gap-1 px-2 py-1.5 font-semibold"
            onclick={() => (collapsed = !collapsed)}
            aria-expanded={!collapsed}
        >
            <span class="grow text-left">{i18n._('layers.offroad_legend.title')}</span>
            {#if collapsed}
                <ChevronDown size="14" />
            {:else}
                <ChevronUp size="14" />
            {/if}
        </button>
        {#if !collapsed}
            <div class="flex flex-col gap-2 px-2 pb-2">
                <div class="flex flex-col gap-1">
                    <div class="text-muted-foreground">
                        {i18n._('layers.offroad_legend.tracks')}
                    </div>
                    {#each tracks as r (r.key)}
                        {@render legendRow(r)}
                    {/each}
                </div>
                <div class="flex flex-col gap-1">
                    <div class="text-muted-foreground">
                        {i18n._('layers.offroad_legend.nonmotorized')}
                    </div>
                    {#each nonMotorized as r (r.key)}
                        {@render legendRow(r)}
                    {/each}
                </div>
                <div class="flex flex-col gap-1">
                    <div class="text-muted-foreground">{i18n._('layers.offroad_legend.roads')}</div>
                    {#each roads as r (r.key)}
                        {@render legendRow(r)}
                    {/each}
                </div>
                <div class="text-muted-foreground leading-tight">
                    {i18n._('layers.offroad_legend.note')}
                </div>
            </div>
        {/if}
    </div>
{/if}
