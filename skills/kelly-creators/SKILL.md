---
name: kelly-creators
license: MIT
description: Personal App-in-Skill command desk for influencer/creator marketing — the agent sweeps and fit-scores creator candidates, drafts outreach and briefs, and gates content before it ships; the human reviews creator cards, approves outreach/briefs/contracts, and tracks campaign ROI in a local review dashboard. Use when the user invokes $kelly-creators or /kelly-creators, mentions influencer or creator marketing, creator discovery, fit scoring, outreach DMs, campaign briefs, UGC, sponsorship or partnership deals, content review / FTC disclosure gating, or campaign ROI, or wants to review/approve agent-drafted creator outreach before it is sent through other channels.
---

# Kelly Creators

## Overview

Use this skill as Kelly's personal influencer/creator-marketing operator. It keeps a file-backed App-in-Skill dashboard over creator candidates, outreach drafts, campaign briefs, and ROI, plus a review queue of agent-drafted outreach and pre-publication content gates. The skill sweeps candidates from whatever Kelly feeds it — a niche, a brand brief, a competitor's creators, an exported list — scores fit, drafts outreach and briefs, and executes approved sends only through other channels (for example `instagram-outreach` or `kelly-email`) after explicit approval.

An **item is a creator engagement**: `handle`, `platform`, `followers`, `engagement_rate`, `fit_score`, `niche`, `est_rate`, `proposed_action`, `suggested_reply`, and the standard `status`/`decision`/`execution` blocks. A second item type is a **quality gate** on a live creator's draft post.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or regenerate the local creator snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present numbered creators (`#1`) and take verdicts in the conversation.

## Philosophy

This skill is an App-in-Skill: a Codex/agent skill paired with a small local companion UI. The skill does the real work (external reads, reasoning, drafting, executing approved sends); the app is a quiet local operator surface that reads and writes local files only and never performs an external side effect. See the App-in-Skill specification paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.

The domain follows the four-phase influencer-marketing discipline — **Discover → Plan → Activate → Measure** — used both as the pipeline funnel and as a `phase` facet on every item. Human clicks are reserved for judgment, edits, exceptions, and irreversible or money/contract actions.

## Capabilities (Discover / Plan / Activate / Measure)

The agent covers sixteen sub-skills, grouped by phase. Each generated item is tagged with its phase so the desk always shows where the program stands.

