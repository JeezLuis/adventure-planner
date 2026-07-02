# ADR 0005 - Elevation from keyless AWS terrarium tiles, decoded client-side

## Status

Accepted (2026-07). Implemented (Phase 0).

## Context

The app needs elevation data in two places: filling in elevation for drawn/edited track
points (elevation profiles) and rendering 3D terrain. Upstream fetched elevation tiles
from its private infrastructure.

Alternatives considered:

- **MapTiler terrain tiles** - would work with the key we already have, but every
  elevation lookup and every 3D-terrain tile would consume the same 100K-requests/month
  free-tier quota as the basemaps (ADR 0004).
- **An elevation API** (e.g. Open-Elevation, Open Topo Data) - introduces per-request rate
  limits and another service dependency for what is fundamentally static raster data.

## Decision

**AWS Open Data Terrain Tiles** (the Mapzen terrarium dataset): keyless, unmetered,
terrarium-encoded PNG tiles, 256 px, available up to zoom 15. The URL template is
env-driven (`PUBLIC_ELEVATION_TILE_URL`, constants in `website/src/lib/config.ts`).

The same tile set serves both consumers:

- `getElevation()` in `website/src/lib/utils.ts` fetches tiles and decodes heights from
  pixel colours entirely client-side, with bilinear interpolation between the four
  surrounding pixels;
- 3D terrain uses the tiles directly as a `raster-dem` source with `encoding: 'terrarium'`
  (`terrainSources` in `website/src/lib/assets/layers.ts`).

## Consequences

- No API key, no quota, no rate limits, and no load on the MapTiler allowance.
- The dataset is static (no new data since Mapzen's demise) - fine for terrain, which
  barely changes at these resolutions.
- Decoding is client-side; a failed tile load yields an elevation of 0 for the affected
  points rather than an error.
- Tile size (256 px) and max zoom (15) are dataset properties encoded as constants in
  `config.ts`; swapping providers means changing the env var and, if needed, those
  constants.
