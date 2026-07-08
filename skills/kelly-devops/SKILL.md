---
name: kelly-devops
license: MIT
description: Personal App-in-Skill ops desk for Kelly's multi-product SaaS fleet. Use when the user invokes $kelly-devops or /kelly-devops, or asks about uptime, service health checks, SSL certificate expiry, domain renewal, domain expiry, API key rotation, token rotation reminders, cloud spend anomaly, billing spikes, ops desk, incident review, or reviewing agent-proposed action cards (renew domain, rotate key, investigate spend, restart service, acknowledge incident).
---

# Kelly DevOps

## Overview

Use this skill as Kelly's product-fleet operations desk. It watches the health and expiry surface of a multi-product SaaS portfolio — service uptime, SSL certificate expiry, domain registration expiry, API key/token rotation reminders, and cloud spend anomalies — in one file-backed App-in-Skill dashboard, plus a review queue of agent-proposed action cards. The skill runs the checks and prepares actions; Kelly approves; the agent executes approved actions outside the app.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh the ops snapshot with the check scripts, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; then present numbered action cards (`Action #1`) and take verdicts in chat.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly DevOps overview"></td>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly DevOps action queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Fleet health desk with service, certificate, domain, and spend summaries plus a recent events feed.</td>
    <td><strong>Action queue</strong><br>Agent-proposed renew/rotate/investigate action cards with evidence and approval controls.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/expiries.webp" alt="Kelly DevOps expiry ledger"></td>
    <td width="50%"><img src="assets/screenshots/services.webp" alt="Kelly DevOps services"></td>
  </tr>
  <tr>
    <td><strong>Expiry ledger</strong><br>Domains, SSL certificates, key rotations, and plan renewals in one table with color-coded days-left.</td>
    <td><strong>Services</strong><br>Monitored endpoints with uptime, latency sparklines, TLS certificate status, and check history.</td>
  </tr>
</table>

## Boundary

- Checks are read-only network probes of Kelly's own endpoints and domains: HTTP GET for status/latency, a TLS handshake for certificate expiry, and public RDAP lookups for domain expiry. Nothing else is contacted.
- The app reads and writes local files only. It must not probe endpoints, call registrars or cloud APIs, renew anything, rotate anything, or restart anything.
- Renewals, key rotations, service restarts, and spend remediation are approval-required and executed by the agent outside the app, only after the matching action card is `approved`.
- Never store registrar, cloud, or provider credentials in the repo. Secrets live only in local env files referenced by name from private config (`*_env` keys).
- Do not commit `config.local.json`, env files, `app/.data/`, billing exports, or raw provider responses.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before running real checks.

Private config priority:

1. `KELLY_DEVOPS_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-devops/config.local.json`
3. `~/.config/kelly-devops/config.json`
4. `skills/kelly-devops/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_DEVOPS_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-devops/.env.local`
5. `~/.config/kelly-devops/.env`

Onboarding asks, turn by turn: products in the portfolio, monitored endpoints (name/URL/product), domains (registrar, auto-renew flag), API keys under rotation policy (name, env var, rotate-every-days, last rotation), billing sources (provider plus `*_env` names for credentials), and thresholds (expiry warning days, degraded latency, spend anomaly %). Ask for non-secret details only; secrets go into local env files, never chat.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the ops desk with:

```bash
skills/kelly-devops/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_DEVOPS_UI_PORT` when set. `/api/state` reports `app: "kelly-devops"`.

Required app views:

- `#/overview`: ops command desk. Human-attention panel (actions needing decision, items expiring within 14 days, services down), fleet summary cards (services up/total, certs ok/expiring, domains ok/expiring, month-to-date spend vs last month), recent events feed, and check freshness per check type.
- `#/services` and `#/services/<id>`: monitored endpoints with name, product, URL, status (up/degraded/down), latency, 7-day uptime, and cert days-left. Detail shows recent check history with an inline SVG latency sparkline, certificate summary (issuer, expiry), response metadata, and warnings.
- `#/expiries` and `#/expiries/<id>`: one expiry ledger across types (domain, ssl_cert, api_key_rotation, plan_renewal) with item, product, type badge, expiry date, color-coded days-left (<7 red, <30 amber), auto-renew flag, and linked action. Detail shows renewal guidance.
- `#/spend`: per-provider cards (MTD, last month, delta %, anomaly flag) and a per-product allocation table. Anomaly cards link to their action card.
- `#/actions` and `#/actions/<id>`: the review queue with workflow states `needs_review`, `changes_requested`, `approved`, `done`, `blocked`. Each card shows a stable ref (`Action #1`), type, reason, evidence, concrete plan, editable review note, and decision buttons (approve / request changes / block). Decisions are rejected while `agent.lock` exists.
- `#/settings`: sanitized config summary. Monitored services/domains, key rotation entries, billing sources with env readiness booleans, data provider name, onboarding state. Never expose secret values.

