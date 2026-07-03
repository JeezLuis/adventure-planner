<script lang="ts">
    import { Mountain, Tent, Route, Upload, Import } from '@lucide/svelte';
    import ButtonWithTooltip from '$lib/components/ButtonWithTooltip.svelte';
    import { createFile, triggerFileInput, importAdventures } from '$lib/logic/file-actions';
    import {
        adventures,
        expeditions,
        librarySelection,
        pendingCreation,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Creation actions at the top of the library panel, enforcing the
     * Expedition > Adventure > Track hierarchy: an adventure needs a target
     * expedition (the selected one, or the one of the selected adventure) and
     * a track needs a selected adventure to land in. Expedition and adventure
     * creation ask for a name (see CreateLibraryItemDialog) and then select
     * what they created, so the natural flow is one button after the other;
     * while the library is empty, the Expedition button pulses to point the
     * user at the entry of that flow.
     */
    let targetExpeditionId = $derived.by(() => {
        if ($librarySelection.length !== 1) {
            return null;
        }
        const item = $librarySelection[0];
        if (item.kind === 'expedition') {
            return item.id;
        }
        return $adventures.find((a) => a.id === item.id)?.expeditionId ?? null;
    });

    let canCreateAdventure = $derived(targetExpeditionId !== null);
    let canCreateTrack = $derived(
        $librarySelection.length === 1 && $librarySelection[0].kind === 'adventure'
    );
    let libraryIsEmpty = $derived($expeditions.length === 0);
</script>

<div class="w-full flex flex-col border-b bg-background">
    <span
        class="px-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground select-none"
    >
        {i18n._('library.new_label')}
    </span>
    <div class="w-full flex flex-row items-center gap-1 p-1 pt-0.5">
        <ButtonWithTooltip
            variant="ghost"
            size="sm"
            class="grow gap-1 h-7 px-1.5 text-xs {libraryIsEmpty
                ? 'animate-pulse ring-2 ring-primary'
                : ''}"
            label={i18n._('library.new_expedition_tooltip')}
            onclick={() => pendingCreation.set({ kind: 'expedition', parentId: null })}
        >
            <Mountain size="15" />
            {i18n._('library.new_expedition')}
        </ButtonWithTooltip>
        <ButtonWithTooltip
            variant="ghost"
            size="sm"
            class="grow gap-1 h-7 px-1.5 text-xs"
            label={i18n._(
                canCreateAdventure
                    ? 'library.new_adventure_tooltip'
                    : 'library.new_adventure_disabled_tooltip'
            )}
            disabled={!canCreateAdventure}
            onclick={() => pendingCreation.set({ kind: 'adventure', parentId: targetExpeditionId })}
        >
            <Tent size="15" />
            {i18n._('library.new_adventure')}
        </ButtonWithTooltip>
        <ButtonWithTooltip
            variant="ghost"
            size="sm"
            class="grow gap-1 h-7 px-1.5 text-xs"
            label={i18n._(
                canCreateTrack ? 'library.new_track_tooltip' : 'library.new_track_disabled_tooltip'
            )}
            disabled={!canCreateTrack}
            onclick={createFile}
        >
            <Route size="15" />
            {i18n._('library.new_track')}
        </ButtonWithTooltip>
    </div>
    <span
        class="px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground select-none"
    >
        {i18n._('library.import_label')}
    </span>
    <div class="w-full flex flex-row items-center gap-1 p-1 pt-0.5">
        <ButtonWithTooltip
            variant="ghost"
            size="sm"
            class="grow gap-1 h-7 px-1.5 text-xs"
            label={i18n._(
                canCreateTrack
                    ? 'library.import_track_tooltip'
                    : 'library.import_track_disabled_tooltip'
            )}
            disabled={!canCreateTrack}
            onclick={() => triggerFileInput()}
        >
            <Upload size="15" />
            {i18n._('library.import_track')}
        </ButtonWithTooltip>
        <ButtonWithTooltip
            variant="ghost"
            size="sm"
            class="grow gap-1 h-7 px-1.5 text-xs"
            label={i18n._(
                canCreateAdventure
                    ? 'library.import_adventure_tooltip'
                    : 'library.import_adventure_disabled_tooltip'
            )}
            disabled={!canCreateAdventure}
            onclick={() => triggerFileInput((files) => importAdventures(files, targetExpeditionId))}
        >
            <Import size="15" />
            {i18n._('library.import_adventure')}
        </ButtonWithTooltip>
    </div>
</div>
