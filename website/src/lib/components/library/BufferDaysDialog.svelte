<script lang="ts">
    import * as Dialog from '$lib/components/ui/dialog';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import {
        pendingBufferEdit,
        setTrackBufferDays,
        trackBufferDays,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Asks how many buffer days follow a track (see {@link pendingBufferEdit}),
     * for adventures numbered by date: rest days, slack for a border
     * crossing... The dates of the tracks after this one shift accordingly.
     */
    let days = $state(0);

    let editingId: string | null = $state(null);
    $effect(() => {
        if ($pendingBufferEdit !== editingId) {
            editingId = $pendingBufferEdit;
            if ($pendingBufferEdit !== null) {
                days = $trackBufferDays.get($pendingBufferEdit) ?? 0;
            }
        }
    });

    let valid = $derived(Number.isFinite(Number(days)) && Number(days) >= 0);

    async function confirm() {
        if ($pendingBufferEdit === null || !valid) {
            return;
        }
        await setTrackBufferDays($pendingBufferEdit, Math.floor(Number(days)));
        pendingBufferEdit.set(null);
    }
</script>

<Dialog.Root
    open={$pendingBufferEdit !== null}
    onOpenChange={(open) => {
        if (!open) {
            pendingBufferEdit.set(null);
        }
    }}
>
    <Dialog.Content class="sm:max-w-sm">
        <Dialog.Header>
            <Dialog.Title>{i18n._('library.buffer_days_title')}</Dialog.Title>
        </Dialog.Header>
        <p class="text-sm text-muted-foreground">
            {i18n._('library.buffer_days_help')}
        </p>
        <Label class="flex flex-row items-center gap-1.5">
            {i18n._('library.buffer_days_label')}
            <Input
                type="number"
                min="0"
                max="365"
                step="1"
                bind:value={days}
                class="w-20"
                onkeydown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') confirm();
                }}
            />
        </Label>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => pendingBufferEdit.set(null)}>
                {i18n._('library.cancel')}
            </Button>
            <Button disabled={!valid} onclick={confirm}>
                {i18n._('library.save')}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
