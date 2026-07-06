# Attributions

Adventure Planner builds on the work of the projects and data providers below. This file
covers code provenance, map data, and the major libraries we ship; the complete dependency
list (with licences resolvable per package) lives in `website/package.json` and
`gpx/package.json`.

## Fork base

- **[gpx.studio](https://gpx.studio)** - this project is a hard fork of
  [gpxstudio/gpx.studio](https://github.com/gpxstudio/gpx.studio), forked at commit
  [`fde6bafc1052edf94854e942cb7b2b073aedbd8b`](https://github.com/gpxstudio/gpx.studio/commit/fde6bafc1052edf94854e942cb7b2b073aedbd8b).
  Licensed under the **MIT License**; the original licence and copyright notice are
  preserved in [LICENSE](LICENSE). The gpx.studio name and logo are not used by this
  project.

## Map data and services

- **[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors** - map data
  licensed under the **ODbL**. OSM data underlies the MapTiler basemaps, the BRouter
  routing network, Nominatim geocoding results, and the raster fallback basemap.
- **[MapTiler](https://www.maptiler.com/)** - hosting and rendering of the three basemap
  styles (Outdoor, Hybrid satellite, Topo). Used under the MapTiler Cloud terms; the map
  displays MapTiler and OpenStreetMap attribution.
- **[Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)** (Mapzen / AWS Open
  Data) - terrarium-encoded elevation tiles used for elevation profiles and 3D terrain.
  Contains data from sources including SRTM (NASA/USGS) and other public DEMs; see the
  dataset's attribution notes.
- **[OpenSnowMap](https://www.opensnowmap.org/)** - pre-rendered piste/lift raster tiles
  for the optional "Ski resorts" overlay, licensed **CC-BY-SA** (underlying data ©
  OpenStreetMap contributors, ODbL). Used within the OpenSnowMap tile usage policy.
- **[Nominatim](https://nominatim.openstreetmap.org/)** - geocoding for the search box,
  used under the OSMF Nominatim usage policy (data © OpenStreetMap contributors).
- **[BRouter](https://github.com/abrensch/brouter)** - routing engine (**MIT**). The
  development configuration uses the public community server at brouter.de; production
  uses a self-hosted instance.
- **[Mapillary](https://www.mapillary.com/)** - street-level imagery shown by the
  inherited street-view control (viewer library `mapillary-js`, **MIT**).

## Backend (Phase 1, planned)

- **[PocketBase](https://pocketbase.io/)** - auth, database, and file storage backend
  (**MIT**). Not yet part of the codebase.

## Major libraries shipped in the app

- **[Svelte](https://svelte.dev/) / [SvelteKit](https://svelte.dev/docs/kit)** - MIT
- **[MapLibre GL JS](https://maplibre.org/)** - BSD-3-Clause
- **[Dexie.js](https://dexie.org/)** - Apache-2.0
- **[Immer](https://immerjs.github.io/immer/)** - MIT
- **[Chart.js](https://www.chartjs.org/)** (+ chartjs-plugin-zoom) - MIT
- **[fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)** - MIT
- **[Tailwind CSS](https://tailwindcss.com/)** - MIT
- **[bits-ui](https://bits-ui.com/) / [shadcn-svelte](https://shadcn-svelte.com/)** - MIT
- **[Lucide](https://lucide.dev/)** icons - ISC
- **[JSZip](https://stuk.github.io/jszip/)** - MIT (dual-licensed MIT/GPLv3; used as MIT)
- **[FileSaver.js](https://github.com/eligrey/FileSaver.js)** - MIT
- **[SortableJS](https://sortablejs.github.io/Sortable/)** (+ svelte-dnd-action, MIT) - MIT
- **[sanitize-html](https://github.com/apostrophecms/sanitize-html)** - MIT
- **[@mapbox/tilebelt](https://github.com/mapbox/tilebelt) /
  [@mapbox/sphericalmercator](https://github.com/mapbox/sphericalmercator)** - MIT /
  BSD-3-Clause
- **[Inter](https://rsms.me/inter/)** typeface (via Fontsource) - SIL OFL 1.1
