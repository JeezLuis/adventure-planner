import { describe, expect, it } from 'vitest';

import {
    SKI_TILES_URL,
    buildSkiOverlay,
    PARKS_TILEJSON_URL,
    buildParksOverlay,
    overlays,
    defaultOpacities,
    overlayTree,
    defaultOverlays,
    defaultOverlayTree,
} from '$lib/assets/layers';

/**
 * A built-in overlay is only fully wired up if its id is registered in all five
 * catalog objects (see the "Offroad" overlay it mirrors). Miss one and the
 * overlay silently fails to appear, persist, or render. These invariants guard
 * the "Ski resorts" overlay against a half-registration regression.
 */
describe('ski resorts overlay registration', () => {
    it('is present in the overlay catalog as a raster source + layer', () => {
        const style = overlays.ski;
        expect(style).toBeDefined();
        expect(typeof style).toBe('object');
        if (typeof style === 'object') {
            expect(style.sources.ski.type).toBe('raster');
            expect(style.layers).toEqual([{ id: 'ski-pistes', type: 'raster', source: 'ski' }]);
        }
    });

    it('has a default opacity, matching the offroad convention', () => {
        expect(defaultOpacities.ski).toBe(0.9);
    });

    it('is available, off at first launch, and shown in the quick picker', () => {
        expect((overlayTree.overlays as Record<string, boolean>).ski).toBe(true);
        expect((defaultOverlays.overlays as Record<string, boolean>).ski).toBe(false);
        expect((defaultOverlayTree.overlays as Record<string, boolean>).ski).toBe(true);
    });

    it('sources tiles from the OpenSnowMap pistes endpoint', () => {
        const style = buildSkiOverlay();
        expect(style.sources.ski).toMatchObject({ type: 'raster', tiles: [SKI_TILES_URL] });
        expect(SKI_TILES_URL).toContain('opensnowmap.org');
    });

    it('credits both OpenSnowMap and OpenStreetMap in the source attribution', () => {
        const source = buildSkiOverlay().sources.ski;
        const attribution = 'attribution' in source ? source.attribution : undefined;
        expect(attribution).toContain('OpenSnowMap');
        expect(attribution).toContain('OpenStreetMap');
    });
});

/**
 * Same five registration invariants for the "National & natural parks" overlay,
 * which additionally exercises the vector `fill` + `line` rendering path.
 */
describe('national & natural parks overlay registration', () => {
    it('is present in the overlay catalog as a vector source with fill + outline + label layers', () => {
        const style = overlays.parks;
        expect(style).toBeDefined();
        expect(typeof style).toBe('object');
        if (typeof style === 'object') {
            expect(style.sources.parks.type).toBe('vector');
            expect(style.layers.map((l) => l.id)).toEqual([
                'parks-fill',
                'parks-outline',
                'parks-label',
            ]);
            const fill = style.layers.find((l) => l.id === 'parks-fill');
            const outline = style.layers.find((l) => l.id === 'parks-outline');
            const label = style.layers.find((l) => l.id === 'parks-label');
            expect(fill).toMatchObject({ type: 'fill', source: 'parks', 'source-layer': 'park' });
            expect(outline).toMatchObject({ type: 'line', source: 'parks', 'source-layer': 'park' });
            expect(label).toMatchObject({ type: 'symbol', source: 'parks', 'source-layer': 'park' });
        }
    });

    it('pins the outline opacity so adjacent parks stay separated at any fill opacity', () => {
        const outline = buildParksOverlay().layers.find((l) => l.id === 'parks-outline');
        expect((outline?.metadata as Record<string, unknown>)?.['overlay:fixed-opacity']).toBe(
            true
        );
    });

    it('labels parks from dedicated point features (no per-centroid duplicates)', () => {
        const label = buildParksOverlay().layers.find((l) => l.id === 'parks-label') as {
            filter?: unknown;
            layout?: Record<string, unknown>;
        };
        expect(label.filter).toEqual(['==', ['geometry-type'], 'Point']);
        expect(label.layout?.['text-field']).toBeDefined();
    });

    it('has a lower default opacity than the line/raster overlays (it is a fill)', () => {
        expect(defaultOpacities.parks).toBe(0.4);
    });

    it('is available, off at first launch, and shown in the quick picker', () => {
        expect((overlayTree.overlays as Record<string, boolean>).parks).toBe(true);
        expect((defaultOverlays.overlays as Record<string, boolean>).parks).toBe(false);
        expect((defaultOverlayTree.overlays as Record<string, boolean>).parks).toBe(true);
    });

    it('sources vector tiles from the OpenFreeMap planet endpoint', () => {
        const style = buildParksOverlay();
        expect(style.sources.parks).toMatchObject({ type: 'vector', url: PARKS_TILEJSON_URL });
        expect(PARKS_TILEJSON_URL).toContain('openfreemap.org');
    });

    it('does not filter by class, so all protected/natural areas are shown', () => {
        const filters = JSON.stringify(
            buildParksOverlay().layers.map((l) => (l as { filter?: unknown }).filter ?? null)
        );
        expect(filters).not.toContain('class');
    });

    it('credits OpenFreeMap, OpenMapTiles and OpenStreetMap in the source attribution', () => {
        const source = buildParksOverlay().sources.parks;
        const attribution = 'attribution' in source ? source.attribution : undefined;
        expect(attribution).toContain('OpenFreeMap');
        expect(attribution).toContain('OpenMapTiles');
        expect(attribution).toContain('OpenStreetMap');
    });
});
