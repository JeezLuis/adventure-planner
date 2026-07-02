<script lang="ts">
    import * as AlertDialog from '$lib/components/ui/alert-dialog';
    import { Button } from '$lib/components/ui/button';
    import { Trash2 } from '@lucide/svelte';
    import {
        adventures,
        adventureIdsOfSelection,
        expeditions,
        pendingDeletion,
        trackPlacements,
    } from '$lib/library/library';
    import { deleteLibraryItem } from '$lib/logic/file-actions';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Confirms the deletion of an adventure or expedition, spelling out that
     * every track inside (and, for expeditions, everything nested below) is
     * deleted with it. Opens whenever {@link pendingDeletion} is set.
     */
    let name = $derived.by(() => {
        const item = $pendingDeletion;
        if (item === null) {
            return '';
        }
        return (
            (item.kind === 'adventure'
                ? $adventures.find((a) => a.id === item.id)?.name
                : $expeditions.find((e) => e.id === item.id)?.name) ?? ''
        );
    });

    /** How many tracks the deletion takes with it. */
    let trackCount = $derived.by(() => {
        const item = $pendingDeletion;
        if (item === null) {
            return 0;
        }
        const adventureIds = adventureIdsOfSelection([item], $expeditions, $adventures);
        let count = 0;
        $trackPlacements.forEach((adventureId) => {
            if (adventureIds.has(adventureId)) {
                count++;
            }
        });
        return count;
    });

    let title = $derived(
        i18n._(
            $pendingDeletion?.kind === 'expedition'
                ? 'library.delete_confirm_title_expedition'
                : 'library.delete_confirm_title_adventure'
        )
    );
    let message = $derived(
        i18n
            ._('library.delete_confirm_message')
            .replace('{name}', name)
            .replace('{count}', String(trackCount))
    );

    function confirm() {
        const item = $pendingDeletion;
        if (item) {
            deleteLibraryItem(item);
        }
        pendingDeletion.set(null);
    }
</script>

<AlertDialog.Root
    open={$pendingDeletion !== null}
    onOpenChange={(open) => {
        if (!open) {
            pendingDeletion.set(null);
        }
    }}
>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>{title}</AlertDialog.Title>
            <AlertDialog.Description>{message}</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel>{i18n._('library.cancel')}</AlertDialog.Cancel>
            <Button variant="destructive" onclick={confirm}>
                <Trash2 size="16" />
                {i18n._('library.delete')}
            </Button>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
