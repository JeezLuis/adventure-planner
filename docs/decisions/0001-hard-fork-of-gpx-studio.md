# ADR 0001 - Hard fork of gpx.studio

## Status

Accepted (2026-07).

## Context

The product needs gpx.studio's editing capabilities - topographic/satellite maps and
create/cut/merge tools with routing that follows trails - reorganised around a different
product model (a cloud library, see ADR 0006). gpx.studio is MIT-licensed, which permits
commercial, closed-source derivatives; the only obligations are keeping the licence and
copyright notice and not reusing the gpx.studio name or logo.

Three options were considered:

1. **Build from scratch** - estimated 3–6 months to reach editor parity, with more
   initial bugs; contrary to the robustness goal.
2. **Fork and track upstream** - keeps upstream fixes flowing, but freezes the inherited
   code style and structure, because every refactor becomes a merge conflict; contrary to
   the code-ownership goal.
3. **Hard fork** - take the code once, never merge upstream again; full freedom to prune,
   rebrand, and progressively refactor to our own standards behind a test net.

## Decision

Hard fork. The code was imported once from
[gpxstudio/gpx.studio](https://github.com/gpxstudio/gpx.studio) at commit
`fde6bafc1052edf94854e942cb7b2b073aedbd8b` and `main` starts from it. There is no merge
cadence; upstream is watched and critical fixes are cherry-picked manually if needed.
Unwanted features are deleted aggressively, one deletion per commit, so anything can be
resurrected with a git revert.

## Consequences

- Full ownership: no upstream merge constraint on refactoring, naming, or structure.
- No automatic upstream bug fixes - the accepted cost. The gpx round-trip and statistics
  test suites exist partly to catch regressions when cherry-picking.
- MIT obligations: the original LICENSE and copyright notice are preserved at the repo
  root; upstream is credited in `website/src/lib/brand.ts` and `ATTRIBUTIONS.md`; the
  product uses its own name and logo.
- Inherited code does not yet meet our quality bar; it is refactored progressively (see
  CONTRIBUTING.md), never in a big-bang rewrite.
