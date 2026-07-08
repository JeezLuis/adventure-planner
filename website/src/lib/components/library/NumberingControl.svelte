<script lang="ts">
    import * as Popover from '$lib/components/ui/popover';
    import { Input } from '$lib/components/ui/input';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { Label } from '$lib/components/ui/label';
    import { ListOrdered } from '@lucide/svelte';
    import { updateAdventure, type Adventure, type TrackNumbering } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Track-numbering control for the selected adventure, surfaced directly in
     * the track pane header (advanced mode only, mounted by {@link LibraryTracks}).
     * Switches between no numbering, sequential numbers, or trip dates and, for
     * dates, picks the start date and whether to show the year. Changes apply
     * immediately so the track tags in the pane update live while the user
     * explores the options; there is no separate save step. Replaces the
     * numbering block that used to live in the Edit adventure dialog.
     */
    let { adventure }: { adventure: Adventure } = $props();

    let numbering = $state<TrackNumbering>('none');
    let startDate = $state('');
    let showYear = $state(false);

    // Seed the controls from the adventure when the target changes. Later store
    // updates are the echo of our own writes, so we don't re-seed on those (that
    // would fight the user mid-edit); we only re-seed when the id actually flips.
    let seededId: string | null = $state(null);
    $effect(() => {
        if (adventure.id !== seededId) {
            seededId = adventure.id;
            numbering = adventure.numbering ?? 'none';
            startDate = adventure.startDate ?? '';
            showYear = adventure.showYear ?? false;
        }
    });

    /** Today as yyyy-mm-dd, a sensible default when first switching to date mode. */
    function today(): string {
        return new Date().toISOString().slice(0, 10);
    }

    function persist() {
        updateAdventure(adventure.id, {
            numbering,
            startDate: numbering === 'date' ? startDate || undefined : undefined,
            showYear: numbering === 'date' ? showYear : undefined,
        });
    }

    function setMode(next: TrackNumbering) {
        numbering = next;
        if (numbering === 'date' && startDate === '') {
            startDate = today();
        }
        persist();
    }

    const modes: { value: TrackNumbering; key: string }[] = [
        { value: 'none', key: 'library.numbering_none' },
        { value: 'numbers', key: 'library.numbering_numbers' },
        { value: 'date', key: 'library.numbering_date' },
    ];
</script>

<Popover.Root>
    <Popover.Trigger
        class="flex shrink-0 flex-row items-center rounded border px-1.5 py-0.5 font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
        title={i18n._('library.numbering')}
    >
        <ListOrdered size="12" class="shrink-0" />
    </Popover.Trigger>
    <Popover.Content class="flex w-64 flex-col gap-2" side="bottom" align="end">
        <span class="text-xs font-medium">{i18n._('library.numbering')}</span>
        <div class="flex flex-col gap-0.5">
            {#each modes as mode (mode.value)}
                <button
                    class="w-full rounded px-2 py-1 text-left text-sm {numbering === mode.value
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
                    onclick={() => setMode(mode.value)}
                >
                    {i18n._(mode.key)}
                </button>
            {/each}
        </div>
        <p class="text-xs text-muted-foreground">
            {i18n._(numbering === 'date' ? 'library.numbering_date_help' : 'library.numbering_help')}
        </p>
        {#if numbering === 'date'}
            <Label class="flex flex-col items-start gap-1.5">
                {i18n._('library.start_date')}
                <Input
                    type="date"
                    value={startDate}
                    onchange={(e) => {
                        startDate = e.currentTarget.value;
                        persist();
                    }}
                    class="w-fit"
                />
            </Label>
            <Label class="flex flex-row items-center gap-1.5">
                <Checkbox
                    checked={showYear}
                    onCheckedChange={(checked) => {
                        showYear = checked === true;
                        persist();
                    }}
                />
                {i18n._('library.show_year')}
            </Label>
        {/if}
    </Popover.Content>
</Popover.Root>
