<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label/index.js';
    import { Slider } from '$lib/components/ui/slider';
    import * as Popover from '$lib/components/ui/popover';
    import { Save } from '@lucide/svelte';
    import {
        ListFileItem,
        ListTrackItem,
        type ListItem,
    } from '$lib/components/file-list/file-list';
    import { editStyle } from '$lib/components/file-list/style/utils.svelte';
    import { i18n } from '$lib/i18n.svelte';
    import type { LineStyleExtension } from 'gpx';
    import { settings } from '$lib/logic/settings';
    import { selection } from '$lib/logic/selection';
    import { fileStateCollection } from '$lib/logic/file-state';
    import { gpxLayers } from '$lib/components/map/gpx-layer/gpx-layers';
    import { trackColorPalette } from '$lib/components/map/gpx-layer/gpx-layer';
    import { untrack } from 'svelte';
    import { fileActions } from '$lib/logic/file-actions';

    let {
        item,
        open = $bindable(),
    }: {
        item: ListItem;
        open: boolean;
    } = $props();

    const { defaultOpacity, defaultWidth } = settings;

    /** Quick-pick swatches: the first 8 palette colors, shown as a 2x4 grid. */
    const swatchColors = trackColorPalette.slice(0, 8);

    let color: string = $state('');
    let opacity: number = $state(0);
    let width: number = $state(0);
    let colorChanged = $state(false);
    let opacityChanged = $state(false);
    let widthChanged = $state(false);

    function setStyleInputs() {
        opacity = $defaultOpacity;
        width = $defaultWidth;

        $selection.forEach((item) => {
            if (item instanceof ListFileItem) {
                let file = fileStateCollection.getFile(item.getFileId());
                let layer = gpxLayers.getLayer(item.getFileId());
                if (file && layer) {
                    let style = file.getStyle();
                    color = layer.layerColor;
                    if (style.opacity.length > 0) {
                        opacity = style.opacity[0];
                    }
                    if (style.width.length > 0) {
                        width = style.width[0];
                    }
                }
            } else if (item instanceof ListTrackItem) {
                let file = fileStateCollection.getFile(item.getFileId());
                let layer = gpxLayers.getLayer(item.getFileId());
                if (file && layer) {
                    color = layer.layerColor;
                    let track = file.trk[item.getTrackIndex()];
                    let style = track.getStyle();
                    if (style) {
                        if (style['gpx_style:color']) {
                            color = style['gpx_style:color'];
                        }
                        if (style['gpx_style:opacity']) {
                            opacity = style['gpx_style:opacity'];
                        }
                        if (style['gpx_style:width']) {
                            width = style['gpx_style:width'];
                        }
                    }
                }
            }
        });

        colorChanged = false;
        opacityChanged = false;
        widthChanged = false;
    }

    $effect(() => {
        if ($selection && open) {
            untrack(() => setStyleInputs());
        }
    });

    $effect(() => {
        if (!open) {
            editStyle.current = false;
        }
    });

    function applyStyle() {
        let style: LineStyleExtension = {};
        if (colorChanged) {
            style['gpx_style:color'] = color;
        }
        if (opacityChanged) {
            style['gpx_style:opacity'] = opacity;
        }
        if (widthChanged) {
            style['gpx_style:width'] = width;
        }
        fileActions.setStyleToSelection(style);

        if (item instanceof ListFileItem && $selection.size === fileStateCollection.size) {
            if (style['gpx_style:opacity']) {
                $defaultOpacity = style['gpx_style:opacity'];
            }
            if (style['gpx_style:width']) {
                $defaultWidth = style['gpx_style:width'];
            }
        }

        open = false;
    }

    /** One-click recolor: apply a swatch color right away and close. */
    function applySwatch(swatch: string) {
        color = swatch;
        colorChanged = true;
        applyStyle();
    }
</script>

<Popover.Root bind:open>
    <Popover.Trigger class="-mx-1" />
    <Popover.Content side="top" sideOffset={22} alignOffset={30} class="flex flex-col gap-3">
        <Label class="flex flex-row gap-2 items-center justify-between">
            {i18n._('menu.style.color')}
            <Input
                bind:value={color}
                type="color"
                class="p-0 h-6 w-40"
                onchange={() => (colorChanged = true)}
            />
        </Label>
        <div class="grid grid-cols-4 gap-1.5 w-40 ml-auto">
            {#each swatchColors as swatch (swatch)}
                <button
                    class="h-6 rounded border border-input hover:scale-110 transition-transform {color ===
                    swatch
                        ? 'ring-2 ring-ring'
                        : ''}"
                    style="background-color: {swatch}"
                    aria-label={swatch}
                    onclick={() => applySwatch(swatch)}
                ></button>
            {/each}
        </div>
        <Label class="flex flex-row gap-2 items-center justify-between">
            {i18n._('menu.style.opacity')}
            <div class="w-40 p-2">
                <Slider
                    bind:value={opacity}
                    min={0.3}
                    max={1}
                    step={0.1}
                    onValueChange={() => (opacityChanged = true)}
                    type="single"
                />
            </div>
        </Label>
        <Label class="flex flex-row gap-2 items-center justify-between">
            {i18n._('menu.style.width')}
            <div class="w-40 p-2">
                <Slider
                    bind:value={width}
                    id="width"
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={() => (widthChanged = true)}
                    type="single"
                />
            </div>
        </Label>
        <Button
            variant="outline"
            disabled={!colorChanged && !opacityChanged && !widthChanged}
            onclick={applyStyle}
        >
            <Save size="16" />
            {i18n._('menu.metadata.save')}
        </Button>
    </Popover.Content>
</Popover.Root>
