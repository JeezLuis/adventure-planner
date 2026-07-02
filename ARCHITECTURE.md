# Architecture

Adventure Planner is a BaseCamp-style GPX route planner: a static web app for creating,
editing, and organising GPX tracks on topographic and satellite maps. It is a **hard fork**
of [gpx.studio](https://github.com/gpxstudio/gpx.studio) (MIT), forked at commit
`fde6bafc1052edf94854e942cb7b2b073aedbd8b`. There are no upstream merges; useful upstream
fixes are cherry-picked manually (see [ADR 0001](docs/decisions/0001-hard-fork-of-gpx-studio.md)).

This document describes the system as implemented today (Phase 0) and points to where the
planned cloud backend will attach. Decisions and their trade-offs live in
[`docs/decisions/`](docs/decisions/).

## System overview

```
┌─────────────────────────── Browser ────────────────────────────┐
│                                                                │
│  Svelte 5 components (map, toolbar, file list, elevation…)     │
│        │ user actions                    ▲ re-render           │
│        ▼                                 │                     │
│  fileActions (logic/file-actions.ts)     │ Dexie liveQuery     │
│        │                                 │ (logic/file-state)  │
│        ▼                                 │                     │
│  FileActionManager.applyGlobal / applyToFiles                  │
│    (Immer produceWithPatches)            │                     │
│        │                                 │                     │
│        ▼                                 │                     │
│  commitFileStateChange()  ◄── future cloud-sync seam           │
│        │                                                       │
│        ▼                                                       │
│  Dexie / IndexedDB: fileids, files, patches (undo/redo),       │
│                     settings                                   │
└───────┬───────────────┬───────────────┬──────────────┬─────────┘
        │ style.json    │ route         │ terrarium    │ search
        │ + tiles       │ requests      │ PNG tiles    │
        ▼               ▼               ▼              ▼
   MapTiler Cloud   BRouter        AWS Open Data   Nominatim
   (3 basemaps)     (routing)      Terrain Tiles   (geocoding)
```

There is **no server code of our own yet**: the website builds with
`@sveltejs/adapter-static` and every page is prerendered. All state lives in the browser
(IndexedDB). A PocketBase backend (auth, cloud library, sync) is planned — see the roadmap
below.

## Repository layout

```
gpx/                  TypeScript GPX engine: parse, build, statistics, simplify.
  src/                Library source (gpx.ts, io.ts, statistics.ts, simplify.ts).
  tests/              Vitest suites: round-trip serialization + statistics.
  test-data/          GPX fixtures used by the tests.
website/              SvelteKit 2 + Svelte 5 app (adapter-static, no server code).
  src/lib/config.ts   All external service endpoints (env-driven).
  src/lib/brand.ts    Product identity (name, URLs, upstream attribution).
  src/lib/db.ts       Dexie (IndexedDB) schema.
  src/lib/logic/      State management: file actions, undo/redo, selection, settings.
  src/lib/components/ UI: map, toolbar tools, file list, layer control, …
  src/lib/assets/layers.ts  Basemap/overlay/terrain catalogue.
  src/locales/        Shipped translations (English and Spanish only).
  src/routes/         Pages: `/` (redirect to app), `/app`, `/embed`, `/404`.
docs/decisions/       Architecture decision records (ADRs).
.github/workflows/    CI pipeline.
```

The website depends on the engine via `"gpx": "file:../gpx"`; the engine must be installed
and built first (its `postinstall` runs `tsc`). Development setup is described in
[README.md](README.md).

## State and data flow

All GPX file mutations funnel through a single choke point:

1. UI components call functions in `website/src/lib/logic/file-actions.ts`.
2. These delegate to `FileActionManager.applyGlobal(...)` / `applyToFiles(...)`
   (`website/src/lib/logic/file-action-manager.ts`), which produce the new file state
   immutably with Immer's `produceWithPatches`.
3. The resulting patches are stored in the Dexie `patches` table (capped at
   `MAX_PATCHES = 100`); undo/redo replays inverse/forward patches.
4. `FileActionManager.commitFileStateChange()` writes the changed `GPXFile` objects to the
   Dexie `fileids`/`files` tables (`website/src/lib/db.ts`) in one transaction.
5. The UI never reads the manager's in-memory state directly: `GPXFileState` /
   `GPXFileStateCollection` (`website/src/lib/logic/file-state.ts`) observe the database
   via Dexie `liveQuery` and re-render components reactively. Reload therefore restores
   the exact working state from IndexedDB.

**`commitFileStateChange()` is the future cloud-sync seam.** Every persisted change to
every file passes through this one method, so the Phase 2 sync engine hooks here to mark
records dirty and schedule uploads — no other code path needs instrumenting. Conversely,
cloud *pulls* will write directly to Dexie (not through `fileActions`), so a remote update
re-renders the UI through the same `liveQuery` path without creating patches (which would
pollute undo history) or re-marking the file dirty (which would echo the change back up).

Undo/redo state is deliberately separate (the `patches` table plus a `patchIndex` entry in
`settings`) and will remain local-only when sync arrives.

## External services

Every external endpoint is declared in `website/src/lib/config.ts` with its URL from a
build-time environment variable (see `website/.env.example`). `PUBLIC_*` variables are
baked into the client bundle and must never contain secrets.

| Service | Provider | Configuration | Used in |
|---|---|---|---|
| Basemaps (3 styles: `outdoor-v2` default, `hybrid` satellite, `topo-v2`) | MapTiler Cloud | `PUBLIC_MAPTILER_KEY`, substituted for the `MAPTILER_KEY` placeholder when a style is fetched | `assets/layers.ts`, `components/map/style.ts` |
| Routing | BRouter (public `brouter.de` in dev; self-hosted in production) | `PUBLIC_BROUTER_URL` | profile map + client in `components/toolbar/tools/routing/routing.ts` |
| Elevation profiles + 3D terrain | AWS Open Data Terrain Tiles (terrarium PNG, keyless) | `PUBLIC_ELEVATION_TILE_URL` | decoded client-side in `utils.ts` `getElevation()`; terrain via `assets/layers.ts` `terrainSources` |
| Geocoding (search box) | Nominatim (public, fair-use) | hardcoded URL | `components/map/map.ts` |
| Street view (inherited from upstream) | Mapillary vector tiles + viewer; Google Street View as an external link | hardcoded tile URL and token | `components/map/street-view-control/` |
| Basemap fallback | OpenStreetMap raster tiles, used only if fetching the selected style fails | hardcoded | `assets/layers.ts` `fallbackBasemapStyle` |

The layer catalogue (`website/src/lib/assets/layers.ts`) ships exactly three basemaps and
an **empty** built-in overlay catalogue. The overlay mechanism itself is kept: users can
add custom layers through the UI, and browser extensions can register overlays through
`components/map/layer-control/extension-api.ts`, which exposes itself as
`window.gpxstudio` to stay compatible with extensions written for upstream.

### Removed from upstream

Deleted deliberately (each in its own commit, so anything can be resurrected via git):
the Overpass POI feature, all built-in overlays and national basemaps, the bundled
docs/help MDX site, the marketing landing page (`/` is now a prerendered redirect to
`/app`), 31 locale files (English and Spanish remain), the Crowdin config, the
GraphHopper routing client, and the private-roads toggle (no BRouter equivalent).

## gpx engine notes

Behavioural quirks of the `gpx/` library that are easy to trip over (all pinned down by
the test suites in `gpx/tests/`):

- **`buildGPX(file, exclude)` has no default for `exclude`** — always pass `[]` unless you
  really want to exclude data fields.
- **Serialization is only idempotent from the second rebuild.** `parseGPX` uses
  fast-xml-parser's `removeNSPrefix`, so a fixture's `xsi:schemaLocation` comes back as a
  bare `schemaLocation` attribute that `buildGPX` emits alongside the `xsi:schemaLocation`
  it always rewrites. `buildGPX(parseGPX(x))` output stabilises byte-for-byte from the
  second round trip onward (see `gpx/tests/roundtrip.test.ts`).
- **`gpx/dist` is not consumable by plain Node ESM**: the compiled output uses
  extensionless relative imports (`export * from './gpx'`), which only bundler resolution
  (Vite) accepts. Node scripts and tests must import from `gpx/src` instead.
- **`getStatistics()` units are mixed**: `distance.total` is in **kilometres**,
  `elevation.gain`/`elevation.loss` in **metres**, `time.total`/`time.moving` in
  **seconds**.

## Security posture

- `.gitignore` blocks `.env`/`.env.*` (except `.env.example`), key material (`*.pem`,
  `*.key`, …), credentials files, and PocketBase `pb_data/`.
- `.claude/settings.json` denies AI-assistant reads of `.env*`, key files, and `pb_data/`,
  so coding sessions physically cannot exfiltrate secrets.
- CI (`.github/workflows/ci.yml`): a **gitleaks scan over the full history is a hard
  gate**; build + gpx tests are blocking; lint, `svelte-check`, and `npm audit` run as
  advisory (non-blocking) jobs — see known debt.
- `PUBLIC_*` env vars are client-visible by design and are **not** secrets; the MapTiler
  key is restricted by origin in the MapTiler dashboard instead. Any real secret that is
  ever committed must be rotated immediately — history rewriting is not sufficient.
- Brand identity is centralised in `website/src/lib/brand.ts` (`APP_NAME`, `APP_URL`,
  `REPOSITORY_URL`, upstream attribution). `APP_URL` is a placeholder until the
  production domain exists (Phase 1).

## Roadmap

The full phased plan is maintained outside the repo; the shape of it:

- **Phase 0 — done.** Fork boots locally on free endpoints: MapTiler basemaps, BRouter
  routing, AWS elevation tiles; pruning, rebrand, gpx tests, CI, security baseline.
- **Phase 1 — VPS + PocketBase + Google login.** Single Hetzner VPS running Caddy,
  PocketBase (Google OAuth via popup, SQLite, GPX file storage), and self-hosted BRouter;
  frontend on Cloudflare Pages; infrastructure as code in `infra/`.
- **Phase 2 — the library (the actual product).** Expedition ▸ Adventure ▸ Track tree in
  a left panel; **selection drives what renders on the map**; login required; automatic
  sync (last-write-wins with a baseline check and a conflict prompt) hooked into
  `commitFileStateChange()`; per-item sync badges; Dexie schema v2 drops the leftover
  Overpass tables. See [ADR 0006](docs/decisions/0006-product-model-and-sync.md).
- **Phase 3 — polish.** Standalone POIs, share links (the `/embed` route is kept for
  this), PocketBase realtime, mobile pass, continued refactoring of inherited modules.

## Known debt

- **~22 inherited upstream type errors** (`svelte-check`) and Prettier violations in
  inherited files; the CI lint/type-check jobs are advisory (`continue-on-error`) until
  these are cleaned, then graduate to blocking gates.
- **Leftover Overpass Dexie tables**: `overpasstiles`/`overpassdata` are still declared in
  `website/src/lib/db.ts` although the feature was deleted — removing tables requires a
  Dexie version bump, scheduled for the Phase 2 schema change.
- **Mapillary street view carries an inherited hardcoded access token** (upstream's client
  token in `components/map/street-view-control/mapillary.ts`), and the service is not yet
  routed through `config.ts` — replace with our own token or remove the feature.
- **Icons are SVG-only**: the upstream PNG icon set was replaced by SVG assets in
  `website/static/`; some platforms (e.g. iOS home-screen icons) prefer PNG and may render
  a default icon.
- **Help boxes' links are disabled**: `components/Help.svelte` accepts but ignores its
  `link` prop because the bundled docs site was removed; re-point the links once our own
  documentation exists.
- **Stale locale keys**: `src/locales/en.json`/`es.json` still contain strings for removed
  features (e.g. the `esriSatellite` layer label).
- **Unused dependency**: `@docsearch/js` remains in `website/package.json` but is no
  longer imported anywhere (it belonged to the removed docs site).
