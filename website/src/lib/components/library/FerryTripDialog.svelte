<script lang="ts">
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Select from '$lib/components/ui/select';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Ship, MapPin, Loader2, X } from '@lucide/svelte';
    import { get } from 'svelte/store';
    import type { Coordinates } from 'gpx';
    import { pendingFerryCreation } from '$lib/library/library';
    import { createFerryTrip } from '$lib/logic/file-actions';
    import { searchPorts, reverseGeocode, shortPlaceName, type FerryPort } from '$lib/logic/ferry';
    import { map } from '$lib/components/map/map';
    import { i18n } from '$lib/i18n.svelte';

    /**
     * Adds a ferry trip (a sea crossing) to an adventure (see
     * {@link pendingFerryCreation}). The two ports are chosen either by name
     * (Nominatim search, same backend as the map geocoder) or by clicking the
     * map; the crossing is scheduled with a departure date and time, an arrival
     * time, and a whole-day arrival offset for overnight/multi-day crossings.
     * On confirm it delegates to {@link createFerryTrip}, which draws the
     * maritime route and stores the day offset as the placement's buffer days.
     */
    const DAY_OFFSETS = [0, 1, 2, 3];

    let adventureId = $state<string | null>(null);
    let fromPort = $state<FerryPort | null>(null);
    let toPort = $state<FerryPort | null>(null);
    let fromQuery = $state('');
    let toQuery = $state('');
    let fromResults = $state<FerryPort[]>([]);
    let toResults = $state<FerryPort[]>([]);
    let departureDate = $state('');
    let departureTime = $state('08:00');
    let arrivalTime = $state('18:00');
    let dayOffset = $state('0');
    let submitting = $state(false);
    /** Non-null while the user is clicking the map to place a port (the dialog hides meanwhile). */
    let picking = $state<null | 'from' | 'to'>(null);

    let fromTimer: ReturnType<typeof setTimeout> | undefined;
    let toTimer: ReturnType<typeof setTimeout> | undefined;
    let mapClickHandler: ((e: { lngLat: { lat: number; lng: number } }) => void) | undefined;

    function todayISO(): string {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    // Reset the form each time the dialog opens for a different adventure.
    $effect(() => {
        const pending = $pendingFerryCreation;
        if ((pending?.adventureId ?? null) !== adventureId) {
            adventureId = pending?.adventureId ?? null;
            if (pending !== null) {
                fromPort = null;
                toPort = null;
                fromQuery = '';
                toQuery = '';
                fromResults = [];
                toResults = [];
                departureDate = todayISO();
                departureTime = '08:00';
                arrivalTime = '18:00';
                dayOffset = '0';
                submitting = false;
                picking = null;
            }
        }
    });

    /** Builds a local Date from an ISO date, a HH:MM[:SS] time, and a whole-day offset. */
    function combineLocal(dateStr: string, timeStr: string, addDays = 0): Date {
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
        return new Date(year, month - 1, day + addDays, hours, minutes, seconds);
    }

    let departure = $derived(combineLocal(departureDate, departureTime));
    let arrival = $derived(combineLocal(departureDate, arrivalTime, Number(dayOffset)));
    let samePort = $derived(
        fromPort !== null &&
            toPort !== null &&
            fromPort.coordinates.lat === toPort.coordinates.lat &&
            fromPort.coordinates.lon === toPort.coordinates.lon
    );
    let arrivalBeforeDeparture = $derived(
        fromPort !== null && toPort !== null && arrival.getTime() <= departure.getTime()
    );
    let valid = $derived(
        fromPort !== null &&
            toPort !== null &&
            !samePort &&
            /^\d{4}-\d{2}-\d{2}$/.test(departureDate) &&
            /^\d{2}:\d{2}(:\d{2})?$/.test(departureTime) &&
            /^\d{2}:\d{2}(:\d{2})?$/.test(arrivalTime) &&
            !arrivalBeforeDeparture
    );

    function searchInto(query: string, assign: (results: FerryPort[]) => void) {
        if (query.trim().length < 2) {
            assign([]);
            return;
        }
        searchPorts(query, i18n.lang).then(assign);
    }

    function onFromInput() {
        fromPort = null;
        clearTimeout(fromTimer);
        const query = fromQuery;
        fromTimer = setTimeout(() => searchInto(query, (r) => (fromResults = r)), 450);
    }

    function onToInput() {
        toPort = null;
        clearTimeout(toTimer);
        const query = toQuery;
        toTimer = setTimeout(() => searchInto(query, (r) => (toResults = r)), 450);
    }

    function choose(which: 'from' | 'to', port: FerryPort) {
        if (which === 'from') {
            fromPort = port;
            fromQuery = shortPlaceName(port.name);
            fromResults = [];
        } else {
            toPort = port;
            toQuery = shortPlaceName(port.name);
            toResults = [];
        }
    }

    function pickOnMap(which: 'from' | 'to') {
        const mapInstance = get(map);
        if (!mapInstance) {
            return;
        }
        picking = which; // hides the dialog so the map is clickable
        const canvas = mapInstance.getCanvas();
        canvas.style.cursor = 'crosshair';
        mapClickHandler = async (e) => {
            canvas.style.cursor = '';
            mapClickHandler = undefined;
            const coordinates: Coordinates = { lat: e.lngLat.lat, lon: e.lngLat.lng };
            const name = await reverseGeocode(coordinates, i18n.lang);
            choose(which, { name, coordinates });
            picking = null; // reopens the dialog
        };
        mapInstance.once('click', mapClickHandler);
    }

    function cancelPicking() {
        const mapInstance = get(map);
        if (mapInstance && mapClickHandler) {
            mapInstance.off('click', mapClickHandler);
            mapInstance.getCanvas().style.cursor = '';
        }
        mapClickHandler = undefined;
        picking = null;
    }

    function close() {
        cancelPicking();
        pendingFerryCreation.set(null);
    }

    async function confirm() {
        if (!valid || fromPort === null || toPort === null || adventureId === null) {
            return;
        }
        submitting = true;
        try {
            await createFerryTrip({
                adventureId,
                from: fromPort.coordinates,
                to: toPort.coordinates,
                fromName: fromPort.name,
                toName: toPort.name,
                departure,
                arrival,
                dayOffset: Number(dayOffset),
            });
        } finally {
            submitting = false;
            pendingFerryCreation.set(null);
        }
    }
</script>

{#if picking !== null}
    <!-- Map-picking banner: the dialog is hidden so the map underneath is clickable. -->
    <div
        class="fixed left-1/2 top-3 z-50 flex -translate-x-1/2 flex-row items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-md"
    >
        <MapPin size="16" />
        {i18n._(picking === 'from' ? 'library.ferry_picking_from' : 'library.ferry_picking_to')}
        <Button variant="ghost" size="sm" class="h-6 gap-1 px-1.5" onclick={cancelPicking}>
            <X size="14" />
            {i18n._('library.cancel')}
        </Button>
    </div>
{/if}

<Dialog.Root
    open={$pendingFerryCreation !== null && picking === null}
    onOpenChange={(open) => {
        if (!open && picking === null) {
            close();
        }
    }}
>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title class="flex flex-row items-center gap-2">
                <Ship size="18" />
                {i18n._('library.ferry_title')}
            </Dialog.Title>
        </Dialog.Header>

        <!-- Ports -->
        {#each [{ which: 'from', label: 'library.ferry_departure_port', query: fromQuery, results: fromResults, port: fromPort }, { which: 'to', label: 'library.ferry_arrival_port', query: toQuery, results: toResults, port: toPort }] as field (field.which)}
            <Label class="flex flex-col items-start gap-1.5">
                {i18n._(field.label)}
                <div class="flex w-full flex-row gap-1.5">
                    <Input
                        value={field.which === 'from' ? fromQuery : toQuery}
                        placeholder={i18n._('library.ferry_search_placeholder')}
                        oninput={(e: Event) => {
                            const v = (e.currentTarget as HTMLInputElement).value;
                            if (field.which === 'from') {
                                fromQuery = v;
                                onFromInput();
                            } else {
                                toQuery = v;
                                onToInput();
                            }
                        }}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        class="shrink-0 gap-1"
                        onclick={() => pickOnMap(field.which as 'from' | 'to')}
                    >
                        <MapPin size="15" />
                        {i18n._('library.ferry_pick_on_map')}
                    </Button>
                </div>
                {#if field.results.length > 0 && field.port === null}
                    <div class="flex w-full flex-col rounded-md border bg-popover">
                        {#each field.results as result (result.name)}
                            <button
                                type="button"
                                class="px-2 py-1 text-left text-xs hover:bg-accent"
                                onclick={() => choose(field.which as 'from' | 'to', result)}
                            >
                                {result.name}
                            </button>
                        {/each}
                    </div>
                {/if}
            </Label>
        {/each}

        <!-- Departure date and time -->
        <div class="flex flex-row gap-1.5">
            <Label class="flex grow flex-col items-start gap-1.5">
                {i18n._('library.ferry_departure_date')}
                <Input type="date" bind:value={departureDate} class="w-full" />
            </Label>
            <Label class="flex flex-col items-start gap-1.5">
                {i18n._('library.ferry_departure_time')}
                <Input type="time" step={60} bind:value={departureTime} class="w-fit" />
            </Label>
        </div>

        <!-- Arrival day offset and time -->
        <div class="flex flex-row gap-1.5">
            <Label class="flex grow flex-col items-start gap-1.5">
                {i18n._('library.ferry_arrival_day')}
                <Select.Root type="single" bind:value={dayOffset}>
                    <Select.Trigger class="w-full" size="sm">
                        {i18n._(`library.ferry_day_${dayOffset}`)}
                    </Select.Trigger>
                    <Select.Content>
                        {#each DAY_OFFSETS as offset (offset)}
                            <Select.Item value={String(offset)}>
                                {i18n._(`library.ferry_day_${offset}`)}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </Label>
            <Label class="flex flex-col items-start gap-1.5">
                {i18n._('library.ferry_arrival_time')}
                <Input type="time" step={60} bind:value={arrivalTime} class="w-fit" />
            </Label>
        </div>

        {#if samePort}
            <p class="text-xs text-destructive">{i18n._('library.ferry_error_same_port')}</p>
        {:else if arrivalBeforeDeparture}
            <p class="text-xs text-destructive">{i18n._('library.ferry_error_arrival_before')}</p>
        {/if}

        <Dialog.Footer>
            <Button variant="outline" onclick={close} disabled={submitting}>
                {i18n._('library.cancel')}
            </Button>
            <Button disabled={!valid || submitting} onclick={confirm}>
                {#if submitting}
                    <Loader2 size="15" class="animate-spin" />
                    {i18n._('library.ferry_computing')}
                {:else}
                    {i18n._('library.ferry_add')}
                {/if}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
