<script lang="ts">
    import type { NoteBlock } from '$lib/logic/plan-doc';
    import { renderMarkdown } from '../markdown';
    import { Textarea } from '$lib/components/ui/textarea';
    import { i18n } from '$lib/i18n.svelte';

    let { block, oncommit }: { block: NoteBlock; oncommit: () => void } = $props();

    let editing = $state(false);
    let ref = $state<HTMLTextAreaElement | null>(null);
    let html = $derived(renderMarkdown(block.markdown));

    // Focus the textarea as soon as the user switches this note into edit mode.
    $effect(() => {
        if (editing && ref) ref.focus();
    });

    function stopEditing() {
        editing = false;
        oncommit();
    }
</script>

{#if editing}
    <Textarea
        bind:ref
        value={block.markdown}
        oninput={(event) => (block.markdown = event.currentTarget.value)}
        onblur={stopEditing}
        rows={5}
        placeholder={i18n._('planning.note_placeholder')}
        class="w-full resize-y font-mono text-sm"
    />
{:else}
    <button
        type="button"
        class="w-full text-left cursor-text"
        onclick={() => (editing = true)}
        aria-label={i18n._('planning.edit_note')}
    >
        {#if html.length > 0}
            <div class="planning-prose">{@html html}</div>
        {:else}
            <span class="text-sm text-muted-foreground italic">
                {i18n._('planning.note_placeholder')}
            </span>
        {/if}
    </button>
{/if}

<style lang="postcss">
    @reference "../../../../app.css";

    .planning-prose :global(h1) {
        @apply text-lg font-semibold mt-1 mb-1;
    }
    .planning-prose :global(h2) {
        @apply text-base font-semibold mt-1 mb-1;
    }
    .planning-prose :global(h3),
    .planning-prose :global(h4) {
        @apply text-sm font-semibold mt-1 mb-0.5;
    }
    .planning-prose :global(p) {
        @apply text-sm my-1 leading-relaxed;
    }
    .planning-prose :global(ul) {
        @apply list-disc pl-5 my-1 text-sm;
    }
    .planning-prose :global(ol) {
        @apply list-decimal pl-5 my-1 text-sm;
    }
    .planning-prose :global(a) {
        @apply text-primary underline;
    }
    .planning-prose :global(code) {
        @apply bg-muted rounded px-1 py-0.5 text-xs font-mono;
    }
    .planning-prose :global(pre) {
        @apply bg-muted rounded p-2 my-1 text-xs overflow-x-auto;
    }
    .planning-prose :global(blockquote) {
        @apply border-l-2 border-muted-foreground/40 pl-3 my-1 text-sm text-muted-foreground;
    }
    .planning-prose :global(hr) {
        @apply my-2 border-muted-foreground/20;
    }
</style>