- **Discover** — `audience-mapper` (who the brand's buyers are), `trend-spotter` (rising formats/sounds/topics), `influencer-discovery` (sweep candidate creators), `fit-scorer` (the objective C³ ACE match score).
- **Plan** — `competitor-tracker` (which creators competitors use), `campaign-planner` (goals, mix, timeline), `brief-generator` (creative brief per creator), `budget-optimizer` (allocate spend across the roster).
- **Activate** — `outreach-manager` (draft and track outreach DMs/emails), `content-reviewer` (the pre-publication SHIP/FIX/BLOCK quality gate), `contract-helper` (terms, usage rights, exclusivity), `content-amplifier` (whitelisting/boosting approved posts).
- **Measure** — `landing-optimizer` (post-click experience), `performance-analyzer` (reach/engagement/conversion), `roi-calculator` (spend → estimated value, CPM, ROI), `report-generator` (campaign wrap-ups).

### Fit score — C³ ACE

`fit_score` (0-100) is the objective matching score: **C**ontent × **C**ommunity × **C**redibility crossed with **A**udience × **C**ost × **E**ngagement. `fit_breakdown` carries the six sub-scores shown in creator detail. Prefer fit over raw follower count when ranking candidates.

### Content-reviewer quality gate

Before a live creator's post publishes, the agent runs a `content-reviewer` gate that outputs **SHIP / FIX / BLOCK** over `ftc_disclosure` (is `#ad` disclosed above the fold?) and `claim_authenticity` (are product claims supportable, no cure/medical overreach?), plus `brand_safety`. A `fix` or `block` verdict is surfaced in the outreach queue for a human decision. This gate is `item_type: "quality_gate"` with `gate_verdict` and `gate_checks`.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Creators overview"></td>
    <td width="50%"><img src="assets/screenshots/creators.webp" alt="Kelly Creators candidates"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Pipeline funnel across the four phases, budget allocation, total reach, and the top fit-scored candidates.</td>
    <td><strong>Creators</strong><br>Sortable candidate cards with C³ ACE fit scores, platform, niche, and audience size.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/outreach.webp" alt="Kelly Creators outreach queue"></td>
    <td width="50%"><img src="assets/screenshots/roi.webp" alt="Kelly Creators ROI board"></td>
  </tr>
  <tr>
    <td><strong>Outreach</strong><br>Needs-review approval queue with editable outreach drafts and the FTC/claim disclosure gate.</td>
    <td><strong>ROI</strong><br>Per-creator spend, estimated value, CPM, and return once a partnership goes live.</td>
  </tr>
</table>

## Boundary

- The skill may read sources Kelly provides, sweep and score creators, draft outreach/briefs/contracts, run content gates, validate schemas, and write local handoff files.
- The app reads and writes local files only. It must never send DMs or emails, call platform APIs, post content, or perform any external side effect.
- Outbound outreach, briefs, and contracts are always approval-required. Sending is delegated to other skills (for example `instagram-outreach`, `tiktok-outreach`, `kelly-email`) and happens only after the user approves the specific item. `scripts/execute_decisions.ts` only records handoff operations in `execution_report.json`; it performs no sending itself.
- Treat money and contract terms (rates, usage rights, exclusivity) as sensitive and approval-required. Do not commit `config.local.json`, env files, `app/.data/`, exports, or creator contact details.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before doing real creator work.

Private config priority:

1. `KELLY_CREATORS_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-creators/config.local.json`
3. `~/.config/kelly-creators/config.json`
4. `skills/kelly-creators/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_CREATORS_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-creators/.env.local`
5. `~/.config/kelly-creators/.env`

Ask for non-secret setup details only: operator profile (name, role, company, timezone), brand(s) and positioning, target niches, program budget and base currency, outreach platforms and which skill handles each, style/tone for drafts, risk keywords (money/contract), and which env var names hold platform tokens. Never ask the user to paste secret values into chat.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{ "completed": true, "completed_at": "ISO timestamp", "config_version": "1" }
```

## Local App

Start the dashboard with:

```bash
skills/kelly-creators/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3200` through `3999`, or `KELLY_CREATORS_UI_PORT` when set. The launcher reuses a running instance only when `/api/state` proves it is the same app (`app: "kelly-creators"`).

Required app views:

- `#/overview`: command desk. Human-attention counts, the discovery → outreach → negotiating → live → measured funnel (tagged by phase), budget allocation, total reach, and top candidates by fit.
- `#/creators` and `#/creators/<creator_id>`: candidate cards with fit score, platform, niche, followers, engagement rate, and rate — sortable by fit / followers / engagement / cost. Detail shows the C³ ACE breakdown, the outreach draft (or the quality-gate checks), and the full engagement record.
- `#/outreach`: review queue over agent-drafted outreach and content gates in workflow states `needs_review`, `changes_requested`, `approved`, `done`, `blocked`. Each item shows a stable row ref (`#1`), fit score, phase/risk badges, an editable `suggested_reply` draft, a `Review note` textarea, and decision buttons Approve / Request changes / Block that write to `decisions.json`. The queue is read-only while `agent.lock` exists.
- `#/roi`: per-creator spend, estimated value, CPM, and ROI.
- `#/settings`: sanitized config summary. Operator profile, brand(s), program budget and target niches, configured platforms, env readiness booleans, data provider name, and onboarding state. Never expose secret values.

Demo mode:

- `?demo=1` opens a deterministic mock program for documentation and screenshots.
- `?demo=overview`, `?demo=creators`, `?demo=outreach`, `?demo=roi`, and `?demo=detail` select named mock scenes; `detail` deep-links to a creator detail.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses must never read or write files under `app/.data/` or any private config. All handles are invented.

UI language: support English and Chinese chrome with `Auto` default. Keep creator names, handles, notes, and drafts in their original language.

## File Contract

Read `references/creators-schema.md` before editing the app, scripts, or any generated creator JSON.

Primary local files:

- `app/.data/creator_snapshot.json`: normalized creator snapshot (creators, metrics, funnel, warnings) generated by the skill/scripts.
- `app/.data/decisions.json`: user verdicts and review notes keyed by `creator_id`, written by the app.
- `app/.data/agent_tasks.json`: queued agent work — engagements in `changes_requested` with the user's comment. The skill polls this to pick up revisions.
- `app/.data/execution_report.json`: latest handoff/execution results written by `scripts/execute_decisions.ts`.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill is generating or executing. The app rejects decision writes while it exists.
- `config.local.json`: private operator configuration, ignored by git.

Use `scripts/validate_ui_schema.ts` before relying on a snapshot in the UI. The app may show an empty setup state when no snapshot exists.

## Normal Workflow

1. Detect mode. Default to App UI.
2. Load private config through the config helpers. If only `config.example.json` exists, enter onboarding.
3. **Discover/Plan:** when Kelly feeds a niche, brand brief, competitor, or candidate list: acquire `app/.data/agent.lock`, update `creator_snapshot.json` — upsert creators by stable ids, compute the C³ ACE `fit_score` and `fit_breakdown`, set `stage`/`phase`, draft `suggested_reply` outreach or briefs with `status: "needs_review"`, add money/contract risk badges and `est_rate`, recompute metrics — validate with `scripts/validate_ui_schema.ts`, then release the lock.
4. Start/reuse the UI and report the URL so Kelly can review the funnel, the candidate cards, and the outreach queue.
5. Poll `app/.data/agent_tasks.json` for `changes_requested` items. Re-draft each per the user's comment, set it back to `needs_review`, and clear the task.
6. **Activate:** on "execute" / "send approved outreach": re-read `decisions.json`, re-check the lock, and run `scripts/execute_decisions.ts --apply` to record `send_outreach` / `send_brief` / `draft_contract` operations in `execution_report.json`. Then perform the actual sends only through the corresponding skill with the approved, possibly user-edited draft, one item at a time, and mark each `done` afterwards. Run the `content-reviewer` gate on live drafts and surface FIX/BLOCK verdicts for approval.
7. **Measure:** as campaigns go live and complete, update `spend`, `est_value`, and `cpm` and move engagements to `measured`; summarize ROI in the `#/roi` view.
8. Never send anything for items without an explicit `approve` decision, and never re-send items already marked `done` in the execution report.

## Safety Defaults

- Treat every outbound message, brief, contract, rate commitment, usage-rights term, and exclusivity clause as approval-required.
- Never publish or approve a live post that fails the `content-reviewer` gate (missing FTC disclosure or unsupportable claims) without a human decision.
- Store only the minimum creator content needed for review; keep raw scraped data and platform exports out of the snapshot.
- Redact tokens and credential-like strings from logs, reports, and UI state; expose only boolean readiness for configured env vars.
- Keep stable ids (`creator_id`) and `ref` numbers so repeated updates and executions are idempotent.
- If decisions and the snapshot disagree (missing creator, stale ref), stop and regenerate rather than guessing.
