# ADR 0003 - Self-hosted BRouter for routing

## Status

Accepted (2026-07). Client implemented (Phase 0); self-hosting in Phase 1.

## Context

Upstream's routing pointed at gpx.studio's private infrastructure and had to be replaced.
The routing engine must run on the same small VPS as the rest of the backend (ADR 0002),
support outdoor profiles (hiking, MTB, gravel), and cost nothing beyond the VPS.

Alternatives considered:

- **GraphHopper** - upstream also had a GraphHopper client; the hosted API is paid, and
  self-hosting needs several GB of RAM for a Europe-scale graph.
- **Valhalla** - capable, but heavier to operate (tile building, more RAM) than the VPS
  budget allows.
- **OSRM** - very fast but RAM-hungry (Europe car profile alone needs tens of GB) and one
  running instance per profile.

## Decision

**BRouter**, self-hosted. It runs in a 256 MB JVM heap and routes from prebuilt `rd5`
segment files (~3 GB for Europe), downloadable for free from
`https://brouter.de/brouter/segments4/`. A complete BRouter client already existed in the
inherited codebase, which de-risked the choice - it now lives in
`website/src/lib/components/toolbar/tools/routing/routing.ts` together with the
activity-to-profile map (bike→`trekking`, racing_bike→`fastbike`, gravel_bike→`gravel`,
mountain_bike→`mtb`, foot→`hiking-mountain`, motorcycle→`car-fast`, water→`river`,
railway→`rail`). The endpoint is env-driven (`PUBLIC_BROUTER_URL`); development uses the
public community server `https://brouter.de/brouter`, production the self-hosted instance.

## Consequences

- Routing fits on the €4.49/month VPS next to PocketBase; segment files refresh via a
  weekly cron.
- The public `brouter.de` server has no SLA - acceptable only as the development/interim
  default; the URL has been an environment variable from day one.
- Some activity profiles are not stock BRouter profiles and must be deployed as custom
  profiles on our server in Phase 1.
- The upstream GraphHopper client and the private-roads toggle (no BRouter equivalent)
  were deleted; BRouter's `WayTags` still supply surface/`sac_scale` data for track
  colouring.
