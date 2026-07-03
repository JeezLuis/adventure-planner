# ADR 0007 - Planning metadata lives outside the GPX file

## Status

Accepted (2026-07). Implemented.

## Context

Adventures need trip-planning attributes per track: a stage number or calendar day,
buffer days between stages (rest days, travel), and an "alternative" mark for backup
route variants that must not count as a stage and should read as secondary on the map.

GPX has an extensions mechanism, so these could be embedded in each file (portable,
self-contained) or stored beside the file in the library tables. Rendering needed the
same call: is the faded/dotted look of an alternative part of the track's stored style,
or a presentation concern?

## Decision

Planning metadata is stored **beside** the GPX file, never inside it:

- `TrackPlacement` rows (Dexie `trackPlacements`, keyed by file id) carry `adventureId`,
  `bufferDays`, and `alternative`.
- The sequence follows the manual track-pane order (the `fileOrder` setting); numbering
  tags (`1, 2, 3…`, `dd/mm`, `ALT`) are derived reactively (`trackTags`) and never
  stored.
- Alternative marks are **dormant** when the adventure has no numbering: kept in the
  database, rendered normally, restored losslessly when numbering returns.

Alternatives render as a **render-only override** in the map layer: opacity capped at
0.5 while building the GeoJSON, plus a dotted `line-dasharray` (`[0.1, 3]`, scaled by
line width) set on the file's line layer. The stored `gpx_style:line` extension - the
style the user picked - is never touched. A persisted device setting
(`showAlternativesOnMap`, the eye button in the track pane) hides all alternatives on
the map without touching any data; they stay listed in the pane.

## Consequences

- **Exports stay clean.** A downloaded or shared GPX file contains route data and chosen
  style only - no app-private planning fields for other tools to trip over. The flip
  side: a file loses its stage/ALT context outside its owning adventure, which is
  meaningless there anyway.
- **Undo/redo is unaffected.** Placement edits are not file mutations, so they create no
  Immer patches; marking an alternative is not undoable, acceptable because the inverse
  action is one click away.
- **Everything derives.** Reordering tracks, toggling numbering, or changing buffer days
  recomputes tags and rendering without rewriting GPX blobs - and therefore, in Phase 2,
  without triggering spurious file uploads (placements will sync as their own records,
  see [ADR 0006](0006-product-model-and-sync.md)).
- **The dotted style is applied per layer**, which works because a library track is
  exactly one file with its own MapLibre layer. Should per-feature styling ever be
  needed, `line-dasharray` accepts data-driven expressions since MapLibre GL JS 5.8.
