---
name: kelly-launch
license: MIT
description: "Product-launch command desk (App-in-Skill) built on the RAMP discipline — Research / Assemble / Mobilize / Prove. The agent assembles the launch checklist and drafts launch assets, channel submissions (Product Hunt / Hacker News / directories), press pitches, and the launch-day runbook; the human approves the launch-readiness gate and steers launch day in a local review UI. Use when the user invokes $kelly-launch or /kelly-launch, or mentions launching / shipping a product, a launch checklist or runbook, launch readiness, RAMP, Product Hunt / Show HN / press-kit / launch-email drafting, or wants to review and approve launch assets and channel submissions before they go public. This is launch OPERATIONS — the checklist, assets, submissions, and runbook — not a launch video (for a promo video use product-launch-video)."
---

# Kelly Launch

## Overview

Use this skill as Kelly's product-launch command desk. It keeps a file-backed App-in-Skill dashboard over the launch checklist, launch assets, channel submissions, press pitches, and the launch-day runbook, plus a review queue of agent-drafted assets and submissions. The skill gathers launch context from whatever Kelly feeds it — product docs, positioning notes, a target date — assembles the RAMP checklist, drafts the assets and submissions, scores launch readiness, and executes approved submissions/sends only through other channels (for example `kelly-email` for press/launch email, or a channel connector for Product Hunt) after explicit approval.

This is launch **operations**, not a launch video. For a promotional launch video, use `product-launch-video`; this desk drafts the checklist, copy, submissions, press pitches, and runbook that surround such a video.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or regenerate the local launch snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present numbered items (`#8`) and take verdicts in the conversation.

## The RAMP Discipline

kelly-launch implements the **RAMP** launch discipline — **Research / Assemble / Mobilize / Prove** — as its four item `phase`s and as the structure of the checklist. Every launch task or asset belongs to exactly one phase. The capability taxonomy the skill draws on within each phase:

- **Research** — decide what the launch is and who it's for: `positioning-mapper` (ICP + wedge + one-line positioning), `launch-tier-planner` (how big a launch this warrants), `launch-window-planner` (target date + timing around competitors/holidays), `early-access-designer` (waitlist / private beta / design partners).
- **Assemble** — build the assets: `message-house-builder` (headline + message pillars every asset inherits), `launch-asset-packager` (press kit, screenshots, demo, landing hero, changelog), `pricing-packaging-planner` (tiers + pricing page), `sales-enablement-kit` (support macros, launch FAQ, objection handling).
- **Mobilize** — put it in front of people: `launch-day-conductor` (the ordered launch-day runbook + on-call roster), `community-launch-runner` (Product Hunt submission, Show HN post, directory listings, waitlist email), `press-media-relations` (Tier-1 press pitches, embargo, briefings).
- **Prove** — measure and sustain: `launch-monitor` (channel status, funnel, support queue on launch day), `launch-feedback-synthesizer` (roll up reactions and objections), `launch-retro-analyzer` (what worked / what to change), `momentum-planner` (the follow-through after day one).

### Launch-readiness gate (RAMP → LQS → SHIP / FIX / BLOCK)

The `launch-readiness-auditor` ⛩ is the gate that decides whether the launch is go/no-go. It runs the RAMP framework across every item and produces a **Launch Quality Score (LQS, 0–100)** and a verdict:

- Each item carries a per-item readiness verdict: `SHIP` (ready), `FIX` (needs work but recoverable), or `BLOCK` (a hard blocker).
- **LQS** counts SHIP items full, FIX items half, BLOCK items zero, over all items.
- The overall verdict is `BLOCK` if any item is BLOCK, `FIX` if any blockers remain, else `SHIP`.

The readiness gate is the most prominent element of the Overview screen. The human approves the gate (steers which blockers must clear before launch) — this is the primary judgment call the desk reserves for a person.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small local companion UI: the skill does the real work (reads sources, drafts, scores, executes approved actions through other skills), while the app is a quiet operator surface for review and approval over local handoff files. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.

The boundary is the point: a launch is a burst of irreversible public actions, so the human's clicks are reserved for judgment (approve the gate, approve public submissions and press) while the agent absorbs the drafting and bookkeeping.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Launch overview"></td>
    <td width="50%"><img src="assets/screenshots/assets.webp" alt="Kelly Launch assets queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Launch countdown, the RAMP readiness gate with its LQS score, phase progress, and channel status.</td>
    <td><strong>Assets</strong><br>Approval queue for launch assets, Product Hunt / Hacker News submissions, and press pitches.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checklist.webp" alt="Kelly Launch checklist"></td>
    <td width="50%"><img src="assets/screenshots/launchday.webp" alt="Kelly Launch launch-day runbook"></td>
  </tr>
  <tr>
    <td><strong>Checklist</strong><br>Launch tasks grouped by RAMP phase — Research, Assemble, Mobilize, Prove.</td>
    <td><strong>Launch day</strong><br>An ordered launch-day runbook with war-room notes.</td>
  </tr>
</table>

## Boundary

- The skill may read sources Kelly provides, assemble the checklist, draft assets/submissions/pitches, score readiness, validate schemas, and write local handoff files.
- The app reads and writes local files only. It must never submit to Product Hunt / Hacker News, send press pitches or launch email, publish pages, call external APIs, or perform any external side effect.
- Public submissions and press are always approval-required. Submitting/sending is delegated to other skills (for example `kelly-email` for press and launch email) and happens only after the user approves the specific item. `scripts/execute_decisions.ts` only records handoff operations in `execution_report.json`; it performs no submission or sending itself.
- Treat launch copy, embargoed facts, and press lists as sensitive. Do not commit `config.local.json`, env files, `app/.data/`, exports, or press contacts.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before doing real launch work.

