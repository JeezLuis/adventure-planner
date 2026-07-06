# ADR 0008 - Planning content is Markdown in standard GPX text fields

## Status

Accepted (2026-07). Implemented.

## Context

Beyond editing a track, an adventure is something you prepare for: packing lists by
category (spare parts, clothing, medicines), border-crossing notes, fuel stops, contacts.
Users asked for a Notion-like planning workspace that stays out of the way of the plain
"edit a track" flow, but gives real freedom to capture this free-form structured data.

Two questions had to be answered together: what content model, and where the content is
stored so the exported GPX stays valid and openable in other apps (the project's "the GPX
is always right" principle).

[ADR 0007](0007-planning-metadata-outside-gpx.md) already established that per-track
planning *state* with no native GPX representation (numbering, dates, buffer days,
alternative flags) lives beside the file and, for whole-adventure export round-trips, in
an app-private `ap:data` JSON payload. That reasoning does not extend to planning *text*:
notes and lists are legitimate, human-readable content that GPX already has standard
elements for.

## Decision

Planning happens at two levels, both persisted as **Markdown** in **standard GPX text
fields** so the export stays valid and readable elsewhere:

- **Adventure** - a **structured block editor** (Note / Checklist / Table blocks; each
  block is collapsible with an optional title). Stored as GitHub-flavored Markdown
  (`## Title` headings, `- [ ]` task lists, pipe tables) in `<metadata><desc>`. Checklist
  items may carry a hyperlink (`[label](url)`) and a quantity (`(amount units)`), both of
  which round-trip as readable Markdown. The single module
  [`plan-doc.ts`](../../website/src/lib/logic/plan-doc.ts) converts Markdown <-> blocks
  (`parsePlanDoc` / `serializePlanDoc`); the block model, not string surgery, is the
  write-back mechanism, unmodeled Markdown is preserved verbatim in a Note block, and
  `parse -> serialize -> parse` is stable. An `##`/`#` heading delimits blocks, so titling
  blocks is what keeps them distinct on a round-trip.
- **Track** - a read-only route preview, KPIs, and a single editable **description**
  field: the track's own `<trk><desc>`, shared with the metadata dialog (editing it in
  either place updates the same field). A track needs no block editor.

Storage layers:

- Working store: the adventure's plan on a new `Adventure.planDoc` field (Dexie
  `adventures`); a track's plan directly on its `GPXFile` `trk[0].cmt` (already persisted
  and round-tripped with the file). No Dexie migration is needed.
- Export/import: `exportAdventure` writes `planDoc` into the merged file's
  `<metadata><desc>`; `importAdventures` lifts `<metadata><desc>` back onto the adventure;
  per-track `<cmt>` rides along through the existing clone/split path.

This keeps `ap:data` for non-text state only. The pre-existing short `Adventure.description`
stays app-private in `ap:data`; the planning doc is a separate, portable field.

## Consequences

- **Exports carry the plan and stay valid.** A downloaded adventure GPX shows the plan as
  readable text in `<metadata><desc>` and `<trk><cmt>`, which any GPX reader understands;
  app-private state remains confined to the `ap:` namespace that conformant readers ignore.
  This is more aligned with ADR 0007's spirit than embedding text in `ap:data` would be.
- **Round-trip is faithful with no engine change.** The GPX engine already preserves
  multi-line text and XML-special characters through parse/build; a regression fixture in
  [`roundtrip.test.ts`](../../gpx/tests/roundtrip.test.ts) guards multi-line Markdown in
  `<desc>`/`<cmt>`.
- **Per-track text belongs on `<trk>`, not the file `<metadata>`.** A related fix redirects
  the single-track description dialog to write `trk[0].desc` (the field the adventure
  exporter actually carries), which is the same field the planning view's track section
  edits, so a track has one description everywhere.
- **Empty content writes nothing.** An empty plan serializes to `''`, so no `<desc>`/`<cmt>`
  is emitted and a track-only user's export stays byte-clean. Empty checklist items and
  empty categories are dropped on serialize (Markdown has no blank task item).
- **Progressive disclosure.** The planning view is reached from a `Map | Plan` toggle shown
  only when a single adventure is selected, and opens to an empty state; someone who only
  edits tracks never encounters it. A new dependency, `marked`, is added for Markdown
  lexing/rendering; rendered Note HTML reuses the existing `sanitize-html` allow-list.
