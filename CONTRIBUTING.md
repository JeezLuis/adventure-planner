# Contributing

This document sets the working standards for the repository. For what the system *is*,
read [ARCHITECTURE.md](ARCHITECTURE.md) first; decisions and their rationale live in
[`docs/decisions/`](docs/decisions/).

## Development setup

Follow the steps in [README.md](README.md#development): build and test `gpx/`, copy
`website/.env.example` to `website/.env` and add your own MapTiler key, then run the app
from `website/`. Node 22+ is required.

## Code standards

- **TypeScript strict** throughout. No `any` in new code unless there is no alternative,
  and then with a comment saying why.
- **Self-explanatory names** - no cryptic abbreviations; a reader should not need the git
  history to understand an identifier.
- **TSDoc on every exported function, class, and module**, stating *intent and
  invariants* (what callers may rely on), not restating the signature. Modules get a
  header comment explaining their role - see `website/src/lib/config.ts` or
  `website/src/lib/assets/layers.ts` for the expected style.
- **Two-tier expectations** (this is a hard fork with inherited code):
  - *New modules* meet the bar immediately.
  - *Inherited code* is refactored progressively, module by module, behind tests - apply
    the boy-scout rule to every file you touch, but never a big-bang rewrite. Robustness
    over aesthetics.
- Formatting and linting: Prettier and ESLint configs are in the repo
  (`npm run lint` / `npm run format` in `website/`, `gpx/`). These are advisory in CI
  today because of inherited violations, but new code must pass them.

## Commit conventions

Conventional commits, as in the existing history (`git log --oneline`):

```
feat(brand): rebrand to Adventure Planner
test(gpx): add round-trip and statistics suites; ci: add GitHub Actions pipeline
chore(landing)!: replace marketing landing page with a redirect to the app
```

Format: `type(scope): summary`, with `!` for breaking/removal changes. Types in use:
`feat`, `fix`, `test`, `chore`, `docs`, `refactor`. Keep deletions of inherited features
in their own commits so they can be reverted individually.

## Security rules

- **Never commit `.env` files, keys, or any secret.** Only `.env.example` (placeholders)
  belongs in git; `.gitignore` enforces this and CI runs a gitleaks scan over the full
  history as a hard gate.
- If a secret is ever committed - even briefly, even on a branch - **rotate it
  immediately**. Removing it from git history is not sufficient.
- `PUBLIC_*` environment variables are baked into the client bundle and are visible to
  every visitor: they are non-secrets by definition. Anything that must stay private
  (OAuth client secrets, server keys) never enters this repository or the frontend build
  environment.
- `.claude/settings.json` denies AI-assistant reads of `.env*`, key files, and `pb_data/`;
  do not weaken these rules.

## Tests

- The `gpx/` Vitest suites (`cd gpx && npm test`) must pass; they are a blocking CI gate.
  Note that tests import from `gpx/src`, not `gpx/dist` (the compiled output is only
  resolvable by bundlers - see the gpx engine notes in ARCHITECTURE.md).
- **Add tests for new logic**, especially anything touching GPX serialization,
  statistics, or the file-state/undo pipeline. Refactors of inherited modules should add
  tests *first*, then refactor behind them.
- CI (`.github/workflows/ci.yml`) runs on every push and PR: gitleaks (blocking),
  gpx build + tests and the website production build (blocking), and lint /
  `svelte-check` / `npm audit` (advisory until the inherited issues are cleaned up -
  do not add new violations).
