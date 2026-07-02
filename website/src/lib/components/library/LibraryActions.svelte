<script lang="ts">
    import { Mountain, Tent, Plus, CloudUpload } from '@lucide/svelte';
    import { toast } from 'svelte-sonner';
    import ButtonWithTooltip from '$lib/components/ButtonWithTooltip.svelte';
    import { createFile } from '$lib/logic/file-actions';
    import {
        adventures,
        createAdventure,
        createExpedition,
        expeditions,
        selectedAdventureId,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Creation actions at the top of the library panel. Expeditions and
     * adventures are fully local for now; the sync button is a placeholder
     * for the upcoming cloud synchronization and only announces itself.
     */
    async function newExpedition() {
        await createExpedition(
            null,
            `${i18n._('library.new_expedition_name')} ${$expeditions.length + 1}`
        );
    }

    async function newAdventure() {
        const id = await createAdventure(
            null,
            `${i18n._('library.new_adventure_name')} ${$adventures.length + 1}`
        );
        // New tracks now land in the adventure that was just created.
        selectedAdventureId.set(id);
    }
</script>

<div class="w-full flex flex-row items-center gap-1 p-1 border-b bg-background">
    <ButtonWithTooltip
        variant="ghost"
        size="sm"
        class="grow gap-1 h-7 px-1.5 text-xs"
        label={i18n._('library.new_expedition_tooltip')}
        onclick={newExpedition}
    >
        <Mountain size="15" />
        {i18n._('library.new_expedition')}
    </ButtonWithTooltip>
    <ButtonWithTooltip
        variant="ghost"
        size="sm"
        class="grow gap-1 h-7 px-1.5 text-xs"
        label={i18n._('library.new_adventure_tooltip')}
        onclick={newAdventure}
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
    <ButtonWithTooltip
        variant="outline"
        size="sm"
        class="gap-1 h-7 px-1.5 text-xs shrink-0"
        label={i18n._('library.sync_tooltip')}
        onclick={() => toast.info(i18n._('library.sync_coming_soon'))}
    >
        <CloudUpload size="15" />
    </ButtonWithTooltip>
</div>
