/**
 * Test stub for SvelteKit's `$env/static/public` virtual module (see
 * vitest.config.ts). Provides placeholder values for the PUBLIC_* build-time
 * variables so modules that read config/layers can be imported under test.
 */
export const PUBLIC_MAPTILER_KEY = 'test-key';
export const PUBLIC_BROUTER_URL = 'https://brouter.example.com/brouter';
export const PUBLIC_ELEVATION_TILE_URL =
    'https://elevation.example.com/{z}/{x}/{y}.png';
