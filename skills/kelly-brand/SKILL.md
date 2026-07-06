---
name: kelly-brand
license: MIT
description: "Brand-narrative single source of truth (TALE: Trace/Architect/Land/Evaluate) with a local App-in-Skill workbench. The agent drafts positioning, the message house of value pillars, the story bank, evidence-backed proof points, and vocabulary/tone guardrails; the human curates which drafts become the CANONICAL narrative; a drift monitor flags off-brand usage across channels. Use when the user invokes $kelly-brand or /kelly-brand, mentions brand narrative, brand messaging, positioning, message house, value pillars, story bank, proof points, tone/vocabulary guardrails, narrative quality (NQS), brand drift, or wants a single source of truth for what the brand says."
---

# Kelly Brand

## Overview

Use this skill as the operator for a brand's **narrative single source of truth**. It keeps a file-backed App-in-Skill workbench over the whole message house — positioning, value pillars, the story bank, evidence-backed proof points, and vocabulary/tone guardrails — plus a drift monitor that flags off-brand usage across channels. The agent drafts; the human curates which drafts are **adopted as the canonical narrative**; the skill records those adoptions and can export the canonical narrative for downstream use.

Everything is organized by Aaron's **TALE** discipline — **Trace → Architect → Land → Evaluate** — and every narrative asset carries the TALE `phase` and the `sub_skill` that produced it.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or regenerate the local brand snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present numbered assets (`#1`, `#2`) and take verdicts in the conversation.

Design philosophy follows the App-in-Skill specification paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>. The agent owns drafting and any external reads/writes; the app reads and writes local files only; the file handoff is the contract; the human's clicks are reserved for judgment — chiefly **adopting a draft as canonical**.

## Boundary

- The skill may read sources the user provides (positioning inputs, existing site/deck copy, channel exports), draft narrative assets, score them, validate schemas, and write local handoff files.
- The app reads and writes local files only. It must never publish copy, call channel APIs, or change any remote system.
- Adopting an asset to the canonical narrative, exporting the narrative, and resolving a drift alert are approval-required and skill-executed **after** the human's verdict. `scripts/execute_decisions.ts` only records operations in `execution_report.json`; it performs no publishing itself.
- Treat unverified claims, regulated claims, and legal/compliance wording as approval-required. A proof point with no named source must be `blocked`, not shipped.

## The TALE Framework

The 4 phases are both an item facet (`phase`) and the shape of the work. The 16 sub-skills below are the capability taxonomy — each drafted asset names the sub-skill that produced it in `sub_skill`.

### Trace — map the ground truth
- **narrative-baseline-mapper** — capture the brand's current story as it actually reads today (origin story, status quo).
- **category-narrative-mapper** — map how the category talks so the brand can stand apart from it.
- **audience-belief-mapper** — surface what the audience already believes, needs, and objects to.
- **positioning-truth-tracer** — trace the defensible truths the positioning can stand on.

### Architect — design the message system
- **strategic-narrative-designer** — write the core **positioning statement** (the roof of the house).
- **message-system-architect** — build the **value pillars** that hold the positioning up.
- **brand-language-codifier** — codify the **vocabulary** (say-this/not-that) and **guardrails** (banned/regulated language).
- **story-bank-builder** — assemble the **story bank** of reusable customer and brand stories.

### Land — make it usable across channels
- **narrative-cascade-planner** — plan how the narrative cascades to each channel.
- **pitch-narrative-builder** — shape the narrative into a pitch.
- **narrative-enablement-kit** — package the narrative so teams can actually use it.
- **proof-point-packager** — package **proof points** with their evidence (a named source and stat).

### Evaluate — test, monitor, gate
- **message-test-designer** — design tests for whether messages land.
- **narrative-resonance-monitor** — monitor how the narrative resonates.
- **narrative-drift-monitor** — flag off-brand / misaligned usage across channels (the Drift view).
- **narrative-quality-auditor ⛩** — the **gate**: score narrative quality (NQS 0–100) via the TALE framework and output **SHIP / FIX / BLOCK**. This gate is prominent on the overview and on every asset.

## Narrative Quality Score (NQS) gate

The `narrative-quality-auditor ⛩` scores each asset and the narrative as a whole:

- **SHIP** (score ≥ 80) — ready to adopt as canonical.
- **FIX** (55–79) — usable but flagged for a concrete revision.
- **BLOCK** (< 55, or a proof point missing its source) — must not be published or adopted until fixed.

The overview shows the **overall NQS** with its gate, and each asset card shows its own NQS chip. A `BLOCK` verdict from the auditor should be mirrored by a `blocked` status on the item until resolved.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before doing real narrative work.

Private config priority:

1. `KELLY_BRAND_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-brand/config.local.json`
3. `~/.config/kelly-brand/config.json`
4. `skills/kelly-brand/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_BRAND_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-brand/.env.local`
5. `~/.config/kelly-brand/.env`

