<script lang="ts">
    import { streetViewEnabled } from '$lib/components/map/street-view-control/utils';
    import { map } from '$lib/components/map/map';
    import CustomControl from '$lib/components/map/custom-control/CustomControl.svelte';
    import { PersonStanding } from '@lucide/svelte';
    import { GoogleRedirect } from './google';
    import { i18n } from '$lib/i18n.svelte';
    import { onMount } from 'svelte';
    import ButtonWithTooltip from '$lib/components/ButtonWithTooltip.svelte';

    /**
     * Street view toggle. When enabled, clicking the map opens the location
     * in Google Street View (plain URL redirect, no API key involved).
     */
    let googleRedirect: GoogleRedirect | null = $state(null);

    onMount(() => {
        map.onLoad((map_: maplibregl.Map) => {
            googleRedirect = new GoogleRedirect(map_);
        });
    });

    $effect(() => {
        if ($streetViewEnabled) {
            googleRedirect?.add();
        } else {
            googleRedirect?.remove();
        }
    });
</script>

<CustomControl class="w-[29px] h-[29px] shrink-0">
    <ButtonWithTooltip
        variant="ghost"
        class="w-full h-full border-none rounded-sm"
        side="left"
        label={i18n._('menu.toggle_street_view')}
        onclick={() => {
            $streetViewEnabled = !$streetViewEnabled;
        }}
    >
        <PersonStanding
            size="22"
            class="size-5.5"
            color={$streetViewEnabled ? '#33b5e5' : 'currentColor'}
        />
    </ButtonWithTooltip>
</CustomControl>
