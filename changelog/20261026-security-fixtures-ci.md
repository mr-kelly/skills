---
title: 2026-10-26 Package Security SSH lab fixtures for CI
---

# Package Security SSH lab fixtures for CI

Date: 2026-10-26
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> The merged Kelly Security website still returns 404. Check whether CI is still running and
> repair the failure that prevents Pages from publishing the gallery and walkthrough.

**Refined Instructions:**
- Preserve the real SSH integration test and package every Docker build input.
- Do not change the application's behavior, skip tests, or weaken the repository's log exclusions.
- Verify the build from a clean checkout containing only tracked files.

## What Changed

- Rename the three synthetic authentication, Web access and audit log fixtures to `.fixture`.
- Copy them into the container under the `.log` names expected by the existing lab bootstrap.
- Add a fast contract check that verifies every Docker `COPY` source exists and is non-empty.
- Run the package-input checks before the long application suites so missing committed fixtures
  fail early instead of after the rest of the catalog has been tested.

## Why

The fixtures were present in the developer's workspace but excluded by the root `*.log` ignore
rule. GitHub's clean checkout therefore lacked the files, so the real SSH lab Docker build failed
before execution and the dependent Pages deployment was skipped. The fixture data is deliberately
synthetic (documentation IP addresses and `synthetic-` credential markers), not customer logs.

## Files Affected

- `tests/app-skills/kelly-security/fixtures/ssh-lab/auth.fixture` — synthetic SSH and sudo events.
- `tests/app-skills/kelly-security/fixtures/ssh-lab/web-access.fixture` — synthetic Web requests.
- `tests/app-skills/kelly-security/fixtures/ssh-lab/audit.fixture` — synthetic audit event.
- `tests/app-skills/kelly-security/fixtures/ssh-lab/Dockerfile` — explicit source-to-runtime mappings.
- `tests/app-skills/kelly-security/contract.test.mjs` — Docker context preflight.
- `.github/workflows/ci.yml` — run the package-input check before application integration suites.

## Breaking Changes

None. Container-side paths and the tested investigation behavior are unchanged.

## Testing

- The contract suite passes all seven tests, including the Docker context preflight.
- Removing `audit.fixture` makes the preflight fail with the exact missing input before any
  Docker or Busabase provisioning; restoring the source makes it pass again.
- A real Docker build passes all four explicit `COPY` instructions with the renamed fixtures.
- Publication verification independently repeats the build from the committed-file archive to
  reproduce GitHub's clean checkout boundary, then runs the actual OpenSSH/Busabase suite.

Independent verification: a Git-tree archive contained the three `.fixture` files and no ignored `.log` files. All seven contract tests and all eight real Docker/OpenSSH/OSS integration tests passed from that clean archive; the full investigation persisted 12 checks, 40 evidence records and 6 review leads. Root lint/typecheck and both repository policy audits passed.
