<script lang="ts">
    import * as Dialog from '$lib/components/ui/dialog';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Textarea } from '$lib/components/ui/textarea';
    import {
        adventures,
        expeditions,
        pendingMetadataEdit,
        updateAdventure,
        updateExpedition,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Edits the metadata of an adventure or expedition (see
     * {@link pendingMetadataEdit}): its name and description. Track numbering /
     * trip dates are edited in place from the track pane header for advanced
     * adventures (see NumberingControl), not here, so simple adventures keep a
     * minimal dialog.
     */
    let name = $state('');
    let description = $state('');

    let isAdventure = $derived($pendingMetadataEdit?.kind === 'adventure');

    let editingId: string | null = $state(null);
    $effect(() => {
        const editing = $pendingMetadataEdit;
        if ((editing?.id ?? null) !== editingId) {
            editingId = editing?.id ?? null;
            if (editing === null) {
                return;
            }
            const item =
                editing.kind === 'adventure'
                    ? $adventures.find((a) => a.id === editing.id)
                    : $expeditions.find((e) => e.id === editing.id);
            if (item) {
                name = item.name;
                description = item.description ?? '';
            }
        }
    });

    let valid = $derived(name.trim().length > 0);

    async function confirm() {
        const editing = $pendingMetadataEdit;
        if (editing === null || !valid) {
            return;
        }
        const common = {
            name: name.trim(),
            description: description.trim().length > 0 ? description.trim() : undefined,
        };
        if (editing.kind === 'adventure') {
            await updateAdventure(editing.id, common);
        } else {
            await updateExpedition(editing.id, common);
        }
        pendingMetadataEdit.set(null);
    }
</script>

<Dialog.Root
    open={$pendingMetadataEdit !== null}
    onOpenChange={(open) => {
        if (!open) {
            pendingMetadataEdit.set(null);
        }
    }}
>
    <Dialog.Content class="sm:max-w-sm">
        <Dialog.Header>
            <Dialog.Title>
                {i18n._(isAdventure ? 'library.edit_adventure' : 'library.edit_expedition')}
            </Dialog.Title>
        </Dialog.Header>
        <Label class="flex flex-col items-start gap-1.5">
            {i18n._('library.name_label')}
            <Input
                bind:value={name}
                onkeydown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') confirm();
                }}
            />
        </Label>
        <Label class="flex flex-col items-start gap-1.5">
            {i18n._('library.description_label')}
            <Textarea bind:value={description} class="min-h-16 text-sm" />
        </Label>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => pendingMetadataEdit.set(null)}>
                {i18n._('library.cancel')}
            </Button>
            <Button disabled={!valid} onclick={confirm}>
                {i18n._('library.save')}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
