<script lang="ts">
    import { CircleQuestionMark } from '@lucide/svelte';
    import type { Snippet } from 'svelte';

    /**
     * Inline help box shown in tool panels. The `link` prop is accepted but
     * currently unused: the bundled documentation site was removed, so there
     * is no target to link to. It is kept so callers stay unchanged until we
     * publish our own documentation and can point the links there again.
     */
    let {
        link,
        class: className = '',
        children,
    }: {
        link?: string;
        class?: string;
        children: Snippet;
    } = $props();
    void link;
</script>

<div class="text-[13px] bg-secondary rounded border flex flex-row items-center p-2 {className}">
    <CircleQuestionMark size="16" class="w-4 mr-2 shrink-0 grow-0" />
    <div>
        {@render children()}
    </div>
</div>
