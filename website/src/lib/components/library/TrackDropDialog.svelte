<script lang="ts">
    import * as AlertDialog from '$lib/components/ui/alert-dialog';
    import { Button } from '$lib/components/ui/button';
    import { Copy, FolderInput } from '@lucide/svelte';
    import { pendingTrackDrop } from './dnd';
    import { adventures, placeTracks } from '$lib/library/library';
    import { fileActions } from '$lib/logic/file-actions';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Asks whether tracks dropped onto an adventure should be moved there or
     * copied. Opens whenever {@link pendingTrackDrop} is set; closing without
     * choosing leaves everything unchanged.
     */
    let adventureName = $derived(
        $adventures.find((a) => a.id === $pendingTrackDrop?.adventureId)?.name ?? ''
    );
    let count = $derived($pendingTrackDrop?.fileIds.length ?? 0);
    let question = $derived(
        (count > 1
            ? i18n._('library.move_or_copy_question_many').replace('{count}', String(count))
            : i18n._('library.move_or_copy_question')
        ).replace('{name}', adventureName)
    );

    function move() {
        const drop = $pendingTrackDrop;
        if (drop) {
            placeTracks(drop.fileIds, drop.adventureId);
        }
        pendingTrackDrop.set(null);
    }

    function copy() {
        const drop = $pendingTrackDrop;
        if (drop) {
            fileActions.copyFilesTo(drop.fileIds, drop.adventureId);
        }
        pendingTrackDrop.set(null);
    }
</script>

<AlertDialog.Root
    open={$pendingTrackDrop !== null}
    onOpenChange={(open) => {
        if (!open) {
            pendingTrackDrop.set(null);
        }
    }}
>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>{i18n._('library.move_or_copy_title')}</AlertDialog.Title>
            <AlertDialog.Description>{question}</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel>{i18n._('library.cancel')}</AlertDialog.Cancel>
            <Button variant="outline" onclick={copy}>
                <Copy size="16" />
                {i18n._('library.copy')}
            </Button>
            <Button onclick={move}>
                <FolderInput size="16" />
                {i18n._('library.move')}
            </Button>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