Ask for non-secret setup details only: brand profile (name, category, audience, mission), the positioning inputs (for whom / who need / our brand is / that / unlike / because), channels monitored for drift and how each is reached, tone/style and reading level, official URLs, and the risk policy (banned phrases, regulated claims). Never ask the user to paste secrets into chat; channel source URLs/tokens belong only in local env files, referenced by `source_url_env`/`token_env`.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the workbench with:

```bash
skills/kelly-brand/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port **3230** through **3999**, or `KELLY_BRAND_UI_PORT` when set. The launcher reuses a running instance only when `/api/state` proves it is the same app (`app: "kelly-brand"`).

Required app views (hash routes):

- `#/overview` — **the message house**. The canonical/draft positioning statement at the top, the value pillars, the overall NQS with its gate, canonical vs needs-review counts, and the open drift-alert count.
- `#/narrative` — message pillars plus vocabulary/guardrails, canonical vs draft, each editable with its NQS and TALE phase. Adopt / Request changes / Block per asset.
- `#/stories` — the story bank and the proof points with their evidence (source + stat). A proof point missing evidence is blocked.
- `#/drift` — off-brand/misalignment alerts the drift monitor flagged, each showing the offending usage vs the canonical guardrail, with Approve fix / Dismiss.
- `#/settings` — sanitized config summary: brand profile, tone/reading level, banned/regulated language, official URLs, monitored channels with source-readiness booleans, data provider, and onboarding state. Never expose secret values.

The left sidebar keeps the fixed **workflow filters** (`All`, `Needs Review`, `Canonical` (= approved), `Done`, `Blocked`) as primary nav alongside the views. "Canonical" is the UI label for the `approved` state.

Demo mode:

- `?demo=1` opens a deterministic mock brand (invented "Fernpath") for documentation and screenshots.
- `?demo=overview`, `?demo=narrative`, `?demo=stories`, `?demo=drift`, and `?demo=settings` select named scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write files under `app/.data/` or any private config.

UI language: support English and Chinese chrome with `Auto` default. Keep the brand's own narrative content (positioning, pillars, stories) in its original language.

## File Contract

Read `references/brand-schema.md` before editing the app, scripts, or any generated brand JSON.

Primary local files:

- `app/.data/brand_snapshot.json`: normalized narrative snapshot (positioning, items, drift alerts, metrics) generated by the skill/scripts.
- `app/.data/decisions.json`: user verdicts and review notes keyed by `item_id` or `alert_id`, written by the app.
- `app/.data/agent_tasks.json`: queued agent work — assets in `changes_requested` with the user's comment. The skill polls this to pick up revisions.
- `app/.data/execution_report.json`: latest operations written by `scripts/execute_decisions.ts`.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill is generating or executing. The app rejects decision writes while it exists.
- `config.local.json`: private brand configuration, ignored by git.

Use `scripts/validate_ui_schema.ts` before relying on a snapshot in the UI. The app shows an empty setup state when no snapshot exists.

## Normal Workflow

1. Detect mode. Default to App UI.
2. Load private config through the config helpers. If only `config.example.json` exists, enter onboarding.
3. When the user feeds material (positioning inputs, existing copy, channel exports): acquire `app/.data/agent.lock`, update `brand_snapshot.json` — draft/upsert narrative assets by stable `item_id` across the six `type`s, tag each with its TALE `phase` and `sub_skill`, run the **narrative-quality-auditor** to set each `nqs` and the overall NQS, run the **narrative-drift-monitor** over monitored channels to (re)populate `drift_alerts`, recompute metrics — validate with `scripts/validate_ui_schema.ts`, then release the lock.
4. Start/reuse the UI and report the URL so the user can review the message house, the story bank, and the drift alerts.
5. Poll `app/.data/agent_tasks.json` for `changes_requested` items. Re-draft each per the user's comment, re-score it, set it back to `needs_review`, and clear the task.
6. On "adopt" / "promote approved narrative": re-read `decisions.json`, re-check the lock, and run `scripts/execute_decisions.ts --apply` to record `promote_to_canonical` (registry `narrative`) and `resolve_drift` operations in `execution_report.json`. Then, only for approved assets, update the canonical narrative and — if asked — `export_narrative` to a markdown file. Mark each `done` in the snapshot afterwards.
7. Never adopt or export an asset without an explicit `approve` verdict. Never let a `BLOCK`/blocked proof point (no named source) reach any channel.

## Safety Defaults

- Treat unverified claims, regulated claims (`organic`, `#1`, `guaranteed`, `certified`, `carbon-neutral`), and legal/compliance wording as approval-required. Every public number must cite a named source.
- A proof point without evidence is `blocked` by the NQS gate; do not adopt or publish it.
- Store only the narrative content needed for review; keep raw channel exports out of the snapshot.
- Redact tokens and credential-like strings from logs, reports, and UI state; expose only boolean source-readiness for configured env vars.
- Keep stable ids (`item_id`, `alert_id`) so repeated updates and executions are idempotent.
- If decisions and the snapshot disagree (missing item, stale ref), stop and regenerate rather than guessing.
