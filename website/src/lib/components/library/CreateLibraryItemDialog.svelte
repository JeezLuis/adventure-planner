<script lang="ts">
    import * as Dialog from '$lib/components/ui/dialog';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import {
        createAdventure,
        createExpedition,
        pendingCreation,
        selectLibraryItem,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Asks for the name of an expedition or adventure about to be created
     * (see {@link pendingCreation}). Name is the only, required field for
     * now; the created item becomes the library selection so the creation
     * flow can chain (expedition, then adventure, then track).
     */
    let name = $state('');

    $effect(() => {
        if ($pendingCreation !== null) {
            name = '';
        }
    });

    let valid = $derived(name.trim().length > 0);
    let title = $derived(
        i18n._(
            $pendingCreation?.kind === 'expedition'
                ? 'library.new_expedition_name'
                : 'library.new_adventure_name'
        )
    );

    async function confirm() {
        const creation = $pendingCreation;
        const trimmed = name.trim();
        if (!creation || trimmed.length === 0) {
            return;
        }
        const id =
            creation.kind === 'expedition'
                ? await createExpedition(creation.parentId, trimmed)
                : await createAdventure(creation.parentId, trimmed);
        selectLibraryItem({ kind: creation.kind, id }, false);
        pendingCreation.set(null);
    }
</script>

<Dialog.Root
    open={$pendingCreation !== null}
    onOpenChange={(open) => {
        if (!open) {
            pendingCreation.set(null);
        }
    }}
>
    <Dialog.Content class="sm:max-w-sm">
        <Dialog.Header>
            <Dialog.Title>{title}</Dialog.Title>
        </Dialog.Header>
        <Label class="flex flex-col items-start gap-1.5">
            {i18n._('library.name_label')}
            <Input
                bind:value={name}
                autofocus
                onkeydown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') confirm();
                }}
            />
        </Label>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => pendingCreation.set(null)}>
                {i18n._('library.cancel')}
            </Button>
            <Button disabled={!valid} onclick={confirm}>
                {i18n._('library.create')}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
