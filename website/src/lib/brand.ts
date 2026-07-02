/**
 * Product identity, centralized so a rename touches exactly one file.
 *
 * This module must stay free of SvelteKit-specific imports ($env, $app):
 * the build scripts (pwa-manifest.ts, sitemap.ts) import it through plain
 * tsx, outside the Vite pipeline.
 */

/** Product name shown in titles, metadata, and the UI. */
export const APP_NAME = 'Adventure Planner';

/**
 * Canonical public origin of the deployed app (no trailing slash). Used for
 * sitemap entries, PWA manifest ids, and social metadata. Update when the
 * production domain exists (Phase 1).
 */
export const APP_URL = 'https://adventure-planner.example.com';

/** Source repository, credited in the footer. */
export const REPOSITORY_URL = 'https://github.com/JeezLuis/adventure-planner';

/**
 * Upstream project this app is forked from. The MIT license requires keeping
 * the original copyright notice; crediting the project by name is how we
 * honor it visibly.
 */
export const UPSTREAM_NAME = 'gpx.studio';
export const UPSTREAM_URL = 'https://github.com/gpxstudio/gpx.studio';
