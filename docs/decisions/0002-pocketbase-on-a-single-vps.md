# ADR 0002 - PocketBase on a single VPS as the backend

## Status

Accepted (2026-07). To be implemented in Phase 1.

## Context

The cloud library (ADR 0006) needs authentication (Google sign-in), a database for the
Expedition/Adventure/Track tree, and storage for GPX files - at hobby-scale cost
(target ~€6/month total) and without vendor lock-in, since paid features may come later.

Alternatives considered:

- **Supabase** - good feature fit, but the free tier pauses projects after 7 days of
  inactivity and has a 1 GB storage ceiling; the first paid tier is a step change in cost.
- **Firebase** - requires the Blaze plan (credit card) for realistic use and creates
  significant lock-in (proprietary APIs, hard data egress).
- **Cloudflare stack (Workers/D1/R2)** - cheap, but authentication and file handling must
  be assembled by hand from parts; more moving pieces to own.

## Decision

**PocketBase** - a single Go binary providing Google OAuth out of the box, an embedded
SQLite database, file fields for GPX storage, and an admin UI - deployed on a **Hetzner
CX22 VPS (€4.49/month)** behind Caddy, alongside the self-hosted BRouter instance
(ADR 0003). Schema changes are versioned as `pb_migrations/` in git; backups go to
Cloudflare R2.

## Consequences

- Total infrastructure cost stays around €6/month; scaling to hundreds of users is a VPS
  resize, not a rewrite (SQLite is comfortable well beyond hobby scale).
- Zero lock-in: data is SQLite plus plain GPX files on disk, portable by design.
- We own operations: VPS hardening, backups with restore drills, and monitoring are our
  responsibility (specified in the Phase 1 plan; automated in `infra/`).
- PocketBase is pre-1.0: the version is pinned, release notes are read before upgrades,
  and a backup is taken before every upgrade.
- Collection API rules become the authorisation layer and must be explicitly tested
  (cross-user access attempts expecting 403/404).
