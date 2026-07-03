import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest for the website's pure-logic and IndexedDB-backed modules. Runs in
 * Node with fake-indexeddb providing the `indexedDB` global, and stubs the
 * SvelteKit `$app/environment` virtual module (browser=false, so browser-gated
 * side effects stay dormant). Svelte-rune modules (`*.svelte.ts`) are mocked
 * per-test rather than compiled, keeping the harness dependency-light.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        setupFiles: ['fake-indexeddb/auto'],
        alias: {
            $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
            '$app/environment': fileURLToPath(
                new URL('./src/testing/app-environment.stub.ts', import.meta.url)
            ),
            '$env/static/public': fileURLToPath(
                new URL('./src/testing/env-static-public.stub.ts', import.meta.url)
            ),
        },
    },
});