Private config priority:

1. `KELLY_LAUNCH_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-launch/config.local.json`
3. `~/.config/kelly-launch/config.json`
4. `skills/kelly-launch/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_LAUNCH_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-launch/.env.local`
5. `~/.config/kelly-launch/.env`

Ask for non-secret setup details only: product profile (name, tagline, homepage, category), launch target date and timezone, channels and which skill handles each submission, press list names, readiness policy (which channels are hard blockers, minimum ship ratio), style/tone for drafts, and which env var names hold channel/email tokens. Never ask the user to paste secret values into chat. Secrets belong only in local env files.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{ "completed": true, "completed_at": "ISO timestamp", "config_version": "1" }
```

## Local App

Start the desk with:

```bash
skills/kelly-launch/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3220`, falling through `3220`–`3999`, or `KELLY_LAUNCH_UI_PORT` when set. The launcher reuses a running instance only when `/api/state` proves it is the same app (`app: "kelly-launch"`).

Required app views (hash routes):

- `#/overview`: launch command desk. The launch-readiness gate (LQS + SHIP/FIX/BLOCK + blockers), a countdown to the target date, RAMP phase progress, channel-submission status, and the top assets awaiting review.
- `#/checklist`: the RAMP checklist — every launch task/asset grouped by phase (Research → Assemble → Mobilize → Prove), with status, per-item readiness, channel, and proposed action.
- `#/assets`: the approval queue over agent-drafted assets and submissions (press kit, PH submission, Show HN post, launch email, press pitch, changelog…). Each item shows a stable ref (`#8`), phase/readiness/risk badges, an editable `draft`, a `Review note`, and Approve / Request changes / Block decisions that write to `decisions.json`. Read-only while `agent.lock` exists.
- `#/launchday`: the launch-day runbook — an ordered timeline of actions (`T-60m … T+8h`) with owner and a war-room note per step.
- `#/settings`: sanitized config summary. Product/launch profile, readiness policy, press lists, configured channels, env readiness booleans, data provider name, and onboarding state. Never expose secret values.

Sidebar workflow filters (All / Needs Review / Approved / Done / Blocked) remain the primary lens on the asset queue.

Demo mode:

- `?demo=1` (or `?demo=overview`) opens a deterministic mock launch for an invented product ("Trailhead") ~10 days out.
- `?demo=checklist`, `?demo=assets`, `?demo=launchday` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write files under `app/.data/` or any private config.

UI language: support English and Chinese chrome with `Auto` default. Keep product names, launch copy, drafts, and runbook notes in their original language.

## File Contract

Read `references/launch-schema.md` before editing the app, scripts, or any generated launch JSON.

Primary local files:

- `app/.data/launch_snapshot.json`: normalized launch plan (product, launch, phases, readiness gate, metrics, channels, items, runbook, warnings) generated by the skill/scripts.
- `app/.data/decisions.json`: user verdicts and review notes keyed by item id, written by the app.
- `app/.data/agent_tasks.json`: queued agent work — items in `changes_requested` with the user's comment. The skill polls this to pick up revisions.
- `app/.data/execution_report.json`: latest handoff/execution results written by `scripts/execute_decisions.ts`.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill is generating or executing. The app rejects decision writes while it exists.
- `config.local.json`: private product/launch configuration, ignored by git.

Use `scripts/validate_ui_schema.ts` before relying on a snapshot in the UI. The app may show an empty setup state when no snapshot exists.

## Normal Workflow

1. Detect mode. Default to App UI.
2. Load private config through the config helpers. If only `config.example.json` exists, enter onboarding.
3. When Kelly feeds new material (product docs, positioning, a date): acquire `app/.data/agent.lock`, assemble/update `launch_snapshot.json` — RAMP items with `phase`, per-item `readiness`, `proposed_action`, and an editable `draft` for assets/submissions; recompute the readiness gate (LQS + verdict + blockers), phase progress, and channel status — validate with `scripts/validate_ui_schema.ts`, then release the lock.
4. Start/reuse the UI and report the URL so Kelly can review the checklist, the asset queue, and the launch-day runbook.
5. Poll `app/.data/agent_tasks.json` for `changes_requested` items. Re-draft each per the user's comment, set it back to `needs_review`, and clear the task.
6. On "execute" / "submit approved": re-read `decisions.json`, re-check the lock, and run `scripts/execute_decisions.ts --apply` to record concrete operations (`submit_channel` / `send_pitch` / `publish_asset`) in `execution_report.json`. Then perform the actual submissions/sends only through the corresponding skill (for example `$kelly-email` for a press pitch or launch email), one item at a time, and mark each `done` afterwards.
7. Never submit or send anything for items without an explicit `approve` decision, and never re-submit items already `done` in the execution report. Do not let the launch go if the readiness gate is `BLOCK`.

## Safety Defaults

- Treat every public submission (Product Hunt, Hacker News, directories), press pitch, launch email, and pricing commitment as approval-required.
- Store only the minimum launch copy needed for review; keep raw source docs out of the snapshot.
- Redact tokens and credential-like strings from logs, reports, and UI state; expose only boolean readiness for configured env vars.
- Keep stable ids (`item_id`, `ref`, `step_id`) so repeated updates and executions are idempotent.
- If decisions and the snapshot disagree (missing item, stale ref), stop and regenerate rather than guessing.
