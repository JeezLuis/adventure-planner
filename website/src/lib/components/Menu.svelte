<script lang="ts">
    import * as Menubar from '$lib/components/ui/menubar/index.js';
    import { Button } from '$lib/components/ui/button';
    import ButtonWithTooltip from '$lib/components/ButtonWithTooltip.svelte';
    import { toast } from 'svelte-sonner';
    import Logo from '$lib/components/Logo.svelte';
    import Shortcut from '$lib/components/Shortcut.svelte';
    import {
        Plus,
        Download,
        Undo2,
        Redo2,
        Trash2,
        Map,
        Layers2,
        Box,
        Milestone,
        Coins,
        Ruler,
        Zap,
        Thermometer,
        Sun,
        Moon,
        ListTree,
        Languages,
        Settings,
        Info,
        File,
        View,
        FilePen,
        Eye,
        EyeOff,
        ClipboardCopy,
        Scissors,
        ClipboardPaste,
        PaintBucket,
        FileStack,
        ChartArea,
        CloudUpload,
        Maximize,
        Maximize2,
        Minimize2,
        FolderInput,
        FolderOutput,
        Ship,
    } from '@lucide/svelte';
    import { map } from '$lib/components/map/map';
    import { editMetadata } from '$lib/components/file-list/metadata/utils.svelte';
    import { editStyle } from '$lib/components/file-list/style/utils.svelte';
    import { exportState, ExportState, exportAdventure } from '$lib/components/export/utils.svelte';
    import { anySelectedLayer } from '$lib/components/map/layer-control/utils';
    import { defaultOverlays } from '$lib/assets/layers';
    import LayerControlSettings from '$lib/components/map/layer-control/LayerControlSettings.svelte';
    import { ListFileItem, ListTrackItem } from '$lib/components/file-list/file-list';
    import Export from '$lib/components/export/Export.svelte';
    import { mode, setMode } from 'mode-watcher';
    import { i18n } from '$lib/i18n.svelte';
    import { languages } from '$lib/languages';
    import { getURLForLanguage } from '$lib/utils';
    import { settings } from '$lib/logic/settings';
    import {
        createFile,
        fileActions,
        pasteSelection,
        triggerFileInput,
        importAdventures,
    } from '$lib/logic/file-actions';
    import {
        pendingFerryCreation,
        selectedAdventureId,
        selectedAdventureIsAdvanced,
        targetExpeditionId,
    } from '$lib/library/library';
    import { fileStateCollection } from '$lib/logic/file-state';
    import { fileActionManager } from '$lib/logic/file-action-manager';
    import { copied, selection } from '$lib/logic/selection';
    import { allHidden } from '$lib/logic/hidden';
    import { boundsManager } from '$lib/logic/bounds';
    import { tick, onMount } from 'svelte';
    import { allowedPastes } from '$lib/components/file-list/sortable-file-list';

    const {
        distanceUnits,
        velocityUnits,
        temperatureUnits,
        elevationProfile,
        currentBasemap,
        previousBasemap,
        currentOverlays,
        previousOverlays,
        distanceMarkers,
        directionMarkers,
        routing,
    } = settings;

    const canUndo = fileActionManager.canUndo;
    const canRedo = fileActionManager.canRedo;

    function switchBasemaps() {
        [$currentBasemap, $previousBasemap] = [$previousBasemap, $currentBasemap];
    }

    function toggleOverlays() {
        if ($currentOverlays && anySelectedLayer($currentOverlays)) {
            [$currentOverlays, $previousOverlays] = [defaultOverlays, $currentOverlays];
        } else {
            [$currentOverlays, $previousOverlays] = [$previousOverlays, defaultOverlays];
        }
    }

    let layerSettingsOpen = $state(false);
    let fullscreen = $state(false);

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }

    onMount(() => {
        const handler = () => {
            fullscreen = document.fullscreenElement !== null;
        };
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    });
</script>

