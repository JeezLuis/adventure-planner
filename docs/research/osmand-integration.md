# OsmAnd integration - feasibility study and proposal

Status: research complete, proposal not yet decided (2026-07-16). Candidate for an ADR
once we commit to a phase 1 scope. Written while `feat/ferry-trip` was checked out; the
content is independent of the ferry work.

Direction confirmed so far (2026-07-16): adventures get an "Export to OsmAnd" action
producing the `.osf` adventure package (option B below). Phase 1 is implemented on the
`feat/osmand-export` branch ("Send to OsmAnd" in the File menu, see
`website/src/lib/logic/osmand/`); the device-test list below still applies. Under investigation for the
Adventure profile: map orientation locked to movement direction, the offroad style as
default map theme, speed-based auto zoom, and a way to read distance done / distance
remaining at any point of a displayed track without starting navigation.

## Question

Can we ship a one-button "send this adventure to OsmAnd" experience, as an OsmAnd
plugin rather than a fork, where:

1. tracks arrive pre-colored (main tracks vs alternative routes),
2. the metadata of advanced adventures is visible inside OsmAnd,
3. a predefined mode ships with a map style similar to our offroad-classification layer,
4. POIs keep their color and icon in an OsmAnd-compatible format?

## Verdict

Feasible on all four counts using only official OsmAnd extension surfaces. "Plugin" in
OsmAnd terms is not compiled code; it is a **custom plugin package** (`.osf` file, a
renamed zip with an `items.json`) plus **OsmAnd's GPX dialect**, optionally driven by the
**AIDL inter-app API** for a fully silent one-tap flow. The exact pattern we need is
already shipped by community projects that OsmAnd showcases in its own docs and blog:
the [Motorcycle/Enduro project](https://github.com/OsmAnd-Rendering/Motorcycle) and the
[Outdoor Explorer dirtbike plugin](https://github.com/cmoffroad/osmand-dirtbike-plugin)
(offroad classification style + profiles + routing, installed by opening one `.osf`).

| Requirement | Mechanism | Confidence |
| --- | --- | --- |
| Pre-colored main/alternates | `osmand:color` per `<trk>`, or per-file appearance in an `.osf` package | High (documented + source-verified) |
| Width / arrows / start-finish defaults | File-level GPX extensions, or per-track-file `.osf` appearance | High |
| Metadata visualization | `<metadata><desc>` with HTML, extension tags listed in UI (Android 5.0+), `osmand:activity` | High, with UI limits |
| Offroad map + predefined mode | Custom rendering style + custom `routing.xml` + app profile in one `.osf` | High (proven in the wild) |
| POI color + icon | `osmand:icon/color/background` per `<wpt>` + `osmand:points_groups` | High (documented) |
| One button | Graded: open-with baseline; `osmand.net/open-gpx` link (Android); AIDL companion app (Android) | Medium to High per path |

## OsmAnd's official extension surfaces

1. **GPX dialect.** Namespace `xmlns:osmand="https://osmand.net/docs/technical/osmand-file-formats/osmand-gpx"`.
   File-level `<gpx><extensions>`: `color`, `width` (`thin|medium|bold|1..24`),
   `show_arrows`, `show_start_finish`, `split_type`, `split_interval`, `coloring_type`
   (incl. `routeInfo_surface`, `routeInfo_smoothness`), `color_palette`, 3D options.
   Track-level `<trk><extensions>`: `osmand:color` only (no per-track width; confirmed by
   an OsmAnd dev in [issue 21692](https://github.com/osmandapp/OsmAnd/issues/21692)).
   Waypoint-level: `osmand:icon`, `osmand:color`, `osmand:background`
   (`circle|square|octagon`), `osmand:address`; plus `osmand:points_groups` at file level
   (group = the waypoint's `<type>`, with per-group `color/icon/background/hidden`).
   Metadata-level: `osmand:activity` (IDs from
   [activities.json](https://github.com/osmandapp/OsmAnd-resources/blob/master/poi/activities.json),
   e.g. `off_road_motorcycling_dirt_biking`).
2. **Custom plugin (`.osf`).** Zip + `items.json`; installable by opening the file
   (Android since OsmAnd 3.7, iOS since 4.0, free app included). Item types include
   `PLUGIN` (name, icon, description), `PROFILE` (full app profile incl. selected map
   style, routing, widgets, icon/color, optional drawer logo/URL), `FILE` with subtypes
   `rendering_style` and `routing_config`, `MAP_SOURCES`, `POI_UI_FILTERS`,
   `QUICK_ACTIONS`, `FAVOURITES`, `GPX`/`GPX_DIR`, `DOWNLOADS`/`SUGGESTED_DOWNLOADS`.
   Docs: [custom plugins](https://docs.osmand.net/docs/user/plugins/custom/),
   [import/export](https://docs.osmand.net/docs/user/personal/import-export).
3. **AIDL API + intents (Android, free app, no registration).** `importGpx` (URI +
   color + show), `copyFileV2` (chunked; `.gpx` into `tracks/` auto-shows,
   `favourites.gpx` reloads favorites, `.obf` reloads maps), `importProfile` (imports an
   `.osf`), `selectProfile`, `navigateGpx`, favorites/markers CRUD, live custom point
   layers, widgets, UI customization. Docs:
   [osmand-api-sdk](https://osmand.net/docs/technical/osmand-api-sdk/),
   [api demo](https://github.com/osmandapp/osmand-api-demo).
   Also: OsmAnd deep-links `https://osmand.net/open-gpx?url=...&name=...` and downloads
   the GPX itself (source-verified in `IntentHelper.parseOpenGpxIntent`; undocumented).

## Requirement analysis

### 1. Track coloring (main vs alternates)

Per-`<trk>` `<osmand:color>` inside one file is officially supported
([appearance docs](https://docs.osmand.net/docs/user/map/tracks/appearance#track-colors-in-gpx-files)).
Colors accept `#RRGGBB` and `#AARRGGBB`, so "50% opacity green" is `#8000FF00` (alpha
0x80). Constraints:

- A file-level `osmand:color` overrides per-track colors; the exporter must omit it
  when tracks differ.
- `width`, `show_arrows`, `show_start_finish`, splits are file-level only.
- Version window: per-track color broke in 4.9.0-4.9.10, fixed January 2025; fine on
  4.8.x and current 5.x. Support statement: "OsmAnd 4.8 or 5.0+".
- OsmAnd's in-app appearance editor is per file; once a user edits appearance in-app,
  values live in OsmAnd's own database and shadow the file ("Reset to original" reverts).
- Incidental: OsmAnd flattens extension names, so our current `gpx_style:color` is read
  when `#`-prefixed; our writer strips `#` (`gpx/src/gpx.ts`, `setStyle`). Do not rely
  on this; write explicit `osmand:color`.

### 2. POIs with color and icon

Per waypoint: `osmand:icon` + `osmand:color` + `osmand:background`. Better: give each
waypoint a `<type>` equal to its category and emit one `<osmand:points_groups>` block so
OsmAnd shows collapsible, hideable groups. Favorites (`favourites.gpx`) use the exact
same vocabulary if we ever deliver POIs as favorites instead.

Needed on our side:

- Mapping table from our Lucide symbol keys (`website/src/lib/assets/symbols.ts`) to
  OsmAnd icon names. Canonical picker list:
  [poi_categories.json](https://github.com/osmandapp/OsmAnd-resources/blob/master/poi/poi_categories.json)
  (unknown names fall back to `special_star`). Category colors map 1:1 from
  `symbolCategoryColors`.
- Model fix: our `Waypoint` class drops `<wpt><extensions>` on write
  (`gpx/src/gpx.ts`, `toWaypointType`); the gpx package needs a waypoint extensions
  field plus namespace wiring in `gpx/src/io.ts`.

### 3. Metadata visualization

What OsmAnd can show, and where the user finds it (Android; iOS similar minus item 3):

1. **Track context menu > Overview tab**: the Description card renders
   `<metadata><desc>` including HTML (`<b> <i> <p> <br> <a> <img>`); first paragraph
   doubles as the collapsed summary; "Read full" opens the whole document. Our
   `planDoc` markdown converts to that HTML subset (checklists as line items, tables as
   preformatted text; Android's HTML view has no real `<table>` support).
2. **Overview > Info block**: activity (`osmand:activity`), `<keywords>`, `<link>`,
   author/copyright.
3. **Overview > bottom tag list** (Android 5.0+): every `<metadata>`/`<gpx>` extension
   tag is listed raw. Numbering mode, start date, buffer days, alternative flags can be
   emitted as flat, readable tags (unique local names; never reuse `color`/`width`).
4. **Points tab**: waypoint groups with our icons/colors; per-point description and
   address fields.

Caveats: OsmAnd rewrites extensions lossily when the user edits a track in-app (our
`ap:data` payload would come back re-namespaced as `osmand:data` and flattened). OsmAnd
is a one-way consumer; source of truth stays in Adventure Planner.

### 4. Offroad-classification map + predefined mode

- **Rendering style**: a `depends="default"` `render.xml` porting `OFFROAD_COLORS`
  (`website/src/lib/assets/layers.ts`): tracktype grade1 `#77c15b` to grade5 `#d63a2f`,
  ungraded brown `#9c6b3f`, paths teal, bridleways purple, with our surface-to-grade
  fallback. OsmAnd's offline vector maps already carry `tracktype`, `surface`,
  `smoothness`, `sac_scale` (the default style has 16 tracktype rules and "Road
  surface"/"Road quality" toggles), so the style works worldwide, offline, with zero
  tile hosting. `renderingProperty` entries give users on/off toggles.
- **Routing**: a custom `routing.xml` "Adventure" profile; `surface` (141 uses),
  `smoothness` (38) and `tracktype` (23) are first-class in OsmAnd's routing config, and
  the Enduro project ships three such profiles.
- **Profile**: a `PROFILE` item creates the "Adventure" mode with our icon/color, the
  style preselected, the routing profile bound, widget layout, optionally drawer
  logo/URL branding.
- All of it packaged in one `.osf` custom plugin with our name/icon/description.

## Import behavior and the "styled folder" automation

Two delivery shapes for an adventure, with different import behavior:

**A. Single multi-track GPX (one `<trk>` per track).** OsmAnd's import screen appears
("review all tracks, select the ones to import, choose a destination folder, or Import
as one track"). Kept separate, each track keeps its own `osmand:color`; "Import as one
track" flattens colors. Width/arrows/start-finish ride at file level while it is one
file; behavior after OsmAnd splits tracks into separate files is not documented and
needs a device test. Good for quick sharing, not for the curated-folder experience.

**B. Adventure package `.osf` (recommended).** `items.json` carries one `GPX` item per
track file targeting `tracks/<Adventure name>/...` (zip paths preserve subfolders), and
each item embeds a `GpxAppearanceInfo` block that OsmAnd writes into its appearance
database on import. Source-verified JSON keys (`GpxAppearanceInfo.java`,
`GpxSettingsItem.java`): `color` (string, alpha supported), `width` (string, `1..24` or
names), `show_arrows`, `show_start_finish`, `split_type`, `split_interval`,
`coloring_type`, `color_palette`, 3D fields. Illustrative item:

```json
{
  "type": "GPX",
  "file": "tracks/Pyrenees 2026/03 - Coll de Pal.gpx",
  "color": "#FF00FF",
  "width": "20",
  "show_arrows": true,
  "show_start_finish": true
}
```

This reproduces, in one tap, the manual ritual of creating a folder and styling every
track by hand: main tracks e.g. magenta `#FF00FF`, alternates green at 50% opacity
`#8000FF00`, width 20, arrows on, start/finish on, all per track file, no file-level
limitation involved. Waypoints stay inside each track's GPX with `points_groups`
(option: also a `FAVOURITES` item for adventure-wide POIs). Re-import of an updated
package triggers OsmAnd's replace/keep-both dialog. Exact field set should be confirmed
once by styling a track in OsmAnd, exporting it as `.osf`, and diffing.

## One-button delivery, ranked

1. **Baseline (Android + iOS, two taps):** download the `.gpx`/`.osf`, open with OsmAnd.
   Android has intent filters for both; iOS registers GPX and OSF document types
   (share sheet / Files).
2. **Web link, Android, one tap:** `https://osmand.net/open-gpx?url=<public-url>&name=...`
   makes OsmAnd itself download a GPX (not `.osf`). Needs a public short-lived URL from
   PocketBase. Undocumented (source-only), so always keep path 1 as fallback.
3. **Companion Android app (full one-tap, silent):** AIDL `importProfile` pushes the
   whole adventure `.osf` (and the plugin `.osf`), `copyFileV2`/`importGpx` push tracks
   directly (auto-show on map), `navigateGpx` starts turn-by-turn. Free OsmAnd, no
   registration, no fork.
4. **Not viable:** Web Share of `.gpx` from Chrome/Android (Chromium file-type
   allowlist blocks it); OsmAnd Cloud HTTP APIs (exist, but unofficial and Pro-gated).

## Adventure profile preconfiguration (2026-07-16 follow-up)

All requested behaviors are per-profile settings, so they ship inside the `.osf`
PROFILE item:

- **Map orientation = Movement direction.** Four modes exist (North is up, Movement
  direction, Compass, Manually rotated), per profile, under Settings > Profiles >
  General settings > Appearance > Map orientation
  (https://docs.osmand.net/docs/user/map/interact-with-map).
- **Map style = our offroad rendering style.** The PROFILE item's `prefs` carry
  `renderer` (and `routing_profile`), per the custom plugin docs sample.
- **Auto zoom by speed.** Setting "Auto zoom" (levels: none, long-range ~200 m,
  mid-range ~100 m, close-up ~5 m), per profile, under Navigation settings > Map during
  navigation; docs: "Automatically scale the map according to your speed, as long as the
  map is synchronized with your current position"; inactive below ~7 km/h
  (https://docs.osmand.net/docs/user/navigation/guidance/map-during-navigation).
  Ambiguity: another docs page frames auto zoom as a navigation-time feature; whether it
  engages while merely following position without turn-by-turn needs a one-minute field
  test. Worst case it engages only during (recalculation-free) track navigation.

## Distance done / remaining along a displayed track

User need: while riding with a track merely displayed (no navigation, for performance),
know at any point how many km are behind and how many remain.

Options, from cheapest to deepest:

1. **Milestone waypoints (exporter feature, recommended).** Generate a waypoint every
   N km named e.g. "120 km | 85 left" in a dedicated points group (own icon/color,
   hideable). Glanceable anywhere, zero OsmAnd changes.
2. **Split marks.** `split_type=distance` + `split_interval` render interval marks along
   the line (packageable in the `.osf` appearance). Docs do not specify the label
   content; verify on device what the labels show.
3. **Native, arriving anyway:** issue #22996 (exact km at the cursor position in the
   track overview graph) is closed, assigned, milestone 5.2-android
   (https://github.com/osmandapp/OsmAnd/issues/22996). Current builds likely already
   show km-at-cursor in Analyze on map / overview graphs; check on device.
4. **Navigation-lite.** GPX navigation can follow the original track without
   recalculation ("Original track", straight-line start/end, attach-to-roads off,
   deviation recalculation configurable), which lights up remaining-distance widgets
   (https://docs.osmand.net/docs/user/navigation/setup/gpx-navigation). Needs a
   performance test ride on the user's device.
5. **Companion app widget (Android).** AIDL `addMapWidget`/`updateMapWidget` with text
   computed by projecting the phone's GPS onto the track: live "km left from here". No
   tap events on OsmAnd's track layer are exposed to external apps, so a tap-driven
   popup cannot be a companion feature.
6. **Upstream contribution.** A "distance from start / remaining at tapped track point"
   popup in the track context menu does not exist. Related asks: #22996 (done for 5.2),
   #23322 "Distance and time to next marker along the track" widget (open, labeled
   Nice to Have, no milestone). OsmAnd Android code is GPLv3 and PRs are accepted under
   MIT with credit in AUTHORS, so an outside feature PR is a normal path; recommended
   flow is issue-first referencing #22996/#23322, then a focused PR. Slower and not
   guaranteed; the exporter tricks above cover the need meanwhile.

## Proposal

Three deliverables, phased:

1. **Phase 1 - "Export for OsmAnd" (web app only).**
   Export dialog with style options (main color, alternate color + opacity, width,
   arrows, start/finish; defaults remembered per user), producing either the adventure
   `.osf` package (default) or a single OsmAnd-flavored GPX (for path 2 sharing). Emits
   per-trk/appearance colors, `points_groups` + icon mapping, `osmand:activity`,
   planDoc markdown rendered to OsmAnd's HTML subset, readable metadata tags.
   Touchpoints: `gpx/src/types.ts`, `gpx/src/gpx.ts`, `gpx/src/io.ts` (waypoint
   extensions + osmand namespace), `website/src/lib/components/export/utils.svelte.ts`,
   new symbol mapping module, a client-side zip dependency (e.g. fflate) for `.osf`.
2. **Phase 2 - "Adventure Planner plugin" `.osf` (one-time install).**
   Offroad-classification rendering style, Adventure profile, offroad `routing.xml`,
   optional extras: quick actions (toggle classification, switch profile),
   `POI_UI_FILTERS` (fuel/water/camp search filter), `MAP_SOURCES` for raster overlays
   we already use, `SUGGESTED_DOWNLOADS` (contours/hillshade). Static asset in the repo,
   downloadable from the app; versioned via `pluginId` + `version`.
3. **Phase 3 (optional) - companion Android app** for the true one-button flow and
   navigation handoff; later, ask the OsmAnd team (Telegram) about their curated in-app
   plugin catalog.

## Risks and open questions (device-test list)

- Per-track colors require OsmAnd 4.8/5.0+; document the minimum version.
- `.osf` GPX appearance fields: confirm exact schema by diffing an OsmAnd export
  (one-time task). Verify alpha colors and width "20" render as expected.
- Whether `.osf`-imported tracks can arrive pre-visible on the map (AIDL paths can
  force-show; plain `.osf` import may need the user to enable the folder once).
- Multi-track GPX split-on-import behavior for file-level width/arrows (path A only).
- iOS: custom rendering styles and `.osf` install work per docs and community projects,
  but our style + package need a real-device pass; no AIDL/no open-gpx there.
- HTML subset in descriptions: verify images and long documents on both platforms.
- `osmand.net/open-gpx` is undocumented and could change; feature-detect nothing,
  just keep the download fallback.
- OsmAnd re-serializes foreign GPX extensions lossily on in-app edits (accepted:
  one-way flow).

## Sources

- GPX dialect: https://docs.osmand.net/docs/technical/osmand-file-formats/osmand-gpx
- Track appearance: https://docs.osmand.net/docs/user/map/tracks/appearance
- Track context menu: https://docs.osmand.net/docs/user/map/tracks/track-context-menu
- Custom plugins: https://docs.osmand.net/docs/user/plugins/custom/
- Import/export: https://docs.osmand.net/docs/user/personal/import-export
- Rendering style format: https://osmand.net/docs/technical/osmand-file-formats/osmand-rendering-style/
- Rendering templates: https://github.com/osmandapp/OsmAnd-resources/tree/master/rendering_styles
- Routing format: https://osmand.net/docs/technical/osmand-file-formats/osmand-routing-xml/
- API/SDK: https://osmand.net/docs/technical/osmand-api-sdk/ and https://github.com/osmandapp/osmand-api-demo
- Icon list: https://github.com/osmandapp/OsmAnd-resources/blob/master/poi/poi_categories.json
- Activities: https://github.com/osmandapp/OsmAnd-resources/blob/master/poi/activities.json
- Community precedents: https://github.com/OsmAnd-Rendering/Motorcycle and
  https://github.com/cmoffroad/osmand-dirtbike-plugin
- Source files verified on master: `OsmAnd-shared/.../GpxUtilities.kt`, `GpxFile.kt`,
  `GpxExtensions.kt`, `OsmAnd/.../backup/GpxAppearanceInfo.java`,
  `backup/items/GpxSettingsItem.java`, `aidlapi/IOsmAndAidlInterface.aidl`,
  `plus/helpers/IntentHelper.java`, `AndroidManifest.xml`, iOS `OsmAnd-Info.plist`,
  `DeepLinkParser.swift`
- Relevant GitHub issues: per-trk colors 21692/19995, appearance DB precedence
  discussion 17015, multi-track handling discussion 17022
