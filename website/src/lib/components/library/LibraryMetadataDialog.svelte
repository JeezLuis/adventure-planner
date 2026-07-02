<script lang="ts">
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Select from '$lib/components/ui/select';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Textarea } from '$lib/components/ui/textarea';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import {
        adventures,
        expeditions,
        pendingMetadataEdit,
        updateAdventure,
        updateExpedition,
        type TrackNumbering,
    } from '$lib/library/library';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Edits the metadata of an adventure or expedition (see
     * {@link pendingMetadataEdit}): name and description for both, plus the
     * track numbering for adventures. The 'date' numbering needs the start
     * date of the trip and can optionally show the year in the tags.
     */
    let name = $state('');
    let description = $state('');
    let numbering = $state<TrackNumbering>('none');
    let startDate = $state('');
    let showYear = $state(false);

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
                numbering = ('numbering' in item ? item.numbering : undefined) ?? 'none';
                startDate = ('startDate' in item ? item.startDate : undefined) ?? '';
                showYear = ('showYear' in item ? item.showYear : undefined) ?? false;
            }
        }
    });

    let valid = $derived(
        name.trim().length > 0 &&
            (!isAdventure || numbering !== 'date' || /^\d{4}-\d{2}-\d{2}$/.test(startDate))
    );

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
            await updateAdventure(editing.id, {
                ...common,
                numbering,
                startDate: numbering === 'date' ? startDate : undefined,
                showYear: numbering === 'date' ? showYear : undefined,
            });
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
        {#if isAdventure}
            <Label class="flex flex-col items-start gap-1.5">
                {i18n._('library.numbering')}
                <Select.Root type="single" bind:value={numbering}>
                    <Select.Trigger class="w-full" size="sm">
                        {i18n._(`library.numbering_${numbering}`)}
                    </Select.Trigger>
                    <Select.Content>
                        <Select.Item value="none">{i18n._('library.numbering_none')}</Select.Item>
                        <Select.Item value="numbers">
                            {i18n._('library.numbering_numbers')}
                        </Select.Item>
                        <Select.Item value="date">{i18n._('library.numbering_date')}</Select.Item>
                    </Select.Content>
                </Select.Root>
            </Label>
            <p class="text-xs text-muted-foreground">
                {i18n._(
                    numbering === 'date' ? 'library.numbering_date_help' : 'library.numbering_help'
                )}
            </p>
            {#if numbering === 'date'}
                <Label class="flex flex-col items-start gap-1.5">
                    {i18n._('library.start_date')}
                    <Input type="date" bind:value={startDate} class="w-fit" />
                </Label>
                <Label class="flex flex-row items-center gap-1.5">
                    <Checkbox bind:checked={showYear} />
                    {i18n._('library.show_year')}
                </Label>
            {/if}
        {/if}
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
