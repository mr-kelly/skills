---
name: kelly-feedback
license: MIT
description: Personal App-in-Skill voice-of-customer desk for aggregating user feedback from support email, Discord/Slack communities, X replies, app-store reviews, surveys, and interviews into clustered feature requests and a roadmap decision queue. Use when the user invokes $kelly-feedback or /kelly-feedback, or mentions user feedback, voice of customer, feature requests, roadmap decisions, feedback clustering, feedback triage, request dedupe, changelog replies, decline replies, or reviewing what users are asking for.
---

# Kelly Feedback

## Overview

Use this skill as Kelly's voice-of-customer desk. It aggregates raw user feedback from every channel (support email, Discord, Slack, X replies, app-store reviews, in-app surveys, interviews) into one file-backed App-in-Skill dashboard, where the agent's dedupe/clustering work becomes feature requests with frequency and user weight, and agent-proposed roadmap changes wait in a decision queue for Kelly's verdict.

Division of labor: the skill (scripts + agent) collects, clusters, and drafts; the app is where Kelly triages feedback and decides on proposals; approved roadmap changes are exported/executed by the agent outside the app (updating a roadmap doc or changelog, handing decline replies to kelly-messenger or kelly-email). Kelly Feedback sits downstream of kelly-email, kelly-messenger, and kelly-social: those skills' agents hand feedback payloads to this skill's ingest script.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local feedback snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present proposals as numbered items (`Proposal #1`, `#2`, ...) and record verdicts in `decisions.json`.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Feedback overview"></td>
    <td width="50%"><img src="assets/screenshots/inbox.webp" alt="Kelly Feedback inbox"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Voice-of-customer desk with weekly inflow by channel, sentiment split, top clusters, and source freshness.</td>
    <td><strong>Inbox</strong><br>Raw feedback stream across email, Discord, Slack, X, and app-store reviews with triage controls.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/requests.webp" alt="Kelly Feedback requests"></td>
    <td width="50%"><img src="assets/screenshots/roadmap.webp" alt="Kelly Feedback roadmap decisions"></td>
  </tr>
  <tr>
    <td><strong>Requests</strong><br>Clustered feature requests with frequency, weighted scores, trend, and representative quotes.</td>
    <td><strong>Roadmap decisions</strong><br>Agent-proposed promote/decline/merge proposals with drafted changelog notes and user replies for approval.</td>
  </tr>
</table>

## Boundary

- Aggregation is local. The skill may read exports/handoff payloads, normalize feedback, cluster it, validate schemas, and write local handoff files.
- The app reads and writes local files only. It must not call feedback platforms, post replies, publish changelogs, or mutate remote systems.
- Any outbound side effect — replying to a user, publishing a changelog note, editing a public roadmap — is approval-required and executed by the agent via other skills (kelly-messenger, kelly-email, docs edits) only after the matching proposal is approved in the decision queue.
- Own-community data only: ingest feedback addressed to Kelly's own products from Kelly's own channels and accounts. Do not scrape third-party communities or collect data about other companies' users.
- Treat feedback as user PII-adjacent. Do not commit `config.local.json`, env files, `app/.data/`, exports, tokens, or raw platform responses.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before ingesting real feedback.

Private config priority:

1. `KELLY_FEEDBACK_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-feedback/config.local.json`
3. `~/.config/kelly-feedback/config.json`
4. `skills/kelly-feedback/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_FEEDBACK_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-feedback/.env.local`
5. `~/.config/kelly-feedback/.env`

Onboarding asks for non-secret setup details only:

- Products: id, display name, one-line tagline for each product feedback can be about.
- Sources: which channels exist (email/discord/slack/x/appstore/survey/interview), how each is collected (sibling-skill handoff, export, manual notes), and which env var names hold any tokens.
- Scoring weights: plan weights (e.g. free=1, pro=3, team=5), default weight, recency half-life.
- Roadmap lanes (default Now / Next / Later) and, optionally, the path of the roadmap document the agent maintains.

Never ask the user to paste secret values into chat. Secrets belong only in local env files. When setup is complete and the user confirms, write `app/.data/onboarding.json`:

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
skills/kelly-feedback/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_FEEDBACK_UI_PORT` when set. `/api/state` reports `app: "kelly-feedback"`.

Required app views:

- `#/overview`: VoC command desk — human-attention panel (roadmap decisions waiting, new uncategorized feedback, requests needing info), feedback-this-week inflow by channel with platform badges, sentiment split bars (inline SVG), top clusters by momentum, and freshness per source.
- `#/inbox` and `#/inbox/<feedback_id>`: raw feedback stream. Rows show channel badge, user handle, product, one-line preview, sentiment, cluster link, and triage state (new/clustered/ignored/insight). Detail shows the full text, user context (plan, tenure, revenue weight), source permalink, linked request, agent note, and triage buttons (assign to request / ignore / mark insight).
- `#/requests` and `#/requests/<request_id>`: clustered feature requests with title, product, frequency, weighted score (frequency × user revenue weight), trend arrow, status (candidate/roadmap/declined/needs_info), and linked feedback count. Detail shows the agent-drafted problem statement and proposed spec summary, representative quotes, all linked feedback, an editable effort-estimate field, and decision history.
- `#/roadmap`: decision queue of agent-proposed roadmap changes (promote to Now/Next/Later, decline with drafted reply, merge duplicates) with reason, evidence, editable draft, a `Review note` textarea, decision buttons (Approve / Request changes / Block), stable refs (`Proposal #1`), and standard workflow states (needs_review / changes_requested / approved / done / blocked). The current roadmap columns (Now / Next / Later) render read-only below the queue. Decision writes honor `agent.lock`.
- `#/settings`: sanitized config summary — products, sources (channel + collection method), scoring weights, env readiness booleans, data provider, onboarding state, and recent sync log. Never expose secret values.

