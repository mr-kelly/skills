# Canonical App Skill Tests

This directory verifies skills created under the `kelly-app-skill-creator`
contract. Skill-owned unit tests remain under `<skill>/app/test/`; this directory
owns cross-skill contract, process, browser, Busabase, and deployment-boundary
tests.

## Run Kelly Invest Stock

Prerequisites are Node 24.18 or newer, pnpm, Python 3, and Playwright Chromium.

```bash
pnpm --dir skills/kelly-invest-stock/app install --frozen-lockfile
python3 -m pip install -r tests/app-skills/requirements.txt
python3 -m playwright install chromium
npm run test:app-skills
```

The suite currently verifies:

- canonical app files, deterministic commands, resource-map alignment, and
  browser persistence boundaries;
- local server health, assets, disconnected state, and OAuth same-origin
  rejection;
- Demo navigation and responsive behavior at 1280x820, 390x844, and 360x740;
- lazy provisioning against a pinned, temporary `busabase server` instance;
- one structural ChangeRequest, one app Folder, and four declared Bases;
- record creation through Busabase and readback through the app;
- App restart idempotency and Busabase process restart persistence.

The open-source local Busabase server has no account authentication, so OSS and
Cloud are separate commands:

```bash
npm run test:app-skills:oss
npm run test:app-skills:cloud
```

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
flow. Keep provider network checks separate from deterministic app tests.
