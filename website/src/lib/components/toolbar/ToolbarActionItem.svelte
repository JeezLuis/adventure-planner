<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import * as Tooltip from '$lib/components/ui/tooltip/index.js';
    import type { Snippet } from 'svelte';

    /**
     * Toolbar button that runs an action immediately instead of opening a
     * tool panel like ToolbarItem does.
     */
    let {
        label,
        onclick,
        disabled = false,
        children,
    }: {
        label: string;
        onclick: () => void;
        disabled?: boolean;
        children: Snippet;
    } = $props();
</script>

<Tooltip.Provider>
    <Tooltip.Root>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <Button
                    {...props}
                    variant="ghost"
                    class="size-[24px]"
                    {disabled}
                    {onclick}
                    aria-label={label}
                >
                    {@render children()}
                </Button>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">
            <span>{label}</span>
        </Tooltip.Content>
    </Tooltip.Root>
</Tooltip.Provider>
