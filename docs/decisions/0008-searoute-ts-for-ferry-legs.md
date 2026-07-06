# ADR 0008 - searoute-ts for ferry legs

## Status

Accepted (2026-07).

## Context

An adventure can span a sea crossing (for example Barcelona to Nador). BRouter (ADR 0003)
routes roads and inland waterways only; it cannot draw a path across open water. We need
to turn two ports into a plausible maritime line and let the user schedule the crossing
with a departure and an arrival time (possibly on a later day). No app-specific data may
be required to open the result elsewhere (ADR 0007 and the GPX-standard constraint): the
ferry must be a valid GPX track in any editor or device.

Two data needs, and what is freely available:

- **The sea line.** A free, worldwide ferry _timetable_ API does not exist (only
  commercial aggregators, plus a few regional GTFS feeds), but that is not needed: the
  user enters the times. What is needed is a realistic line between two ports.
- **The ports.** A free, worldwide place lookup - already solved in-app.

Alternatives considered for the line:

- **`searoute-js`** (MPL-2.0) - the original; primarily Node-oriented and less canal/strait
  aware.
- **A hand-drawn great-circle arc** - zero dependency, but crosses land on any route that
  must round a coastline (which is most of them).
- **OpenStreetMap `route=ferry` geometry** - real charted lanes, but only where mapped and
  awkward to query for an arbitrary port pair.

## Decision

Use **`searoute-ts`** (npm, MIT, 2.2.0): `seaRoute([lon,lat],[lon,lat])` returns a GeoJSON
`LineString` that follows the bundled 2025 Eurostat maritime network (Suez, Gibraltar,
Panama, etc.), snapping the endpoints to the network. It is explicitly for realistic route
_visualisation_, not navigation - exactly this use case.

- **Loaded via dynamic `import()`** in `website/src/lib/logic/ferry.ts`, so its ~1 MB
  bundled network lands in its own lazy chunk, stays out of the main bundle, and is never
  evaluated during SSR (the only caller is a browser click handler).
- **Great-circle fallback**: when the library cannot route the two points (landlocked,
  isolated, or unavailable) a smoothed spherical arc is drawn instead and the user is told
  the line is approximate, so a ferry leg always renders.
- **Ports by name** reuse the existing free **Nominatim** geocoder (the same backend the
  map search uses, ADR 0004 covers only basemaps); the user can also click the map.
- **Identity is a standard GPX field**: a ferry is a `Track` with `<type>ferry</type>`,
  timestamps as `<time>`, and a maritime-blue `gpx_style` colour. All three round-trip
  through export/import and other editors with no `ap:data` payload changes. The arrival's
  whole-day offset is stored as the placement's existing `bufferDays`, so date-numbered
  adventures shift the following stages by the length of the crossing.

## Consequences

- No new API key or secret, and no new backend dependency: both `searoute-ts` (offline,
  bundled network) and Nominatim are free.
- Bundle cost is deferred and paid only when a user opens the ferry dialog; the fallback
  keeps the feature working if the chunk fails to load.
- Licences to honour, as unmodified npm dependencies: `searoute-ts` is MIT; its network is
  derived from Eurostat SeaRoute (EUPL-1.2) and a UN/LOCODE-based port list (MIT).
  Attribution belongs in the app's about/licences page.
- Accuracy is schematic: the line follows a coarse (~100 km) network and is not a real
  ferry timetable or charted lane. This is acceptable for trip visualisation and is
  surfaced to the user when the fallback is used.
- Nominatim's usage policy (rate limit, attribution) applies; searches are debounced.
