---
name: kelly-campaigns
license: MIT
description: Outbound email-marketing desk (App-in-Skill) for building segments, drafting campaigns, newsletters, and sequences, running pre-send deliverability and subject-line QA, and approving every send before it is scheduled. Structured around the SEND discipline — Setup, Engage, Nurture, Deliver — with an email-quality-auditor gate (EQS score + SHIP/FIX/BLOCK verdict). Use when the user invokes $kelly-campaigns or /kelly-campaigns, or mentions email marketing, campaigns, newsletters, drip/welcome/win-back sequences, broadcasts, segments, subject-line A/B tests, deliverability (SPF/DKIM/DMARC/spam score/inbox placement), or wants to review and approve marketing email before it is sent. This is OUTBOUND marketing to a subscriber list, distinct from kelly-email inbox triage (incoming mail). 出站邮件营销：策划分群、起草营销活动 / 新闻邮件 / 邮件序列，发送前做可送达性与主题行质检，人工审批后再排期发送。
---

# Kelly Campaigns

## Overview

Use this skill as Kelly's outbound email-marketing operator. It keeps a file-backed App-in-Skill dashboard over an email program: audience segments, drafted **sends** (campaign broadcasts, newsletter issues, and sequence steps), pre-send deliverability and subject-line QA, and post-send performance. The skill builds segments, drafts email copy, runs deliverability and quality checks, and prepares sends; the human reviews, edits, and approves each send in the app **before anything is scheduled or sent**.

This is **outbound marketing to a subscriber list**. It is distinct from `kelly-email`, which triages an incoming inbox. Keep them separate: `kelly-email` is about mail you received; `kelly-campaigns` is about mail you send to many people.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or regenerate the local campaign snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present numbered sends (`Send #1`) and take verdicts in the conversation.

This skill is an implementation of the **App-in-Skill** pattern — a Codex/agent skill paired with a small local companion UI for review and approval. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.

## The SEND Discipline

Work is organized around four phases. Every send is tagged with the phase it belongs to, and the app groups by phase.

- **Setup** — the sending foundation: authentication and deliverability, audience segments, list growth, list hygiene.
- **Engage** — the creative: email copy, subject lines, HTML render / dark-mode, dynamic personalization.
- **Nurture** — the lifecycle: sequences (welcome, drip, win-back), newsletter cadence and monetization, preference/frequency management, reactivation.
- **Deliver** — getting it into the inbox: send experiments (A/B), inbox-placement monitoring, cold outbound, and the pre-send quality gate.

### Capability taxonomy (16 sub-skills)

| Phase | Sub-skills |
| --- | --- |
| **Setup** | `deliverability-qa` · `list-segment-builder` · `list-growth-designer` · `list-hygiene-monitor` |
| **Engage** | `email-creative-builder` · `subject-line-lab` · `email-render-builder` · `dynamic-content-personalizer` |
| **Nurture** | `email-sequence-designer` · `newsletter-monetization-planner` · `preference-frequency-manager` · `reactivation-specialist` |
| **Deliver** | `send-experiment-designer` · `inbox-placement-monitor` · `cold-outbound-sequencer` · **`email-quality-auditor` ⛩ (the quality gate)** |

### The quality gate — `email-quality-auditor` ⛩

Before any send can be scheduled, it passes the **SEND** framework, which produces an **EQS** (Email Quality Score, 0–100) and a **SHIP / FIX / BLOCK** verdict:

- **S — Sender & auth**: SPF, DKIM, DMARC pass; correct from-identity.
- **E — Engagement risk**: segment quality, expected open/complaint behavior, re-permission for cold/lapsed lists.
- **N — Not spammy**: spam score, trigger words, link/image balance, working unsubscribe + physical address.
- **D — Deliverability**: inbox readiness against policy floors, IP/domain warm-up, render and dark-mode.

Verdicts: **SHIP** (ready to schedule), **FIX** (deliverable but revise first), **BLOCK** (hard stop — e.g. failing DKIM or a spam score above policy). The gate never sends; a human still approves. A `block` verdict or `deliverability.risk === "high"` refuses scheduling even if a stale approve decision exists.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Campaigns overview"></td>
    <td width="50%"><img src="assets/screenshots/campaigns.webp" alt="Kelly Campaigns queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Send calendar plus list health — subscribers, bounce, churn, and complaint rates.</td>
    <td><strong>Campaigns</strong><br>Draft and approval queue across campaigns, newsletters, and sequence steps.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/deliverability.webp" alt="Kelly Campaigns deliverability QA"></td>
    <td width="50%"><img src="assets/screenshots/performance.webp" alt="Kelly Campaigns performance"></td>
  </tr>
  <tr>
    <td><strong>Deliverability</strong><br>Pre-send QA — SPF/DKIM/DMARC, spam score, and the EQS SHIP/FIX/BLOCK gate.</td>
    <td><strong>Performance</strong><br>Open, click, and unsubscribe rates by campaign.</td>
  </tr>
</table>

## Boundary

- The skill may build segments, draft sends, run deliverability/quality checks, validate schemas, and write local handoff files.
- The app reads and writes local files only. It must never send email, call an ESP, mutate a list, or perform any external side effect.
- Sending is always approval-required (outbound + volume). Real scheduling/sending is performed by the configured ESP by the skill, only after the user approves the specific send in the app or in chat. `scripts/execute_decisions.ts` only records handoff operations in `execution_report.json`; it performs no sending itself.
- Treat subscriber data as sensitive. Do not commit `config.local.json`, env files, `app/.data/`, exports, or subscriber lists.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before doing real marketing work.

Private config priority:

