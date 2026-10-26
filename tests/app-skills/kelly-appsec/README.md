# Kelly AppSec acceptance

Run `node --test tests/app-skills/kelly-appsec/*.test.mjs`, then `python3 tests/app-skills/kelly-appsec/ui_test.py` and `python3 tests/app-skills/kelly-appsec/airapp_test.py`.

The OSS suite installs the actual package twice into a disposable Busabase 0.99.1 server, imports explicit policy inventory, and sends real HTTP requests to the controlled synthetic API in `fixtures/api.mjs`. It verifies cross-tenant object access, public access, data leakage under HTTP 403, inconclusive HTTP 200, redirect boundaries, scope/version binding, cancellation, live claims, pending writes, restart, cursor pagination, interrupted evidence recovery, immutable artifact hashes, symlink rejection, and affected-rule retests. It contacts no customer API.

The browser suite checks all seven routes at 1280×820, 1280×720, 390×844, and 360×740, including settings and seven themes. Native acceptance loads the merged AirApp in Busabase's actual browser engine, checks runtime and asset MIME types, creates a project, imports a rule, queues a run through the real UI, verifies actual SDK state, reloads, and checks phone controls. Native diagnostic screenshots are written under `/tmp/kelly-security-suite-acceptance/`.

`local-server.test.mjs` includes deterministic fake-upstream gateway cases; these are distinct from the real OSS/API/browser tests. `cloud_oauth_test.py` reports an explicit skip unless dedicated Cloud test credentials are configured. A configured Cloud check is OAuth-only and performs no Cloud mutations. Synthetic upstream tests do not establish live Cloud readiness.
