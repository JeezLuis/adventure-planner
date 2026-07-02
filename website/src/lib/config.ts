/**
 * Central configuration for all external service endpoints.
 *
 * Every third-party or self-hosted service the app talks to is declared here,
 * with its URL coming from a build-time environment variable (see
 * `.env.example`). This keeps infrastructure swappable without code changes
 * and guarantees no private upstream (gpx.studio) endpoints are referenced
 * anywhere in the codebase.
 *
 * Note: `PUBLIC_*` variables are baked into the client bundle by SvelteKit and
 * are therefore visible to every visitor — they must never contain secrets.
 */
import { PUBLIC_BROUTER_URL, PUBLIC_ELEVATION_TILE_URL } from '$env/static/public';

/**
 * Base URL of the BRouter routing endpoint (no trailing slash).
 * Development default is the public community server `https://brouter.de/brouter`;
 * production points at our self-hosted instance (Phase 1).
 */
export const BROUTER_URL: string = PUBLIC_BROUTER_URL;

/**
 * URL template of terrarium-encoded elevation raster tiles, containing
 * `{z}`, `{x}` and `{y}` placeholders. Default is the keyless AWS Open Data
 * "Terrain Tiles" dataset (256px tiles, global coverage up to zoom 15).
 */
export const ELEVATION_TILE_URL: string = PUBLIC_ELEVATION_TILE_URL;

/**
 * Tile edge length in pixels of the elevation tiles served by
 * {@link ELEVATION_TILE_URL}, and the maximum zoom level they exist at.
 * AWS Terrain Tiles are 256px and go up to zoom 15.
 */
export const ELEVATION_TILE_SIZE = 256;
export const ELEVATION_TILE_MAX_ZOOM = 15;
