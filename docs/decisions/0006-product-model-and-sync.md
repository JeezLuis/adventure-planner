# ADR 0006 - Product model (Expedition ▸ Adventure ▸ Track) and sync design

## Status

Accepted (2026-07). To be implemented in Phase 2.

## Context

The product is a BaseCamp-style library, not a per-session file editor. Users organise
trips hierarchically, expect their library on every device, and should never think about
saving. The existing local persistence (Dexie/IndexedDB with a single commit choke point,
see ARCHITECTURE.md) offers a natural attachment point for synchronisation.

## Decision

**Hierarchy** (strict tree, per user):

- **Expedition** - a set of adventures; expeditions can nest (expeditions and/or
  adventures inside).
- **Adventure** - a set of tracks; adventures do **not** nest. May live inside an
  expedition or at root.
- **Track** - one GPX file; every track lives in **exactly one** adventure. New or
  imported tracks land in the currently selected adventure, else in an auto-created
  per-user "Unsorted" adventure.

**Selection drives the map**: whatever is selected in the left tree is what renders and is
editable - a track, an adventure (all its tracks), an expedition (everything beneath it,
recursively), or any multi-selection.

**Login required**: the app is gated behind Google sign-in (PocketBase OAuth2 popup flow)
once the library ships. No anonymous mode is maintained, so sync can be **automatic for
everything** - no save button; a per-item badge shows sync state (synced / pending /
offline-edited / conflict).

**Sync policy - last-write-wins with a baseline check**: pushes hook
`commitFileStateChange()` (mark dirty, debounce, upload `buildGPX()` output). Before
uploading, the record's server `updated` timestamp is compared with the stored baseline;
on mismatch the sync pauses and the user chooses Overwrite / Load newer / Keep both. No
content merging. Undo/redo (Immer patches) stays 100% local. Cloud **pulls write directly
to Dexie** rather than going through `fileActions` - this avoids re-marking the file dirty
(an echo loop) and avoids polluting local undo history.

## Consequences

- One mandatory backend (ADR 0002) and no offline-only mode; offline *edits* still work
  and reconcile via the same baseline check on reconnect.
- The tree metadata (expeditions/adventures) syncs immediately with the same LWW policy;
  GPX blobs sync debounced.
- Local Dexie file ids are recycled (`gpx-N`), so cloud identity requires a mapping table
  between local ids and PocketBase record ids.
- Conflicts are possible by design (LWW); the prompt makes data loss a deliberate user
  choice rather than a silent outcome.
- Multi-tab operation needs leader election (Web Locks API) so only one tab uploads.
