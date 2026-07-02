# ADR 0004 - MapTiler as the sole basemap provider, exactly three styles

## Status

Accepted (2026-07). Implemented (Phase 0).

## Context

Upstream's default vector styles were served from gpx.studio's private servers and had to
be replaced. Upstream also shipped a large catalogue of national basemaps and overlays,
which adds UI complexity and maintenance surface the product does not want: the user
decision is a deliberately minimal layer picker.

## Decision

MapTiler Cloud is the only basemap provider, with **exactly three styles** (declared in
`website/src/lib/assets/layers.ts`):

- `outdoor-v2` - outdoor/topographic, the default;
- `hybrid` - satellite imagery with labels;
- `topo-v2` - alternative topographic style.

The API key is injected by substituting the `MAPTILER_KEY` placeholder in the style URL at
fetch time (`components/map/style.ts`), sourced from `PUBLIC_MAPTILER_KEY`. All other
basemaps and all built-in overlays were deleted; the custom-layer and extension-overlay
mechanisms remain for users who want more.

## Consequences

- One provider, one key, three styles: minimal UI and a single quota to watch.
- The MapTiler free tier allows 100K tile requests/month and is **non-commercial**; all
  three basemaps draw on the same quota. Before any commercial use, switch to the Flex
  plan (~$30/month) or swap providers - the URLs are confined to `layers.ts`, so a swap is
  a config-level change, and deleted upstream layer definitions are a git revert away.
- The key is baked into the client bundle by design (it is a `PUBLIC_*` variable, not a
  secret); abuse is limited by restricting the key to allowed origins in the MapTiler
  dashboard.
- If fetching a style fails, a keyless OpenStreetMap raster fallback renders so the map is
  never empty.
