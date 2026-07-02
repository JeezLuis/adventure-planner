<picture>
  <source media="(prefers-color-scheme: dark)" srcset="website/static/logo-dark.svg">
  <img alt="Logo of Adventure Planner." src="website/static/logo.svg">
</picture>

**Adventure Planner** is a web app for planning outdoor adventures: create, edit, and organize GPX tracks on topographic and satellite maps, with routing that follows roads and trails.

It is a hard fork of [gpx.studio](https://github.com/gpxstudio/gpx.studio) (MIT license - see [LICENSE](LICENSE) and [ATTRIBUTIONS.md](ATTRIBUTIONS.md)), forked at commit `fde6bafc1052edf94854e942cb7b2b073aedbd8b`, extended with a cloud library (Expeditions ▸ Adventures ▸ Tracks), Google sign-in, and automatic sync.

## Repository structure

- [`gpx/`](gpx/) - TypeScript library for parsing, manipulating, and serializing GPX files (with tests).
- [`website/`](website/) - the SvelteKit app (static build).
- [`docs/decisions/`](docs/decisions/) - architecture decision records.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) - how the system fits together.

## Development

Requirements: Node 22+.

```bash
# 1. Build the GPX library
cd gpx && npm install && npm run build && npm test

# 2. Configure the website environment
cd ../website
cp .env.example .env   # then put your MapTiler key in .env (free account: cloud.maptiler.com)

# 3. Run the app
npm install
npm run dev
```

> **Security note:** `.env` files hold your keys and are git-ignored - never commit them. Only `.env.example` (placeholders) belongs in git. CI runs a secret scan (gitleaks) on every push.

## External services

All map/routing services are configured through environment variables (see [`website/.env.example`](website/.env.example) and [`website/src/lib/config.ts`](website/src/lib/config.ts)):

| Service | Provider | Notes |
|---|---|---|
| Basemaps (outdoor, satellite, topo) | MapTiler Cloud | free tier is non-commercial; key restricted by origin |
| Routing | BRouter (public `brouter.de` in dev; self-hosted in production) | |
| Elevation & 3D terrain | AWS Open Data Terrain Tiles | keyless |
| Geocoding | Nominatim | fair-use policy |

## License

MIT. Based on [gpx.studio](https://github.com/gpxstudio/gpx.studio), © gpx.studio contributors - the original license and copyright notice are preserved in [LICENSE](LICENSE).
 