<!-- Menu bar integrated at the top of the library panel. -->
<div class="w-full flex flex-row items-center p-1 border-b bg-background">
    <div class="w-full flex flex-row items-center">
        <a href={getURLForLanguage(i18n.lang, '/app')} class="shrink-0">
            <Logo class="h-5 mt-0.5 mx-2" iconOnly={true} width="18" />
        </a>
        <Menubar.Root class="border-none shadow-none h-fit p-0">
            <Menubar.Menu>
                <Menubar.Trigger aria-label={i18n._('gpx.file')}>
                    <File size="18" class="md:hidden" />
                    <span class="hidden md:block">{i18n._('gpx.file')}</span>
                </Menubar.Trigger>
                <Menubar.Content class="border-none">
                    <Menubar.Item onclick={createFile} disabled={$selectedAdventureId === null}>
                        <Plus size="16" />
                        {i18n._('menu.new')}
                        <Shortcut key="+" ctrl={true} />
                    </Menubar.Item>
                    {#if $selectedAdventureIsAdvanced}
                        <!-- Ferry legs are advanced-mode only (see LibraryActions). -->
                        <Menubar.Item
                            onclick={() =>
                                $selectedAdventureId &&
                                pendingFerryCreation.set({ adventureId: $selectedAdventureId })}
                        >
                            <Ship size="16" />
                            {i18n._('menu.add_ferry')}
                        </Menubar.Item>
                    {/if}
                    <Menubar.Item
                        onclick={() =>
                            triggerFileInput((files) =>
                                importAdventures(files, $targetExpeditionId)
                            )}
                    >
                        <FolderInput size="16" />
                        {i18n._('menu.import_adventure')}
                    </Menubar.Item>
                    <Menubar.Separator />
                    <Menubar.Item
                        onclick={() => tick().then(fileActions.deleteSelectedFiles)}
                        disabled={$selection.size == 0}
                    >
                        <Trash2 size="16" />
                        {i18n._('menu.delete')}
                        <Shortcut key="⌫" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Separator />
                    <Menubar.Item
                        onclick={() => (exportState.current = ExportState.SELECTION)}
                        disabled={$selection.size == 0}
                    >
                        <Download size="16" />
                        {i18n._('menu.export')}
                        <Shortcut key="S" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Item
                        onclick={() =>
                            $selectedAdventureId && exportAdventure($selectedAdventureId)}
                        disabled={$selectedAdventureId === null}
                    >
                        <FolderOutput size="16" />
                        {i18n._('menu.export_adventure')}
                    </Menubar.Item>
                </Menubar.Content>
            </Menubar.Menu>
            <Menubar.Menu>
                <Menubar.Trigger aria-label={i18n._('menu.edit')}>
                    <FilePen size="18" class="md:hidden" />
                    <span class="hidden md:block">{i18n._('menu.edit')}</span>
                </Menubar.Trigger>
                <Menubar.Content class="border-none">
                    <Menubar.Item onclick={() => fileActionManager.undo()} disabled={!$canUndo}>
                        <Undo2 size="16" />
                        {i18n._('menu.undo')}
                        <Shortcut key="Z" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Item onclick={() => fileActionManager.redo()} disabled={!$canRedo}>
                        <Redo2 size="16" />
                        {i18n._('menu.redo')}
                        <Shortcut key="Z" ctrl={true} shift={true} />
                    </Menubar.Item>
                    <Menubar.Separator />
                    <Menubar.Item
                        disabled={$selection.size !== 1 ||
                            !$selection
                                .getSelected()
                                .every(
                                    (item) =>
                                        item instanceof ListFileItem ||
                                        item instanceof ListTrackItem
                                )}
                        onclick={() => (editMetadata.current = true)}
                    >
                        <Info size="16" />
                        {i18n._('menu.metadata.button')}
                        <Shortcut key="I" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Item
                        disabled={$selection.size === 0 ||
                            !$selection
                                .getSelected()
                                .every(
                                    (item) =>
                                        item instanceof ListFileItem ||
                                        item instanceof ListTrackItem
                                )}
                        onclick={() => (editStyle.current = true)}
                    >
                        <PaintBucket size="16" />
                        {i18n._('menu.style.button')}
                    </Menubar.Item>
                    <Menubar.Item
                        onclick={() => {
                            if ($allHidden) {
                                fileActions.setHiddenToSelection(false);
                            } else {
                                fileActions.setHiddenToSelection(true);
                            }
                        }}
                        disabled={$selection.size == 0}
                    >
                        {#if $allHidden}
                            <Eye size="16" />
                            {i18n._('menu.unhide')}
                        {:else}
                            <EyeOff size="16" />
                            {i18n._('menu.hide')}
                        {/if}
                        <Shortcut key="H" ctrl={true} />
                    </Menubar.Item>
                    {#if $selection.getSelected().some((item) => item instanceof ListFileItem)}
                        <Menubar.Separator />
                        <Menubar.Item
                            onclick={() =>
                                fileActions.addNewTrack($selection.getSelected()[0].getFileId())}
                            disabled={$selection.size !== 1}
                        >
                            <Plus size="16" />
                            {i18n._('menu.new_track')}
                        </Menubar.Item>
                    {:else if $selection
                        .getSelected()
                        .some((item) => item instanceof ListTrackItem)}
                        <Menubar.Separator />
                        <Menubar.Item
                            onclick={() => {
                                let item = $selection.getSelected()[0];
                                fileActions.addNewSegment(item.getFileId(), item.getTrackIndex());
                            }}
                            disabled={$selection.size !== 1}
                        >
                            <Plus size="16" />
                            {i18n._('menu.new_segment')}
                        </Menubar.Item>
                    {/if}
                    <Menubar.Separator />
                    <Menubar.Item
                        onclick={() => selection.selectAll()}
                        disabled={fileStateCollection.size == 0}
                    >
                        <FileStack size="16" />
                        {i18n._('menu.select_all')}
                        <Shortcut key="A" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Item
                        onclick={() => {
                            if ($selection.size > 0) {
                                boundsManager.centerMapOnSelection();
                            }
                        }}
                        disabled={$selection.size == 0}
                    >
                        <Maximize size="16" />
                        {i18n._('menu.center')}
                        <Shortcut key="⏎" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Separator />
                    <Menubar.Item
                        onclick={() => selection.copySelection()}
                        disabled={$selection.size === 0}
                    >
                        <ClipboardCopy size="16" />
                        {i18n._('menu.copy')}
                        <Shortcut key="C" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Item
                        onclick={() => selection.cutSelection()}
                        disabled={$selection.size === 0}
                    >
                        <Scissors size="16" />
                        {i18n._('menu.cut')}
                        <Shortcut key="X" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Item
                        disabled={$copied === undefined ||
                            $copied.length === 0 ||
                            ($selection.size > 0 &&
                                !allowedPastes[$copied[0].level].includes(
                                    $selection.getSelected().pop()!.level
                                ))}
                        onclick={pasteSelection}
                    >
                        <ClipboardPaste size="16" />
                        {i18n._('menu.paste')}
                        <Shortcut key="V" ctrl={true} />
                    </Menubar.Item>
                    <Menubar.Separator />
                    <Menubar.Item
                        onclick={() => tick().then(fileActions.deleteSelection)}
                        disabled={$selection.size == 0}
                    >
                        <Trash2 size="16" />
                        {i18n._('menu.delete')}
                        <Shortcut key="⌫" ctrl={true} />
                    </Menubar.Item>
                </Menubar.Content>
            </Menubar.Menu>
            <Menubar.Menu>
                <Menubar.Trigger aria-label={i18n._('menu.view')}>
                    <View size="18" class="md:hidden" />
                    <span class="hidden md:block">{i18n._('menu.view')}</span>
                </Menubar.Trigger>
                <Menubar.Content class="border-none">
                    <Menubar.CheckboxItem bind:checked={$elevationProfile}>
                        <ChartArea size="16" />
                        {i18n._('menu.elevation_profile')}
                        <Shortcut key="P" ctrl={true} />
                    </Menubar.CheckboxItem>
                    <Menubar.Separator />
                    <Menubar.Item inset onclick={switchBasemaps}>
                        <Map size="16" />{i18n._('menu.switch_basemap')}<Shortcut key="F1" />
                    </Menubar.Item>
                    <Menubar.Item inset onclick={toggleOverlays}>
                        <Layers2 size="16" />{i18n._('menu.toggle_overlays')}<Shortcut key="F2" />
                    </Menubar.Item>
                    <Menubar.Separator />
                    <Menubar.CheckboxItem bind:checked={$distanceMarkers}>
                        <Coins size="16" />{i18n._('menu.distance_markers')}<Shortcut key="F3" />
                    </Menubar.CheckboxItem>
                    <Menubar.CheckboxItem bind:checked={$directionMarkers}>
                        <Milestone size="16" />{i18n._('menu.direction_markers')}<Shortcut
                            key="F4"
                        />
                    </Menubar.CheckboxItem>
                    <Menubar.Separator />
                    <Menubar.Item inset onclick={() => map.toggle3D()}>
                        <Box size="16" />
                        {i18n._('menu.toggle_3d')}
                        <Shortcut key={i18n._('menu.right_click_drag')} />
                    </Menubar.Item>
                    <Menubar.Separator />
                    <Menubar.CheckboxItem checked={fullscreen} onCheckedChange={toggleFullscreen}>
                        {#if fullscreen}
                            <Minimize2 size="16" />
                        {:else}
                            <Maximize2 size="16" />
                        {/if}
                        {i18n._('menu.fullscreen')}
                        <Shortcut key="F11" />
                    </Menubar.CheckboxItem>
                </Menubar.Content>
            </Menubar.Menu>
            <Menubar.Menu>
                <Menubar.Trigger aria-label={i18n._('menu.settings')}>
                    <Settings size="18" class="md:hidden" />
                    <span class="hidden md:block">
                        {i18n._('menu.settings')}
                    </span>
                </Menubar.Trigger>
                <Menubar.Content class="border-none">
                    <Menubar.Sub>
                        <Menubar.SubTrigger>
                            <Ruler size="16" />{i18n._('menu.distance_units')}
                        </Menubar.SubTrigger>
                        <Menubar.SubContent>
                            <Menubar.RadioGroup bind:value={$distanceUnits}>
                                <Menubar.RadioItem value="metric"
                                    >{i18n._('menu.metric')}</Menubar.RadioItem
                                >
                                <Menubar.RadioItem value="imperial"
                                    >{i18n._('menu.imperial')}</Menubar.RadioItem
                                >
                                <Menubar.RadioItem value="nautical"
                                    >{i18n._('menu.nautical')}</Menubar.RadioItem
                                >
                            </Menubar.RadioGroup>
                        </Menubar.SubContent>
                    </Menubar.Sub>
                    <Menubar.Sub>
                        <Menubar.SubTrigger>
                            <Zap size="16" />{i18n._('menu.velocity_units')}
                        </Menubar.SubTrigger>
                        <Menubar.SubContent>
                            <Menubar.RadioGroup bind:value={$velocityUnits}>
                                <Menubar.RadioItem value="speed"
                                    >{i18n._('quantities.speed')}</Menubar.RadioItem
                                >
                                <Menubar.RadioItem value="pace"
                                    >{i18n._('quantities.pace')}</Menubar.RadioItem
                                >
                            </Menubar.RadioGroup>
                        </Menubar.SubContent>
                    </Menubar.Sub>
                    <Menubar.Sub>
                        <Menubar.SubTrigger>
                            <Thermometer size="16" />{i18n._('menu.temperature_units')}
                        </Menubar.SubTrigger>
                        <Menubar.SubContent>
                            <Menubar.RadioGroup bind:value={$temperatureUnits}>
                                <Menubar.RadioItem value="celsius"
                                    >{i18n._('menu.celsius')}</Menubar.RadioItem
                                >
                                <Menubar.RadioItem value="fahrenheit"
                                    >{i18n._('menu.fahrenheit')}</Menubar.RadioItem
                                >
                            </Menubar.RadioGroup>
                        </Menubar.SubContent>
                    </Menubar.Sub>
                    <Menubar.Separator />
                    <Menubar.Sub>
                        <Menubar.SubTrigger>
                            <Languages size="16" />
                            {i18n._('menu.language')}
                        </Menubar.SubTrigger>
                        <Menubar.SubContent>
                            <Menubar.RadioGroup value={i18n.lang}>
                                {#each Object.entries(languages) as [lang, label]}
                                    <a href={getURLForLanguage(lang, '/app')}>
                                        <Menubar.RadioItem value={lang}>{label}</Menubar.RadioItem>
                                    </a>
                                {/each}
                            </Menubar.RadioGroup>
                        </Menubar.SubContent>
                    </Menubar.Sub>
                    <Menubar.Sub>
                        <Menubar.SubTrigger>
                            {#if mode.current === 'light' || !mode.current}
                                <Sun size="16" />
                            {:else}
                                <Moon size="16" />
                            {/if}
                            {i18n._('menu.mode')}
                        </Menubar.SubTrigger>
                        <Menubar.SubContent>
                            <Menubar.RadioGroup
                                value={mode.current ?? 'light'}
                                onValueChange={(value) => {
                                    setMode(value as 'light' | 'dark');
                                }}
                            >
                                <Menubar.RadioItem value="light"
                                    >{i18n._('menu.light')}</Menubar.RadioItem
                                >
                                <Menubar.RadioItem value="dark"
                                    >{i18n._('menu.dark')}</Menubar.RadioItem
                                >
                            </Menubar.RadioGroup>
                        </Menubar.SubContent>
                    </Menubar.Sub>
                    <!-- Map layer management is hidden for now; it returns
                         once the layer catalog is curated for the app. -->
                </Menubar.Content>
            </Menubar.Menu>
        </Menubar.Root>
        <div class="ml-auto shrink-0">
            <ButtonWithTooltip
                variant="outline"
                size="sm"
                class="gap-1 h-7 px-1.5 text-xs"
                label={i18n._('library.sync_tooltip')}
                onclick={() => toast.info(i18n._('library.sync_coming_soon'))}
            >
                <CloudUpload size="15" />
            </ButtonWithTooltip>
        </div>
    </div>
</div>

<Export />
<LayerControlSettings bind:open={layerSettingsOpen} />

<svelte:window
    on:keydown={(e) => {
        let targetInput =
            e &&
            e.target &&
            e.target instanceof HTMLElement &&
            (e.target.tagName === 'INPUT' ||
                e.target.tagName === 'TEXTAREA' ||
                e.target.tagName === 'SELECT' ||
                e.target.role === 'combobox' ||
                e.target.role === 'radio' ||
                e.target.role === 'menu' ||
                e.target.role === 'menuitem' ||
                e.target.role === 'menuitemradio' ||
                e.target.role === 'menuitemcheckbox');

        if (e.key === '+' && (e.metaKey || e.ctrlKey)) {
            // A new track needs an adventure to live in (matches the File menu).
            if ($selectedAdventureId !== null) {
                createFile();
            }
            e.preventDefault();
        } else if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
            fileActions.duplicateSelection();
            e.preventDefault();
        } else if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
            if (!targetInput) {
                selection.copySelection();
                e.preventDefault();
            }
        } else if (e.key === 'x' && (e.metaKey || e.ctrlKey)) {
            if (!targetInput) {
                selection.cutSelection();
                e.preventDefault();
            }
        } else if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
            if (!targetInput) {
                pasteSelection();
                e.preventDefault();
            }
        } else if ((e.key === 's' || e.key == 'S') && (e.metaKey || e.ctrlKey)) {
            if (!e.shiftKey && $selection.size > 0) {
                exportState.current = ExportState.SELECTION;
            }
            e.preventDefault();
        } else if ((e.key === 'z' || e.key == 'Z') && (e.metaKey || e.ctrlKey)) {
            // In a text field, let the browser handle native text undo/redo (e.g.
            // typing in a plan note); otherwise undo/redo the app's file actions.
            if (!targetInput) {
                if (e.shiftKey) {
                    fileActionManager.redo();
                } else {
                    fileActionManager.undo();
                }
                e.preventDefault();
            }
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && (e.metaKey || e.ctrlKey)) {
            if (!targetInput && !e.shiftKey) {
                fileActions.deleteSelection();
                e.preventDefault();
            }
        } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
            if (!targetInput) {
                selection.selectAll();
                e.preventDefault();
            }
        } else if (e.key === 'i' && (e.metaKey || e.ctrlKey)) {
            if (
                $selection.size === 1 &&
                $selection
                    .getSelected()
                    .every((item) => item instanceof ListFileItem || item instanceof ListTrackItem)
            ) {
                editMetadata.current = true;
            }
            e.preventDefault();
        } else if (e.key === 'p' && (e.metaKey || e.ctrlKey)) {
            $elevationProfile = !$elevationProfile;
            e.preventDefault();
        } else if (e.key === 'h' && (e.metaKey || e.ctrlKey)) {
            if ($allHidden) {
                fileActions.setHiddenToSelection(false);
            } else {
                fileActions.setHiddenToSelection(true);
            }
            e.preventDefault();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            if ($selection.size > 0) {
                boundsManager.centerMapOnSelection();
            }
        } else if (e.key === 'F1') {
            switchBasemaps();
            e.preventDefault();
        } else if (e.key === 'F2') {
            toggleOverlays();
            e.preventDefault();
        } else if (e.key === 'F3') {
            $distanceMarkers = !$distanceMarkers;
            e.preventDefault();
        } else if (e.key === 'F4') {
            $directionMarkers = !$directionMarkers;
            e.preventDefault();
        } else if (e.key === 'F5') {
            $routing = !$routing;
            e.preventDefault();
        } else if (
            e.key === 'ArrowRight' ||
            e.key === 'ArrowDown' ||
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowUp'
        ) {
            if (!targetInput) {
                selection.updateFromKey(
                    e.key === 'ArrowRight' || e.key === 'ArrowDown',
                    e.shiftKey
                );
                e.preventDefault();
            }
        }
    }}
    on:dragover={(e) => e.preventDefault()}
    on:drop={(e) => {
        // GPX files are imported by dropping them on an adventure (or its
        // track pane), never anywhere else: swallowing the window drop
        // prevents the browser from navigating to the dropped file.
        e.preventDefault();
    }}
/>

<style lang="postcss">
    @reference "../../app.css";

    div :global(button) {
        @apply hover:bg-accent;
        @apply px-3;
        @apply py-0.5;
    }
</style>
