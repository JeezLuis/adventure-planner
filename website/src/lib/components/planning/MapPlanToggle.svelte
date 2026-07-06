<script lang="ts">
    import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
    import { Map, ClipboardList } from '@lucide/svelte';
    import { planningMode } from '$lib/logic/planning';
    import { i18n } from '$lib/i18n.svelte';

    // Segmented Map | Plan control anchored over the map. Switching to "Plan"
    // reveals the planning view for the selected adventure; "Map" returns.
    let value = $derived($planningMode ? 'plan' : 'map');

    function onValueChange(next: string | undefined) {
        // Ignore deselection (clicking the active segment); keep the current mode.
        if (next === 'plan') planningMode.set(true);
        else if (next === 'map') planningMode.set(false);
    }
</script>

<ToggleGroup.Root
    type="single"
    size="sm"
    {value}
    {onValueChange}
    class="bg-background rounded-md shadow-md border p-0.5 gap-0.5"
>
    <ToggleGroup.Item value="map" class="flex flex-row items-center gap-1.5 px-2">
        <Map size="15" />
        {i18n._('planning.map')}
    </ToggleGroup.Item>
    <ToggleGroup.Item value="plan" class="flex flex-row items-center gap-1.5 px-2">
        <ClipboardList size="15" />
        {i18n._('planning.plan')}
    </ToggleGroup.Item>
</ToggleGroup.Root>
