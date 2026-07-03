/**
 * Test stub for SvelteKit's `$app/environment` virtual module (see
 * vitest.config.ts). `browser` is false so browser-gated side effects (the
 * library's Dexie hooks, settings subscriptions) stay dormant under test.
 */
export const browser = false;
export const dev = true;
export const building = false;
export const version = 'test';
