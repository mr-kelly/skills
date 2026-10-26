---
title: 2026-10-26 Plan AppSec and SaaS compliance workspaces
---

# Plan AppSec and SaaS compliance workspaces

Date: 2026-10-26
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> The customer's actual concern involves unsafe application interfaces and business workflows.
> Plan separate application/API security and cloud/SOC 2 compliance skills with the same visual
> Busabase workflow. Use existing best-practice skills where appropriate.

**Refined Instructions:**
- The user selected outbound SaaS, cloud security baselines and SOC 2 readiness as the compliance MVP.
- Separate intrusion investigation, application defects and compliance evidence lifecycle.
- Research primary sources and pinned reusable community skills, then define observable outcomes.

## What Changed

- Added a security-suite overview, AppSec plan and compliance plan under `docs/proposals/security-suite/`.
- Defined users, stories, matrices, scope, native resources, local execution, evidence and review states.
- Added failure scenarios, integration/browser acceptance, roadmap and source provenance.

## Why

API and business-logic defects require policy-aware application testing; SOC 2 readiness additionally
requires organizational and period evidence. A Linux incident checklist alone does not address
either complete workflow.

## Files Affected

- `docs/proposals/security-suite/README.md` — product boundaries and implementation order.
- `docs/proposals/security-suite/kelly-appsec.md` — application/API review and retest plan.
- `docs/proposals/security-suite/kelly-compliance.md` — cloud baseline and SOC 2 readiness plan.
- `docs/proposals/security-suite/sources.json` — primary sources, community revisions and user decision.

## Breaking Changes

None. Planning documents only; no skill app, cloud account, customer resource, scan or deployment
was created or changed.

## Testing

Checked local document links, parseable source metadata and hashes of reviewed community skills.
Implementation-level unit, integration, authorization and browser tests are specified in the plans;
they have not been executed for these unimplemented products.