Demo mode:

- `?demo=1` opens a deterministic mock voice-of-customer desk for documentation and screenshots.
- `?demo=overview`, `?demo=inbox`, `?demo=requests`, and `?demo=roadmap` select named mock scenes.
- `?demo=detail` opens a request detail with representative quotes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses must never read or write `app/.data/` or any live platform data; demo decisions are in-memory only.

UI language: support English and Chinese chrome with `Auto` default (persisted override in the sidebar). Keep user quotes, handles, product names, and imported data in their original language.

## File Contract

Read `references/feedback-schema.md` before editing the app, scripts, or any generated JSON.

Primary local files:

- `app/.data/feedback_snapshot.json`: canonical snapshot — sources, raw feedback, clustered requests, roadmap lanes, proposals, derived metrics, sync log.
- `app/.data/decisions.json`: Kelly's verdicts from the UI (proposal approve/request_changes/block with review notes and edited drafts; feedback triage; effort estimates).
- `app/.data/agent_tasks.json`: queued agent work — proposals in `changes_requested` land here for revision.
- `app/.data/execution_report.json`: latest `execute_decisions.ts` output with concrete operations.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while scripts rewrite files; the app rejects decision writes and disables editing while it exists.
- `config.local.json`: private products/sources/scoring configuration, ignored by git.

Use `scripts/validate_ui_schema.ts app/.data/feedback_snapshot.json` before relying on a snapshot in the UI. The app shows an empty setup state when no snapshot exists.

## Ingestion Workflow

`scripts/ingest_feedback.ts` is the single write path for raw feedback. Anyone with a payload — sibling skills' agents, platform exports, or manual notes — hands feedback to Kelly Feedback the same way:

1. Write a payload JSON file (shape in `references/feedback-schema.md`): a `source` block (`source_id`, `channel`, `name`, `collection`) plus `items[]` with stable `external_id`s, text, user context, and timestamps. Suggested drop location: `app/.data/inbox/*.json` or any temp path.
2. Run `node skills/kelly-feedback/scripts/ingest_feedback.ts <payload.json> [more.json ...]`.
3. The script validates, dedupes by `fb-<source_id>-<external_id>` (idempotent re-ingest), merges into the snapshot, updates source freshness and derived metrics, and appends a `sync_log` entry — all under `agent.lock`.

Typical handoffs: kelly-email exports support threads mentioning features; kelly-messenger exports Discord/Slack community posts; kelly-social exports X replies. Those skills' agents build the payload from their own data; this skill never reads their private files directly. New items land with `triage: "new"` and appear in the Inbox and the human-attention panel.

## Clustering Workflow

Clustering is LLM work done by the agent; `scripts/apply_clusters.ts` is the deterministic write path.

1. Read the snapshot and pick out `triage: "new"` items (and any requests needing re-scoring).
2. As the agent, dedupe and cluster: group items expressing the same underlying need, draft or update request records (title, problem statement, proposed spec summary, representative feedback ids, trend), and decide non-request items (`ignored` for spam, `insight` for bugs/patterns worth routing elsewhere).
3. Write a cluster-assignment payload (shape in `references/feedback-schema.md`) and run `node skills/kelly-feedback/scripts/apply_clusters.ts <assignments.json>`. The script validates ids, upserts request drafts, links feedback, recomputes frequency and weighted score from the raw stream, and logs the run — under `agent.lock`.
4. When clusters warrant action, draft proposals into the snapshot's `proposals[]` (promote/decline/merge/changelog) with reason, evidence, and an editable public draft, then send Kelly to `#/roadmap`. Items with `request_changes` verdicts return to the agent via `agent_tasks.json`; after revision set them back to `needs_review`.

## Roadmap Decision Workflow

1. Kelly reviews `#/roadmap`: edits drafts, writes review notes, and clicks Approve / Request changes / Block. The app records verdicts in `decisions.json` (never mutating the snapshot) and enqueues `agent_tasks.json` entries for change requests.
2. Before executing, re-read `decisions.json` and run `node skills/kelly-feedback/scripts/execute_decisions.ts` (dry-run) to produce `execution_report.json` with concrete operations: `update_roadmap` (target lane), `publish_changelog_note` (draft id), `send_decline_reply` (handoff to kelly-messenger/kelly-email), `merge_requests`.
3. Show Kelly the dry-run summary. After confirmation, run with `--apply`: local operations (roadmap lanes, merges, request/proposal statuses) are applied to the snapshot; outbound operations are marked `handoff_ready` only.
4. Execute `handoff_ready` operations as the agent via the appropriate skill (send the decline reply through kelly-messenger/kelly-email, update the changelog/roadmap document), then record the outcome back into the snapshot's sync log.
5. Poll `agent_tasks.json` for `revise_proposal` tasks; revise drafts per the review note and return proposals to `needs_review`.

## Safety Defaults

- Treat every outbound message (decline replies, changelog posts, roadmap publications) as approval-required, one proposal at a time.
- Never invent feedback or inflate counts; frequency and weighted score must derive from real linked items.
- Keep local content minimal: store trimmed feedback text and safe permalinks, not raw platform API responses or attachments.
- Use stable ids everywhere (`external_id` dedupe keys, request ids, proposal refs) so re-ingest and re-execution are idempotent.
- If the schema and UI disagree, stop and fix the schema or UI before executing decisions.