Demo mode:

- `?demo=1` opens a deterministic mock ops desk for documentation and screenshots.
- `?demo=overview`, `?demo=services`, `?demo=expiries`, `?demo=spend`, and `?demo=actions` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write live endpoints or files under `app/.data/`, and demo decisions are never persisted.

UI language: support English and Chinese chrome with `Auto` default. Keep service names, URLs, domain names, and provider names in their original form.

## File Contract

Read `references/ops-schema.md` before editing the app, scripts, or any generated ops JSON.

Primary local files:

- `app/.data/ops_snapshot.json`: canonical snapshot (services, expiries, spend, actions, events, metrics).
- `app/.data/decisions.json`: user verdicts keyed by action id.
- `app/.data/agent_tasks.json`: queued agent work from `request_changes` verdicts. Poll this to pick up revisions.
- `app/.data/execution_report.json`: planned operations from `execute_decisions.ts` (dry-run).
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill checks or rewrites files; the actions queue honors it.
- `config.local.json`: private fleet configuration, ignored by git.

Use `scripts/validate_ui_schema.ts app/.data/ops_snapshot.json` before relying on a snapshot in the UI. The app shows an empty setup state when no snapshot exists.

## Check Workflow

1. Detect mode. Default to App UI.
2. Load private config through the store helpers. If only `config.example.json` exists, enter onboarding.
3. Run checks on a sensible cadence (or when the user asks):
   - `node scripts/check_services.ts` — HTTP status/latency per endpoint plus TLS certificate expiry via `node:tls`; merges service health, cert expiries, key-rotation reminders, and events. Run every visit or every few hours.
   - `node scripts/sync_domains.ts` — domain expiry via RDAP (`https://rdap.org/domain/<name>`); per-domain failures degrade gracefully. Run daily or on demand.
   - `node scripts/ingest_spend.ts <payload.json>` — the single write-path for billing data. The agent gathers the payload from cloud billing tools/exports (for example the aws-billing/google-cloud-billing skills), then this script validates, merges, and flags anomalies (MTD above the configured % of last month) and proposes `investigate_spend` action cards.
4. Every script acquires `app/.data/agent.lock` before writing and releases it after; scripts refuse to run over a foreign lock.
5. Validate the snapshot, start/reuse the UI, and report the URL plus what needs a decision.
6. Propose action cards for anything that needs a human call (renew_domain, rotate_key, investigate_spend, restart_service, ack_incident) with reason, evidence, and a concrete plan.

## Actions Workflow

1. The user reviews action cards in `#/actions` (or by ref in chat) and gives verdicts: approve, request changes (with a note), or block. Notes save to `decisions.json` and the snapshot.
2. `request_changes` enqueues the card in `app/.data/agent_tasks.json`. Poll it, revise the card (new evidence/plan), set it back to `needs_review`, and clear the task.
3. For approved cards, run `node scripts/execute_decisions.ts` to write `execution_report.json` with concrete planned operations (`renew_domain` → registrar + domain, `rotate_key` → env var name, `investigate_spend` → provider, `restart_service` → service id, `ack_incident` → event id). The script is a dry-run stub with no external side effects.
4. Re-read decisions immediately before executing. Execute approved operations outside the app with the user's tools, then mark cards `done` in the snapshot and append an event.
5. If a target is missing (no registrar, no env var name), block and ask for configuration instead of guessing.

## Safety Defaults

- Treat domain renewals, key rotation, service restarts, DNS changes, billing changes, and anything spending money as approval-required.
- Prefer read-only credentials for billing sources when possible.
- Redact tokens and token-like strings in logs, reports, and UI state; expose only env-var readiness booleans.
- Keep stable ids (`service_id`, `expiry_id`, `action_id`, `ref`) so repeated checks and executions are idempotent.
- If a check result looks inconsistent (e.g. cert days-left disagrees with RDAP), surface a warning and ask; do not invent corrections.
