# Test Matrix

## Suite Boundaries

| Suite | Backend | Authentication | Mutation | Default cadence |
| --- | --- | --- | --- | --- |
| Contract | Filesystem | None | None | Every PR |
| Local smoke | App process | Disconnected/local bootstrap | None | Every PR |
| Demo UI | App process | Demo only | None | Every PR |
| OSS integration | Temporary `busabase server` | Open server | Temporary data only | Every PR |
| Cloud OAuth | Busabase Cloud | Browser OAuth | None by default | Environment-gated |
| Cloud full | Dedicated Cloud Space | Browser OAuth | Explicitly opted in | Scheduled/manual |
| AirApp | Deployed disposable AirApp | Ambient session | Target-scoped | Scheduled/release |
| Provider live | External provider | Provider-specific | None unless declared | Scheduled/manual |

OSS and Cloud are separate suites. A passing OSS suite does not validate OAuth;
a passing Cloud OAuth suite does not validate local PGlite persistence.

## Cloud Environment Contract

Run Cloud OAuth only when these are all non-empty:

- `KELLY_APP_CLOUD_BASE_URL`: exact HTTPS Busabase Cloud origin.
- `KELLY_APP_CLOUD_TEST_EMAIL`: dedicated test account email.
- `KELLY_APP_CLOUD_TEST_PASSWORD`: dedicated test account password.

Optional variables:

- `KELLY_APP_CLOUD_TEST_SPACE_ID`: dedicated Space targeted by proxied API
  requests. Require it for mutations.
- `KELLY_APP_CLOUD_TEST_ALLOW_MUTATION=1`: permit lazy provisioning and other
  declared test mutations in that dedicated Space. Ignore any other value.

If any required variable is absent, exit successfully only after printing
`SKIP` and the missing variable names. Never print their values. If mutation is
enabled without a Space ID, fail configuration before opening the browser.

## Contract Assertions

- Required canonical files and frozen lockfile exist.
- Runtime scripts, Node engine, exact SDK, and generated bundles match.
- Resource map and runtime declarations agree on app id, schema version,
  resource keys, slugs, fields, procedure allowlists, and lazy mode.
- Browser source contains no API key, token, Vault read, Authorization header,
  domain-state filesystem fallback, or durable browser persistence.
- Standalone-only OAuth routes and deployed ambient-session behavior remain
  separated.

## Local And Demo Assertions

- Start on a random loopback port; wait on `/health`; terminate cleanly.
- Verify root and canonical assets, content types, no-store behavior, and no
  unexpected 404, console error, or page error.
- Verify disconnected connection UI, same-origin OAuth start rejection, custom
  URL validation, and Demo labeling.
- At 1280x820, 390x844, and 360x740, verify navigation, list/detail, history,
  sidebar/drawer/scrim, modal, keyboard escape, and horizontal overflow.

## OSS Assertions

- Start a pinned Busabase package with random loopback port and temporary
  `--data` directory.
- Start the app with `BUSABASE_BASE_URL` and no browser token.
- From an empty workspace, create exactly one declared structural CR.
- Verify the exact app Folder, Bases, fields, metadata, and no duplicate
  resources after reload, concurrent initialization, or app restart.
- Seed representative canonical records through Busabase, then read them through
  the app's real provider.
- Restart Busabase with the same data directory and verify resources and records
  persist.
- Cover unavailable, unauthorized, forbidden, pending approval, schema
  conflict, partial materialization, and retry behavior in focused tests.

## Cloud OAuth Assertions

- Start the app with a temporary `HOME` and without `BUSABASE_BASE_URL` or an API
  key so OAuth cannot be bypassed.
- Select the configured Cloud origin, complete browser email/password login and
  consent when shown, and return through the local callback.
- Verify `/auth/status` reports the sanitized Cloud origin and server-side OAuth
  source.
- Verify state/PKCE exchange succeeds, callback parameters contain no token, and
  local browser storage, DOM, URL, console, and screenshots contain no token.
- In OAuth-only mode, do not click initialization or perform Cloud mutations.
- In mutation mode, require the dedicated Space ID, verify lazy provisioning and
  idempotency, and clean only artifacts owned by the test app.
- Call logout/revoke at teardown, verify local credential cleanup, and fail if
  teardown cannot revoke an issued session.

## AirApp Assertions

- Confirm the merged AirApp file manifest and source hashes match the canonical
  local project.
- Run under ambient Busabase session without local `/auth/status` or
  `/auth/start` gates.
- Repeat representative workflow, recovery, resource, desktop, and phone
  assertions against the deployed URL.
- Report the exact AirApp URL and revision tested.

## Reporting

Report totals for app-owned unit tests and repository-level tests. List each
external suite separately as pass, fail, or skip. A skipped suite must name the
missing configuration and the behavior that remains unverified.
