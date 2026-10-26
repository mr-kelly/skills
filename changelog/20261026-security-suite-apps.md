---
title: 2026-10-26 Application security and compliance workspaces
---

# Application security and compliance workspaces

Date: 2026-10-26
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Build the application/API security audit and outbound SaaS cloud baseline/SOC 2 readiness skills. Finish the installable Busabase packages, screenshots, videos, website publication and CI verification.

**Refined Instructions:**
- Implement the approved security-suite plans as two independently installable skills.
- Keep API testing and AWS reads in the local trusted executor, with independent current scope authorization.
- Make findings, evidence periods, manual review, remediation and retesting visible in Busabase-backed responsive workspaces.
- Follow the latest reviewed busabase-app-creator contract and pin SDK/runtime versions.
- Publish actual interface captures and explicitly synthetic-data walkthroughs in both website languages.

## What Changed

- Added `kelly-appsec`: project and API inventory, explicit rules, local bounded test execution, source-review imports, attributed evidence, analyst review and original-case retesting.
- Added `kelly-compliance`: scoped SaaS programs, finite AWS baseline reads, existing report imports, control evidence and periods, gaps, exceptions and reverification.
- Added isolated integration and browser tests, package-input checks and CI registration.
- Registered both products in the skills catalog, with screenshot/video galleries and installable package metadata.

## Why

The customer's investigation shifted from suspected server compromise toward application authorization and business-rule weaknesses. These workspaces distinguish application audit and compliance readiness from the existing Linux intrusion investigation skill.

## Files Affected

- `skills/kelly-appsec/` — skill instructions, installable package, local executor and AirApp.
- `skills/kelly-compliance/` — skill instructions, installable package, report/AWS adapters and AirApp.
- `tests/app-skills/{kelly-appsec,kelly-compliance,security-suite-harness}/` — independent behavioral acceptance.
- `package.json`, `.github/workflows/ci.yml` — CI execution.
- `README.md`, `docs/README-zh-CN.md`, `.claude-plugin/marketplace.json`, `docs/` — catalog and generated website.
- `docs/proposals/security-suite/` — approved product scope and delivery evidence.

## Breaking Changes

None.

## Testing

Implementation and delivery verification are recorded in `docs/proposals/security-suite/verification.md`. Tests use controlled local API targets and disposable open-source Busabase instances. Real customer systems and AWS accounts are not used. Cloud OAuth is reported independently and remains environment-gated.
