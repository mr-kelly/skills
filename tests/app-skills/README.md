# Canonical App Skill Tests

This directory verifies skills created under the `kelly-app-skill-creator`
contract. Skill-owned unit tests remain under `<skill>/app/test/`; this directory
owns cross-skill contract, process, browser, Busabase, and deployment-boundary
tests.

## Covered Skills

Five skills currently have the canonical `app/` project shape
(`app/package.json` with `dev`/`start` = `node server.js`) and a full test
suite here: `kelly-invest-stock`, `kelly-email`, `kelly-crm`,
`kelly-agent-builder`, `kelly-beauty-intel`. Skills still on the pre-Busabase
`app/` layout are skipped, not failed, until they're converted.

## Run All Covered Skills

Prerequisites are Node 24.18 or newer, pnpm, Python 3, and Playwright Chromium.

```bash
for skill in kelly-invest-stock kelly-email kelly-crm kelly-agent-builder kelly-beauty-intel; do
  pnpm --dir skills/$skill/app install --frozen-lockfile
done
python3 -m pip install -r tests/app-skills/requirements.txt
python3 -m playwright install chromium
npm run test:app-skills
```

The open-source local Busabase server has no account authentication, so OSS
and Cloud are separate commands, both runnable for all covered skills at once
or one skill at a time:

```bash
npm run test:app-skills:oss
npm run test:app-skills:cloud

npm run test:app-skills:oss:kelly-crm
npm run test:app-skills:cloud:kelly-crm
```

Each skill's OSS suite verifies:

- canonical app files, deterministic commands, resource-map alignment, and
  browser persistence boundaries;
- local server health/status, assets, disconnected state, and OAuth
  same-origin rejection;
- Demo navigation and responsive behavior at 1280x820, 390x844, and 360x740;
- resource provisioning against a pinned, temporary `busabase server`
  instance — a browser-driven lazy `ChangeRequest` for `kelly-crm`,
  `kelly-agent-builder`, and `kelly-beauty-intel`; the trusted
  `scripts/init_busabase_schema.ts --apply` CLI for `kelly-email` (see its
  SKILL.md — the AirApp only ever reads readiness, it never self-provisions);
- record creation through Busabase and readback through the app, including a
  full decision-write round trip for the three review-workflow skills
  (`kelly-crm`, `kelly-beauty-intel`) and `kelly-agent-builder`'s lifecycle
  gate;
- Busabase process restart persistence.

The Cloud command prints `SKIP` unless these are all configured:

- `KELLY_APP_CLOUD_BASE_URL`
- `KELLY_APP_CLOUD_TEST_EMAIL`
- `KELLY_APP_CLOUD_TEST_PASSWORD`

It then performs real browser OAuth, verifies server-side credential storage,
and revokes the session at teardown. It does not mutate Cloud data by default.
To test Cloud lazy provisioning, also set a dedicated
`KELLY_APP_CLOUD_TEST_SPACE_ID` and
`KELLY_APP_CLOUD_TEST_ALLOW_MUTATION=1`. Never point mutation mode at a personal
or production Space.

## Add Another Skill

Add its contract and local-server tests under `tests/app-skills/<skill>/`, reuse
the shared process harness, then add a browser workflow that declares the
skill's routes, resources, fixture records, and one representative read/write
flow. Keep provider network checks separate from deterministic app tests. Add
matching `test:app-skills:oss:<skill>` / `:cloud:<skill>` entries to the root
`package.json` and wire them into the aggregate `test:app-skills:oss` /
`:cloud` scripts.
