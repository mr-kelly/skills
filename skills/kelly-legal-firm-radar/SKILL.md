---
name: kelly-legal-firm-radar
license: MIT
description: Legal-firm radar App-in-Skill dashboard for anonymized casebase analytics, practice-area mix, case-quality indicators, lawyer capability profiles, brand proof points, and approval-gated management reports. Use when the user invokes $kelly-legal-firm-radar, mentions 律师画像, 律所经营分析, 业务布局分析, 案件质量评估, 专业人才梯队, 律师全息品牌, casebase analytics, law-firm management dashboard, or wants a local UI where partners review agent-prepared management insights before export.
---

# Legal Firm Radar

## Overview

Use this skill as a local App-in-Skill desk. It uses anonymized internal casebase metadata to prepare management insights: practice mix, local court outcomes, lawyer capability profiles, quality indicators, and approved brand or staffing reports.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or generate the local snapshot, start or reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present stable refs such as `Insight #1` and record verdicts in local decision files.

## Business Role

Use this as the partner review gate for firm-level analytics. It consumes anonymized casebase metadata and approved summaries to prepare practice mix, lawyer capability, quality, staffing, and brand proof insights with methodology notes. Do not use it for matter strategy, legal advice, raw document review, compensation decisions, or external marketing claims without separate approval.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Legal Firm Radar overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Legal Firm Radar review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Firm radar command desk with partner review load, approved reports, blocked insights, and management activity.</td>
    <td><strong>Review queue</strong><br>Approval-gated management insights for practice mix, lawyer profiles, and brand proof points.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Legal Firm Radar checks"></td>
    <td width="50%"><img src="assets/screenshots/workbench.webp" alt="Legal Firm Radar workbench"></td>
  </tr>
  <tr>
    <td><strong>Checks</strong><br>Analytics QA for anonymization, sample size, attribution, bias caveats, and external-use restrictions.</td>
    <td><strong>Workbench</strong><br>Detail pane for practice analytics, talent signals, quality indicators, and approved management report text.</td>
  </tr>
</table>

## Boundary

- The skill reads user-authorized legal materials or metadata, reasons over them, drafts structured outputs, and writes local handoff files.
- The app reads and writes local files only. It never files documents, sends client advice, contacts counterparties, changes a case system, publishes brand claims, or performs external side effects.
- Every legal position, client-facing output, management report, external citation, filing step, or outbound message is approval-required and happens outside the app only after explicit human approval.
- Treat legal work product, casebase data, client facts, personal data, trade secrets, and internal strategy as sensitive. Do not commit `config.local.json`, env files, `app/.data/`, exports, source documents, or privileged notes.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent or incomplete, guide setup before doing real work.

Private config priority:

1. `KELLY_LEGAL_FIRM_RADAR_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-legal-firm-radar/config.local.json`
3. `~/.config/kelly-legal-firm-radar/config.json`
4. `skills/kelly-legal-firm-radar/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_LEGAL_FIRM_RADAR_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-legal-firm-radar/.env.local`
5. `~/.config/kelly-legal-firm-radar/.env`

Onboarding asks, turn by turn:

- casebase metadata source
- practice taxonomy and lawyer roster fields
- allowed metrics for internal management versus external brand use
- management report export preferences

Never ask the user to paste secret values into chat. Secrets belong only in local env files. When setup is complete and the user confirms, write:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the desk with:

```bash
skills/kelly-legal-firm-radar/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_LEGAL_FIRM_RADAR_UI_PORT` when set. `/api/state` reports `app: "kelly-legal-firm-radar"`.

Required app views:

- `#/overview`: firm analytics desk with practice mix, outcome trends, talent signals, and review queue.
- `#/review`: approval queue for management insights, brand proof points, and staffing recommendations.
- `#/items`: insight workbench with methodology, evidence, suggested action, and visibility limits.
- `#/checks`: analytics QA checks for sample size, privacy, attribution, and unsupported claims.
- `#/entities`: lawyer and practice-area profile cards from anonymized metadata.
- `#/settings`: sanitized taxonomy, provider, and onboarding state.

Demo mode:

- `?demo=1` or `?demo=overview` opens deterministic mock legal data for documentation and testing.
- `?demo=review`, `?demo=items`, `?demo=checks`, `?demo=entities`, and `?demo=detail` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language.
- Demo API responses never read or write files under `app/.data/`.

## File Contract

Read `references/firm-radar-schema.md` before editing the app, scripts, or generated JSON.

- `app/.data/firm_radar_snapshot.json`: canonical snapshot with analytics cards, review items, checks, metrics, and activity log.
- `app/.data/decisions.json`: reviewer verdicts keyed by review item id.
- `app/.data/agent_tasks.json`: queued agent revision work from `request_changes` decisions.
- `app/.data/execution_report.json`: dry-run/apply operations from approved decisions.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes; write endpoints reject with HTTP 423 while it exists.

Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Inputs

- anonymized casebase metadata and approved case summaries
- lawyer roster and practice-area taxonomy
- management questions such as business layout, quality review, or brand proof points
- reporting period and visibility policy

## Workflow

1. Import anonymized metadata only: case type, court, outcome, lawyer/team, dates, and approved tags. Do not import raw confidential documents for management analytics.
2. Prepare insight cards for business layout, quality review, talent planning, or brand proof points with methodology and caveats.
3. Write or merge insight cards through scripts/import_metrics.ts, then validate with scripts/validate_ui_schema.ts.
4. Send partners to #/review to approve, revise, request more data, or block insights before any report export.
5. Run scripts/execute_decisions.ts and export approved reports with scripts/export_management_report.ts. External brand use needs separate explicit approval.

## Review Gates

- Block or request changes when sample size is too small, anonymization is weak, methodology is unclear, lawyer attribution is unfair, or an external brand claim lacks public-citable proof.
- Approve only when the report states period, sample size, taxonomy, caveats, visibility, and whether each proof point is internal-only or public-citable.
- Export only approved or done reports. Keep internal management reports separate from external brand material unless partners explicitly approve the external use.

## Scripts

- `scripts/generate_demo_snapshot.ts`: write deterministic demo data into `app/.data/firm_radar_snapshot.json`.
- `scripts/import_metrics.ts`: merge agent-prepared or imported domain payloads into the snapshot.
- `scripts/validate_ui_schema.ts`: validate the local snapshot file contract.
- `scripts/execute_decisions.ts [--apply]`: dry-run or apply approved reviewer decisions with no external side effects.
- `scripts/export_management_report.ts --out <dir>`: export approved/done items as Markdown, JSON, and CSV handoff files.

## Safety Defaults

- Do not rank lawyers or publish brand claims from small samples without caveats and partner approval.
- Use anonymized metadata for analytics; keep client names, raw documents, private financials, and privileged notes out of the dashboard.
- Treat talent, compensation, hiring, and external marketing claims as approval-required.
- If metrics are incomplete or biased, mark the insight as needing more data rather than overstating conclusions.
