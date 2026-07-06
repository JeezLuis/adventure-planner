import { describe, expect, it } from 'vitest';

import {
    SKI_TILES_URL,
    buildSkiOverlay,
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
