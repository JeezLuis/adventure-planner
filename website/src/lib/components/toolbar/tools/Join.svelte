<script lang="ts">
    import { ListFileItem, ListTrackItem } from '$lib/components/file-list/file-list';
    import Help from '$lib/components/Help.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Label } from '$lib/components/ui/label/index.js';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { i18n } from '$lib/i18n.svelte';
    import { Link } from '@lucide/svelte';
    import { getURLForLanguage } from '$lib/utils';
    import Shortcut from '$lib/components/Shortcut.svelte';
    import { selection } from '$lib/logic/selection';
    import { fileStateCollection } from '$lib/logic/file-state';
    import { fileActions } from '$lib/logic/file-actions';
    import { gpxStatistics } from '$lib/logic/statistics';

    /**
     * Essential counterpart of the advanced merge tool: connects the selected
     * tracks into a single continuous track, in the order they appear in the
     * adventure list.
     */
    let props: {
        class?: string;
    } = $props();

    let canJoin = $derived.by(() => {
        if ($selection.size > 1) {
            return true;
        } else if ($selection.size === 1) {
            let selected = $selection.getSelected()[0];
            if (selected instanceof ListFileItem) {
                let file = fileStateCollection.getFile(selected.getFileId());
                if (file) {
                    return file.getSegments().length > 1;
                }
            } else if (selected instanceof ListTrackItem) {
                let trackIndex = selected.getTrackIndex();
                let file = fileStateCollection.getFile(selected.getFileId());
                if (file && trackIndex < file.trk.length) {
                    return file.trk[trackIndex].getSegments().length > 1;
                }
            }
            return false;
        }
    });

    let removeGaps = $state(false);
</script>

<div class="flex flex-col gap-3 w-full max-w-80 {props.class ?? ''}">
    {#if $gpxStatistics.global.time.total > 0}
        <div class="flex flex-row items-center gap-1.5">
            <Checkbox id="join-remove-gaps" bind:checked={removeGaps} />
            <Label for="join-remove-gaps">{i18n._('toolbar.join.remove_gaps')}</Label>
        </div>
    {/if}
    <Button
        variant="outline"
        class="whitespace-normal h-fit min-h-8 py-1"
        disabled={!canJoin}
        onclick={() => {
            fileActions.mergeSelection(
                true,
                $gpxStatistics.global.time.total > 0 && removeGaps
            );
        }}
    >
        <Link size="16" class="shrink-0" />
        {i18n._('toolbar.join.button')}
    </Button>
    <Help link={getURLForLanguage(i18n.lang, '/help/toolbar/merge')}>
        {#if canJoin}
            {i18n._('toolbar.join.help')}
        {:else}
            {i18n._('toolbar.join.help_invalid_selection')}
            {i18n._('toolbar.merge.selection_tip').split('{KEYBOARD_SHORTCUT}')[0]}
            <Shortcut ctrl={true} click={true} class="border" />
            {i18n._('toolbar.merge.selection_tip').split('{KEYBOARD_SHORTCUT}')[1]}
        {/if}
    </Help>
</div>
