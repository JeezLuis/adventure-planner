<script lang="ts">
    import { Mountain, Tent, Plus } from '@lucide/svelte';
    import ButtonWithTooltip from '$lib/components/ButtonWithTooltip.svelte';
    import { createFile } from '$lib/logic/file-actions';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Creation actions at the top of the library panel. "New track" works
     * today; expeditions and adventures are the cloud-library hierarchy
     * (Expedition ▸ Adventure ▸ Track) that arrives with Phase 2 - their
     * buttons are visible but disabled so the product shape is already clear.
     */
</script>

<div class="w-full flex flex-row items-center gap-1 p-1 border-b bg-background">
    <ButtonWithTooltip
        variant="ghost"
        size="sm"
        class="grow gap-1 h-7 px-1.5 text-xs opacity-50 cursor-not-allowed"
        label={i18n._('library.coming_soon')}
    >
        <Mountain size="15" />
        {i18n._('library.new_expedition')}
    </ButtonWithTooltip>
    <ButtonWithTooltip
        variant="ghost"
        size="sm"
        class="grow gap-1 h-7 px-1.5 text-xs opacity-50 cursor-not-allowed"
        label={i18n._('library.coming_soon')}
    >
        <Tent size="15" />
        {i18n._('library.new_adventure')}
    </ButtonWithTooltip>
    <ButtonWithTooltip
        variant="ghost"
        size="sm"
        class="grow gap-1 h-7 px-1.5 text-xs"
        label={i18n._('library.new_track_tooltip')}
        onclick={createFile}
    >
        <Plus size="15" />
        {i18n._('library.new_track')}
    </ButtonWithTooltip>
</div>
