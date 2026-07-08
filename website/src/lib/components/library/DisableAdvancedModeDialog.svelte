<script lang="ts">
    import * as AlertDialog from '$lib/components/ui/alert-dialog';
    import { Button } from '$lib/components/ui/button';
    import { TriangleAlert } from '@lucide/svelte';
    import {
        adventures,
        disableAdvancedMode,
        pendingAdvancedModeDisable,
        selectedAdventureId,
        trackPlacements,
    } from '$lib/library/library';
    import { planningMode } from '$lib/logic/planning';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Confirms turning advanced mode off for an adventure, spelling out that its
     * numbering, trip dates, alternate-track marks and plan document are deleted
     * for good (this clear has no undo). Opens whenever
     * {@link pendingAdvancedModeDisable} is set.
     */
    let name = $derived(
        $adventures.find((a) => a.id === $pendingAdvancedModeDisable)?.name ?? ''
    );

    /** How many tracks in the adventure the clear touches (for the warning copy). */
    let trackCount = $derived.by(() => {
        const id = $pendingAdvancedModeDisable;
        if (id === null) {
            return 0;
        }
        let count = 0;
        $trackPlacements.forEach((adventureId) => {
            if (adventureId === id) {
                count++;
            }
        });
        return count;
    });

    let message = $derived(
        i18n
            ._('library.disable_advanced_confirm_message')
            .replace('{name}', name)
            .replace('{count}', String(trackCount))
    );

    async function confirm() {
        const id = $pendingAdvancedModeDisable;
        if (id !== null) {
            // Leave the plan view first if it is showing this adventure: the plan
            // editor commits planDoc on blur, so unmounting it after the clear
            // could write the doc back and resurrect it. Dropping out of plan
            // mode now unmounts the editor before we delete anything.
            if ($selectedAdventureId === id) {
                planningMode.set(false);
            }
            await disableAdvancedMode(id);
        }
        pendingAdvancedModeDisable.set(null);
    }
</script>

<AlertDialog.Root
    open={$pendingAdvancedModeDisable !== null}
    onOpenChange={(open) => {
        if (!open) {
            pendingAdvancedModeDisable.set(null);
        }
    }}
>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>
                {i18n._('library.disable_advanced_confirm_title')}
            </AlertDialog.Title>
            <AlertDialog.Description>{message}</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel>{i18n._('library.cancel')}</AlertDialog.Cancel>
            <Button variant="destructive" onclick={confirm}>
                <TriangleAlert size="16" />
                {i18n._('library.disable_advanced')}
            </Button>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
