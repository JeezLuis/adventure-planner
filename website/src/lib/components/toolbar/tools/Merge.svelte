<script lang="ts">
    import { ListFileItem, ListTrackItem } from '$lib/components/file-list/file-list';
    import Help from '$lib/components/Help.svelte';
    import { Button } from '$lib/components/ui/button';
    import { i18n } from '$lib/i18n.svelte';
    import { Group } from '@lucide/svelte';
    import { getURLForLanguage } from '$lib/utils';
    import Shortcut from '$lib/components/Shortcut.svelte';
    import { selection } from '$lib/logic/selection';
    import { fileActions } from '$lib/logic/file-actions';

    /**
     * Advanced counterpart of the join tool: merges the contents of the
     * selected items into the first one while keeping the tracks
     * disconnected. Connecting tracks end to end lives in the join tool.
     */
    let props: {
        class?: string;
    } = $props();

    let canMergeContents = $derived(
        $selection.size > 1 &&
            $selection
                .getSelected()
                .some((item) => item instanceof ListFileItem || item instanceof ListTrackItem)
    );
</script>

<div class="flex flex-col gap-3 w-full max-w-80 {props.class ?? ''}">
    <Button
        variant="outline"
        class="whitespace-normal h-fit min-h-8 py-1"
        disabled={!canMergeContents}
        onclick={() => {
            fileActions.mergeSelection(false, false);
        }}
    >
        <Group size="16" class="shrink-0" />
        {i18n._('toolbar.merge.merge_selection')}
    </Button>
    <Help link={getURLForLanguage(i18n.lang, '/help/toolbar/merge')}>
        {#if canMergeContents}
            {i18n._('toolbar.merge.help_merge_contents')}
        {:else}
            {i18n._('toolbar.merge.help_cannot_merge_contents')}
            {i18n._('toolbar.merge.selection_tip').split('{KEYBOARD_SHORTCUT}')[0]}
            <Shortcut ctrl={true} click={true} class="border" />
            {i18n._('toolbar.merge.selection_tip').split('{KEYBOARD_SHORTCUT}')[1]}
        {/if}
    </Help>
</div>
