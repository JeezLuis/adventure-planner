<script lang="ts">
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Select from '$lib/components/ui/select';
    import { Button } from '$lib/components/ui/button';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { settings } from '$lib/logic/settings';
    import {
        OSMAND_ACTIVITIES,
        sanitizeOsmandExportOptions,
    } from '$lib/logic/osmand/osmand-options';
    import { osmandExport, exportAdventureToOsmand } from './utils.svelte';
    import { i18n } from '$lib/i18n.svelte';
    import { get } from 'svelte/store';

    /**
     * Options dialog of the "Send to OsmAnd" adventure export (see
     * $lib/logic/osmand/osmand-export.ts). Opened from the File menu with the
     * adventure id in {@link osmandExport}. The chosen style recipe persists
     * as a setting, so the next export starts from the user's own defaults.
     */
    const osmandExportOptions = settings.osmandExportOptions;

    let mainColor = $state('#ff00ff');
    let alternativeColor = $state('#00ff00');
    let opacityPercent = $state(50);
    let width = $state(20);
    let showArrows = $state(true);
    let showStartFinish = $state(true);
    let milestones = $state(true);
    let milestoneIntervalKm = $state(25);
    let activity = $state<string>('adventure_motorcycling');
    let exporting = $state(false);

    let editingId: string | null = $state(null);
    $effect(() => {
        if (osmandExport.adventureId !== editingId) {
            editingId = osmandExport.adventureId;
            if (editingId !== null) {
                const stored = sanitizeOsmandExportOptions(get(osmandExportOptions));
                mainColor = stored.mainColor;
                alternativeColor = stored.alternativeColor;
                opacityPercent = Math.round(stored.alternativeOpacity * 100);
                width = stored.width;
                showArrows = stored.showArrows;
                showStartFinish = stored.showStartFinish;
                milestones = stored.milestones;
                milestoneIntervalKm = stored.milestoneIntervalKm;
                activity = stored.activity;
            }
        }
    });

    function close() {
        osmandExport.adventureId = null;
    }

    async function confirm() {
        if (osmandExport.adventureId === null || exporting) {
            return;
        }
        const options = sanitizeOsmandExportOptions({
            mainColor,
            alternativeColor,
            alternativeOpacity: Number(opacityPercent) / 100,
            width: Number(width),
            showArrows,
            showStartFinish,
            milestones,
            milestoneIntervalKm: Number(milestoneIntervalKm),
            activity,
        });
        osmandExportOptions.set(options);
        exporting = true;
        try {
            const done = await exportAdventureToOsmand(osmandExport.adventureId, options);
            if (done) {
                close();
            }
        } finally {
            exporting = false;
        }
    }
</script>

<Dialog.Root
    open={osmandExport.adventureId !== null}
    onOpenChange={(open) => {
        if (!open) {
            close();
        }
    }}
>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title>{i18n._('osmand.title')}</Dialog.Title>
        </Dialog.Header>
        <p class="text-sm text-muted-foreground">
            {i18n._('osmand.help')}
        </p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-3">
            <Label class="flex flex-row items-center justify-between gap-1.5">
                {i18n._('osmand.main_color')}
                <input
                    type="color"
                    bind:value={mainColor}
                    class="h-8 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-0.5"
                />
            </Label>
            <Label class="flex flex-row items-center justify-between gap-1.5">
                {i18n._('osmand.alternative_color')}
                <input
                    type="color"
                    bind:value={alternativeColor}
                    class="h-8 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-0.5"
                />
            </Label>
            <Label class="flex flex-row items-center justify-between gap-1.5">
                {i18n._('osmand.alternative_opacity')}
                <Input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    bind:value={opacityPercent}
                    class="w-20"
                />
            </Label>
            <Label class="flex flex-row items-center justify-between gap-1.5">
                {i18n._('osmand.width')}
                <Input type="number" min="1" max="24" step="1" bind:value={width} class="w-20" />
            </Label>
        </div>
        <div class="flex flex-col gap-2.5">
            <Label class="flex flex-row items-center gap-2">
                <Checkbox bind:checked={showArrows} />
                {i18n._('osmand.show_arrows')}
            </Label>
            <Label class="flex flex-row items-center gap-2">
                <Checkbox bind:checked={showStartFinish} />
                {i18n._('osmand.show_start_finish')}
            </Label>
            <Label class="flex flex-row items-center gap-2">
                <Checkbox bind:checked={milestones} />
                {i18n._('osmand.milestones')}
            </Label>
            {#if milestones}
                <Label class="flex flex-row items-center justify-between gap-1.5 pl-6">
                    {i18n._('osmand.milestone_interval')}
                    <Input
                        type="number"
                        min="5"
                        max="500"
                        step="5"
                        bind:value={milestoneIntervalKm}
                        class="w-20"
                    />
                </Label>
            {/if}
            <Label class="flex flex-row items-center justify-between gap-1.5">
                {i18n._('osmand.activity')}
                <Select.Root type="single" bind:value={activity}>
                    <Select.Trigger class="w-44" size="sm">
                        {i18n._(`osmand.activity_options.${activity}`)}
                    </Select.Trigger>
                    <Select.Content>
                        {#each OSMAND_ACTIVITIES as option (option)}
                            <Select.Item value={option}>
                                {i18n._(`osmand.activity_options.${option}`)}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </Label>
        </div>
        <Dialog.Footer>
            <Button variant="outline" onclick={close}>
                {i18n._('library.cancel')}
            </Button>
            <Button disabled={exporting} onclick={confirm}>
                {i18n._('osmand.export')}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
