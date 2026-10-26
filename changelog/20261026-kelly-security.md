---
title: 2026-10-26 Kelly Security Linux intrusion investigation
---

# Kelly Security Linux intrusion investigation

Date: 2026-10-26
Author: AI Assistant
AI Agent: Codex

## Prompts & Instructions

**Original Request:**
> Create a security skill in mr-kelly/skills for a customer who suspects Linux intrusion.
> Adapt existing security skills; create an original visual checklist and multi-server UI,
> with SSH execution on the operator's local machine and Busabase as the shared workspace.
> Follow the latest busabase/skills busabase-app-creator.

**Refined Instructions:**
- The user approved the concrete six-resource blueprint before implementation.
- Prioritize intrusion evidence, access and audit records, persistence, source integrity and gaps.
- Preserve local SSH credentials and raw evidence; keep UI requests separate from execution.
- Use a complete runtime-bound Busabase package and canonical AirApp source.

## What Changed

- Added `kelly-security`, its manual, Linux acquisition/analysis/reporting code and source credits.
- Added multi-server matrix, checklist, evidence timeline, review, onboarding and mobile controls.
- Added typed Busabase resources, exact ownership indexes, native Views, prompts, guide and Drive.
- Added reproducible domain, browser, gateway, actual SSH/OSS and AirApp verification suites.
- Registered the skill in bilingual documentation, marketplace and generated site/catalog.

## Why

An investigator needs attributable evidence and explicit uncertainty rather than an unqualified
security score. Independent forward tests caught parser, redaction, provenance, ownership,
pagination and mobile interaction defects before delivery. Real OSS tests also established the
required scalar query indexes and the installer's physical field-order contract.

## Files Affected

- `skills/kelly-security/` — complete skill, package, app, checks, references and media.
- `tests/app-skills/kelly-security/` — reusable isolated acceptance tests and fixtures.
- `README.md`, `docs/README-zh-CN.md` — discovery entries.
- Repository manifests, scripts and generated `docs/` — catalog and CI registration.

## Breaking Changes

None. The new package's schema version 2 is its initial distributed model; no existing released
Kelly Security workspace is migrated or repurposed.

## Testing

Domain regressions cover source-aware detection, redaction, timestamps, claims, authorization,
cancellation and recovery. Browser acceptance covers four viewports, two themes, review visibility,
server isolation and 72-check pagination. Real OpenSSH executes all twelve recipes in a disposable
Linux container against fixture data. OSS integration validates installation, field order,
idempotence, evidence/hash/report handling and restart persistence. Cloud and customer-host checks
require their own target credentials/authorization and are reported separately.

Verified result: 53 Node tests passed (28 domain/runner, 17 contract/gateway, 8 real SSH/OSS), responsive browser acceptance passed, and the merged AirApp passed in a fresh isolated Busabase browser runtime. Root lint/typecheck, strict four-layer package validation and Agent Skills dry-run validation passed. Cloud login and customer-host execution were not performed. Native browser-runtime bootstrap emits seven transient virtual-path MIME/404 messages before settling; post-ready application checks were clean.
