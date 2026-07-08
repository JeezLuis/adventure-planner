import { describe, expect, it } from 'vitest';

import { getLayerTreeValidator } from '$lib/logic/settings';
import { defaultOverlayTree, type LayerTreeType } from '$lib/assets/layers';

const overlaysOf = (t: LayerTreeType) => t.overlays as Record<string, boolean>;

/**
 * `currentOverlays`/`previousOverlays` are validated with `fillWithFalse = true`
 * so that an overlay shipped AFTER a user last saved their settings stays OFF
 * for that returning user, instead of inheriting the allow-list's `true` (which
 * would silently enable every newly added overlay). `selectedOverlayTree` keeps
 * the default (`false`) so a new overlay still auto-appears in the quick picker.
 *
 * These guard the "National & natural parks" overlay (added after v1) against a
 * regression to the old inherit-`true` behaviour.
 */
describe('layer-tree validator: newly shipped overlay defaults', () => {
    // A returning user's persisted "enabled" tree from before `parks` existed.
    const legacyEnabled: LayerTreeType = { overlays: { offroad: false, ski: true } };

    it('keeps a new overlay OFF for returning users (enabled-state tree)', () => {
        const validated = getLayerTreeValidator(defaultOverlayTree, true)(legacyEnabled);
        expect(overlaysOf(validated).parks).toBe(false); // stays off - the guarantee
        expect(overlaysOf(validated).ski).toBe(true); // existing toggle preserved
        expect(overlaysOf(validated).offroad).toBe(false);
    });

    it('still auto-adds a new overlay to the quick picker (membership tree)', () => {
        const validated = getLayerTreeValidator(defaultOverlayTree)(legacyEnabled);
        expect(overlaysOf(validated).parks).toBe(true); // appears in the picker
    });

    it('drops unknown overlay ids not in the allow-list', () => {
        const stale: LayerTreeType = { overlays: { ski: true, ghost: true } };
        const validated = getLayerTreeValidator(defaultOverlayTree, true)(stale);
        expect('ghost' in overlaysOf(validated)).toBe(false);
    });
});
