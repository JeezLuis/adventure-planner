<script lang="ts">
    import ToolbarItem from '$lib/components/toolbar/ToolbarItem.svelte';
    import ToolbarActionItem from '$lib/components/toolbar/ToolbarActionItem.svelte';
    import ToolbarItemMenu from '$lib/components/toolbar/ToolbarItemMenu.svelte';
    import { ADVANCED_TOOLS, currentTool, Tool } from '$lib/components/toolbar/tools';
    import { Button } from '$lib/components/ui/button';
    import { Separator } from '$lib/components/ui/separator';
    import * as Tooltip from '$lib/components/ui/tooltip/index.js';
    import {
        ArrowRightLeft,
        Group,
        CalendarClock,
        ChevronDown,
        ChevronUp,
        Link,
        Pencil,
        SquareDashedMousePointer,
        Ungroup,
        MapPin,
        Funnel,
        Scissors,
        MountainSnow,
    } from '@lucide/svelte';
    import { i18n } from '$lib/i18n.svelte';
    import { ListRootItem } from '$lib/components/file-list/file-list';
    import { fileActions } from '$lib/logic/file-actions';
    import { selection } from '$lib/logic/selection';
    import { settings } from '$lib/logic/settings';

    /**
     * Floating tool bar hovering over the left edge of the map, vertically
     * centered: a vertical pill of editing tools with the active tool's panel
     * opening to its right. Only rendered while an adventure is selected (see
     * the app page), since editing always happens inside one.
     *
     * Only the essential tools (routing, waypoint, scissors) are visible by
     * default; the advanced tools are revealed by the chevron toggle at the
     * bottom of the pill, and the choice persists across sessions.
     */
    let { class: className = '' }: { class?: string } = $props();

    const { showAdvancedTools } = settings;

    let canReverse = $derived($selection.hasAnyChildren(new ListRootItem(), true, ['waypoints']));

    function toggleAdvancedTools() {
        // Hiding the section while one of its tools is active would leave the
        // tool's panel open next to a toolbar without its button, so close it.
        if ($showAdvancedTools && $currentTool !== null && ADVANCED_TOOLS.includes($currentTool)) {
            $currentTool = null;
        }
        $showAdvancedTools = !$showAdvancedTools;
    }
</script>

<div class="flex flex-row items-center max-h-full">
    <div
        class="h-fit flex flex-col p-1 gap-1.5 bg-background rounded-md pointer-events-auto shadow-md {className}"
    >
        <ToolbarItem itemTool={Tool.ROUTING} label={i18n._('toolbar.routing.tooltip')}>
            <Pencil size="18" class="size-4.5" />
        </ToolbarItem>
        <ToolbarItem itemTool={Tool.WAYPOINT} label={i18n._('toolbar.waypoint.tooltip')}>
            <MapPin size="18" class="size-4.5" />
        </ToolbarItem>
        <ToolbarItem itemTool={Tool.SCISSORS} label={i18n._('toolbar.scissors.tooltip')}>
            <Scissors size="18" class="size-4.5" />
        </ToolbarItem>
        <ToolbarItem itemTool={Tool.JOIN} label={i18n._('toolbar.join.tooltip')}>
            <Link size="18" class="size-4.5" />
        </ToolbarItem>
        <ToolbarActionItem
            label={i18n._('toolbar.reverse.tooltip')}
            disabled={!canReverse}
            onclick={fileActions.reverseSelection}
        >
            <ArrowRightLeft size="18" class="size-4.5" />
        </ToolbarActionItem>
        {#if $showAdvancedTools}
            <Separator />
            <ToolbarItem itemTool={Tool.TIME} label={i18n._('toolbar.time.tooltip')}>
                <CalendarClock size="18" class="size-4.5" />
            </ToolbarItem>
            <ToolbarItem itemTool={Tool.MERGE} label={i18n._('toolbar.merge.tooltip')}>
                <Group size="18" class="size-4.5" />
            </ToolbarItem>
            <ToolbarItem itemTool={Tool.EXTRACT} label={i18n._('toolbar.extract.tooltip')}>
                <Ungroup size="18" class="size-4.5" />
            </ToolbarItem>
            <ToolbarItem itemTool={Tool.ELEVATION} label={i18n._('toolbar.elevation.button')}>
                <MountainSnow size="18" class="size-4.5" />
            </ToolbarItem>
            <ToolbarItem itemTool={Tool.REDUCE} label={i18n._('toolbar.reduce.tooltip')}>
                <Funnel size="18" class="size-4.5" />
            </ToolbarItem>
            <ToolbarItem itemTool={Tool.CLEAN} label={i18n._('toolbar.clean.tooltip')}>
                <SquareDashedMousePointer size="18" class="size-4.5" />
            </ToolbarItem>
        {/if}
        <Tooltip.Provider>
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props: triggerProps })}
                        <Button
                            {...triggerProps}
                            variant="ghost"
                            class="size-[24px]"
                            onclick={toggleAdvancedTools}
                            aria-expanded={$showAdvancedTools}
                            aria-label={$showAdvancedTools
                                ? i18n._('toolbar.advanced.hide')
                                : i18n._('toolbar.advanced.show')}
                        >
                            {#if $showAdvancedTools}
                                <ChevronUp size="18" class="size-4.5" />
                            {:else}
                                <ChevronDown size="18" class="size-4.5" />
                            {/if}
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">
                    <span>
                        {$showAdvancedTools
                            ? i18n._('toolbar.advanced.hide')
                            : i18n._('toolbar.advanced.show')}
                    </span>
                </Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    </div>
    <ToolbarItemMenu class={className} />
</div>
