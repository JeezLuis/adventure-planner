import { writable } from 'svelte/store';

/**
 * Whether the planning view replaces the map for the currently selected
 * adventure. Transient, device-local view state: it is intentionally not
 * persisted, so a reload always returns to the map, and it is reset to `false`
 * whenever the selection is no longer a single adventure (see the app shell).
 */
export const planningMode = writable(false);
