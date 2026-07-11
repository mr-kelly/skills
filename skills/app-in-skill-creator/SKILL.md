---
name: app-in-skill-creator
license: MIT
description: "Create or update App-in-Skill patterns: Codex skills that bundle a local provider-backed web app for review, approval, dashboards, or lightweight workflows. Use when the user wants a skill with an embedded local UI, provider handoff, local files, Busabase, locks, app launcher, schemas, or a reusable App-in-Skill scaffold."
---

# App-in-Skill Creator

## Purpose

Use this skill to design or update Codex skills that include a small local app inside the skill folder. The app is an operator surface for humans; the skill remains responsible for reasoning, external reads/writes, safety gates, and execution.

Good fits:

- batch review and approval queues;
- local dashboards over skill-generated files;
- human comments, edits, or decisions that an agent later executes;
- control panels for launching or steering batches;
- workflows where chat is too tiring but full product infrastructure is unnecessary.

## Core Boundary

Keep the boundary clear:

- The skill reads external systems, reasons, drafts, and executes approved actions.
- The app reads and writes active-provider handoff state only.
- The app never sends emails, deletes data, charges money, publishes, changes remote systems, or performs external side effects.
- The provider handoff contract is the boundary between app and skill.
- The default interaction mode for review/approval work is App UI; support chat-only only when the user explicitly asks for it (`chat only`, `no UI`, `纯聊天`, `不要打开 UI`, or similar).

App-in-Skill is a pattern, not one fixed UI. A review queue is the most common shape, but dashboards, workspaces, control panels, and collaboration surfaces are also valid.

## Reference Map

Read only the references needed for the current task, but read the selected reference completely before acting on it.

| Need | Reference |
| --- | --- |
| Directory layout, Hono server, Node TypeScript, zero-build frontend, dependency policy, screenshots/recordings asset policy | `references/runtime-architecture.md` |
| Private config, env priority, sanitized summaries, provider spectrum, Busabase, provider interface guidance | `references/private-config-and-providers.md` |
| Handoff files, workflow states, review model, batch schema, execution reports | `references/file-contract-review-model.md` |
| First-run setup gate, provider choice, setup state model, language Auto, suggested agent prompt | `references/setup-onboarding.md` |
| First-run setup, onboarding marker, reconfiguration, agent.lock, concurrent write safety | `references/onboarding-and-locking.md` |
| Human-attention panel, workflow filters, accent color system, hash routing, review notes, Help & Settings, i18n, approval semantics | `references/ui-workflow-patterns.md` |
| Desktop split-pane shell, mobile drawer shell, sidebar icon, responsive CSS/checklist | `references/mobile-shell-layout.md` |
| Data-provider interface template and runtime guard | `references/provider-interface.ts` |
| Splitting a large app.js into ES modules, shared store pattern, circular-dependency handling | `references/frontend-modules.md` |
| Demo recordings and walkthrough clips | `references/demo-recording.md` |

## Default Shape

A typical App-in-Skill uses:

```text
skill-name/
├── SKILL.md
├── package.json
├── agents/openai.yaml
├── assets/                 # optional visual assets only when requested/existing
├── app/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── start.sh
│   ├── i18n/messages.js
│   └── server/*.ts
├── app/.data/              # local provider handoff files, gitignored
├── lib/
│   ├── paths.ts
│   ├── common.ts
│   └── data-provider/
├── scripts/*.ts
├── references/
├── config.example.json
└── config.local.json       # gitignored
```

Default runtime choices:

- Hono server, Node >=23.6 native type stripping, TypeScript on the Node side.
- Vanilla zero-build browser frontend: `.html`, `.js`, `.css`, and `app/i18n/` catalogs.
- JSON runtime config and provider handoff state.
- Data access through `lib/data-provider/`.
- Local HTTP on `127.0.0.1`, preferred ports `3000-4000`.

See `references/runtime-architecture.md` for the detailed rules and escape hatches.

## Creation Workflow

When creating or updating an App-in-Skill:

1. Define the human story: what the agent prepares, what the user reviews, and what the skill executes.
2. Identify the app type: review queue, dashboard, workspace, control panel, collaboration, or a composed surface.
3. Read the relevant references from the Reference Map.
4. Define the file contract before building UI controls.
5. Create/update the local app inside `app/` with a Hono server and zero-build frontend unless a documented exception applies.
6. Add generator, executor, validator, and data-provider helpers under `scripts/` and `lib/`.
7. Add private config templates and sanitized config summaries when the skill has accounts, products, connectors, or personal context.
8. Make onboarding the initial phase when setup is required; follow `references/setup-onboarding.md` for the friendly full-screen setup gate, provider choice, language picker, and provider-aware suggested agent prompt. The app must start even when no provider or private config exists.
9. Add `agent.lock` handling to both the skill workflow and app server.
10. Add the human-attention panel, workflow filters, stable item refs, hash routes, Help & Settings, and i18n when appropriate.
11. Add the mobile shell and verify one desktop viewport plus a 390px-wide phone viewport.
12. Start the app with `app/start.sh`, verify onboarding/main workflow in a browser, and report the actual URL.
13. If the user explicitly asks for screenshots, place them under `assets/screenshots/`. If the user explicitly asks for a demo recording, follow `references/demo-recording.md` and place final clips outside the skill package, under repo-level `docs/demo-recordings/<skill-name>/`, with Git LFS tracking for MP4 files. Otherwise keep videos outside the repo and record only the external path or summary when useful.
14. Run the schema validator and dry-run execution before enabling real side effects.

## Required Behaviors

An App-in-Skill should:

- launch or reuse the local app for visual review by default;
- keep chat-only review as an explicit fallback;
- preserve stable item references such as `Review #1` for chat follow-up;
- store human input through the active provider;
- re-read decisions immediately before execution;
- write execution reports with concrete operations and targets;
- keep app-side actions local-only;
- use deterministic demo mode for screenshots/recordings;
- expose safe config summaries, never secret values;
- stay recoverable after browser refresh, interrupted agent runs, or repeated execution attempts.

## Safety Defaults

- Treat money, legal, privacy, account access, destructive actions, and outbound messages as approval-required.
- Store only the minimum local content needed for review.
- Do not commit `app/.data/`, secrets, personal inbox config, customer exports, local env files, or generated private state.
- Do not expose secret values through UI state, logs, reports, batch files, browser screenshots, or recordings; expose only boolean readiness for env vars.
- Make execution idempotent where possible with stable item ids and execution results.
- If UI and batch schema disagree, stop and update the schema or UI before executing.
- If a connector target is missing, block and ask for configuration instead of guessing.

## Taste

The app should feel like a quiet cockpit for one workflow. It is not a landing page, and it is not a SaaS product pretending to be finished. Keep it specific to the work: a small, concrete surface that helps the user inspect, steer, approve, and collaborate with the skill's output with less fatigue and more control.