1. `KELLY_CAMPAIGNS_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-campaigns/config.local.json`
3. `~/.config/kelly-campaigns/config.json`
4. `skills/kelly-campaigns/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_CAMPAIGNS_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-campaigns/.env.local`
5. `~/.config/kelly-campaigns/.env`

Ask for non-secret setup details only: operator profile (name, role, company, timezone), brand (name, homepage, unsubscribe URL), ESP provider name, from-identities (from-name/from-email/reply-to and when to use each), segments, sending policy (approval-required, daily/hourly caps, min inbox readiness, max spam score), risk keywords, and style/tone. Never ask the user to paste secret values into chat — the ESP API key belongs only in a local env file, referenced from config by `*_env` name.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the dashboard with:

```bash
skills/kelly-campaigns/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3210` (override `KELLY_CAMPAIGNS_UI_PORT`), then falling through `3210`–`3999` if occupied. The launcher reuses a running instance only when `/api/state` proves it is the same app (`app: "kelly-campaigns"`).

Required app views (hash routes):

- `#/overview`: send desk. Human-attention counts, upcoming sends for the next weeks, list health (subscriber count, bounce/complaint/churn rates, avg open/click), and a SEND-phase breakdown.
- `#/campaigns` and `#/campaigns/<send_id>`: the review queue over drafted sends in workflow states `needs_review`, `changes_requested`, `approved`, `done`, `blocked`. Each item shows a stable row ref (`Send #1`), type + phase + quality-gate verdict badges, the segment and audience size, deliverability risk, subject + preview text, an editable body draft, an A/B subject picker when variants exist, a `Review note` textarea, and Approve / Request changes / Block buttons that write to `decisions.json`. Sidebar workflow filters and SEND-phase chips both apply. The queue is read-only while `agent.lock` exists.
- `#/deliverability`: pre-send QA table — SPF/DKIM/DMARC pass flags, spam score, inbox readiness, and the SEND verdict per send, so weak auth or spammy copy is caught before scheduling.
- `#/performance`: open/click/unsub/bounce by sent campaign.
- `#/settings`: sanitized config summary — operator, brand, ESP + secret readiness, from-identities, segments, sending policy, data provider name, and onboarding state. Never expose secret values.

Keep the sidebar workflow filters (All / Needs Review / Approved / Done / Blocked) as the primary nav, plus the views above.

Demo mode:

- `?demo=1` opens a deterministic mock program for documentation and screenshots.
- `?demo=overview`, `?demo=campaigns`, `?demo=deliverability`, `?demo=performance`, and `?demo=detail` select named mock scenes; `detail` deep-links to a send detail.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses must never read or write files under `app/.data/` or any private config.

UI language: support English and Chinese chrome with `Auto` default. Keep subject lines, body copy, segment names, and drafts in their original language.

## File Contract

Read `references/campaigns-schema.md` before editing the app, scripts, or any generated campaign JSON.

Primary local files:

- `app/.data/campaigns_snapshot.json`: normalized program snapshot (segments, sends, list_health, metrics, warnings) generated by the skill/scripts.
- `app/.data/decisions.json`: user verdicts, review notes, edited bodies, and chosen A/B variants keyed by send id, written by the app.
- `app/.data/agent_tasks.json`: queued agent work — sends in `changes_requested` with the user's comment. The skill polls this to pick up revisions.
- `app/.data/execution_report.json`: latest ESP handoff results written by `scripts/execute_decisions.ts`.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill is generating or executing. The app rejects decision writes while it exists.
- `config.local.json`: private operator configuration, ignored by git.

Use `scripts/validate_ui_schema.ts` before relying on a snapshot in the UI. The app may show an empty setup state when no snapshot exists.

## Normal Workflow

1. Detect mode. Default to App UI.
2. Load private config through the config helpers. If only `config.example.json` exists, enter onboarding.
3. When Kelly asks for a campaign, newsletter, or sequence: acquire `app/.data/agent.lock`, build/refresh the relevant segment, draft the send(s) into `sends[]` with `status: "needs_review"`, the correct `type` and SEND `phase`, a clear `reason`, risk badges, deliverability check, subject variants when A/B is intended, and run the `email-quality-auditor` gate to attach `quality_gate` (EQS + verdict). Recompute metrics and list_health, validate with `scripts/validate_ui_schema.ts`, then release the lock.
4. Start/reuse the UI and report the URL so Kelly can review the queue, deliverability, and quality gates.
5. Poll `app/.data/agent_tasks.json` for `changes_requested` items. Re-draft each one according to the user's comment, re-run the gate, set it back to `needs_review`, and clear the task.
6. On "schedule approved sends": re-read `decisions.json`, re-check the lock, and run `scripts/execute_decisions.ts --apply` to record `schedule_send` / `ab_test` operations in `execution_report.json`. Then perform the actual scheduling/sending through the configured ESP with the approved, possibly user-edited body and chosen variant, one send at a time, and mark each `done` afterward.
7. Never schedule a send without an explicit `approve` decision, never schedule one whose gate is `BLOCK` or whose deliverability risk is `high`, and never re-schedule sends already recorded as scheduled/sent.

## Safety Defaults

- Treat every outbound send as approval-required (outbound + volume). Money offers, compliance-sensitive copy, cold outbound, and high send volume raise the bar further.
- A `BLOCK` verdict or `high` deliverability risk is a hard stop; fix authentication or copy before the send is eligible.
- Store only the minimum content needed for review; keep raw subscriber lists and PII out of the snapshot (segments carry names + sizes, not rows).
- Redact the ESP API key and any credential-like strings from logs, reports, and UI state; expose only boolean readiness for configured env vars.
- Keep stable ids (`send_id`, `segment_id`) and `ref` numbers so repeated updates and executions are idempotent.
- If decisions and the snapshot disagree (missing send, stale ref), stop and regenerate rather than guessing.
