---
name: kelly-legal-casebase-ingest
license: MIT
description: Legal casebase App-in-Skill intake and anonymization QA desk for law-firm judgment and award documents. Use when the user invokes $kelly-legal-casebase-ingest, mentions internal case database, 智能案例库, 裁判文书入库, 脱敏, 结构化, 分类标注, 案例审核, 质量验收, or wants a local UI where reviewers approve, revise, or block agent-prepared case records before they become searchable knowledge assets.
---

# Legal Casebase Ingest

## Overview

Use this skill as a local App-in-Skill desk. It turns archived judgments and arbitral awards into reviewed internal case records: anonymization checks, issue tags, court/cause metadata, reasoning snippets, and reviewer approval before ingest.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or generate the local snapshot, start or reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present stable refs such as `Intake #1` and record verdicts in local decision files.

## Business Role

Use this as the upstream quality gate for the legal knowledge system. It converts source documents into anonymized, source-backed case records that can feed precedent research and firm analytics after approval. Do not use it to answer a new legal question, build matter strategy, or prepare management conclusions; route those to the downstream legal skills after the case record is approved.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Legal Casebase Ingest overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Legal Casebase Ingest review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Casebase command desk with intake progress, anonymization risk, review load, and recent activity.</td>
    <td><strong>Review queue</strong><br>Approval-gated case records with stable refs, anonymization evidence, review notes, and decision controls.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Legal Casebase Ingest checks"></td>
    <td width="50%"><img src="assets/screenshots/workbench.webp" alt="Legal Casebase Ingest workbench"></td>
  </tr>
  <tr>
    <td><strong>Checks</strong><br>Deterministic QA checks for PII leakage, taxonomy completeness, source coverage, and tag confidence.</td>
    <td><strong>Workbench</strong><br>Detail pane for facts, reasoning, legal basis, tags, editable draft, and reviewer note before ingest.</td>
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

1. `KELLY_LEGAL_CASEBASE_INGEST_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-legal-casebase-ingest/config.local.json`
3. `~/.config/kelly-legal-casebase-ingest/config.json`
4. `skills/kelly-legal-casebase-ingest/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_LEGAL_CASEBASE_INGEST_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-legal-casebase-ingest/.env.local`
5. `~/.config/kelly-legal-casebase-ingest/.env`

Onboarding asks, turn by turn:

- case-source folders or handoff export format
- allowed document types and jurisdictions
- anonymization policy and reviewer sampling rate
- required taxonomy fields such as cause, court, proceeding, lawyer, and outcome

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
skills/kelly-legal-casebase-ingest/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_LEGAL_CASEBASE_INGEST_UI_PORT` when set. `/api/state` reports `app: "kelly-legal-casebase-ingest"`.

Required app views:

- `#/overview`: intake command desk with ingest progress, QA burden, anonymization risk, and recent batches.
- `#/review`: approval queue for case records with anonymization evidence and reviewer notes.
- `#/items`: case-record workbench with facts, court reasoning, legal basis, tags, and source snippets.
- `#/checks`: deterministic QA checks for PII leakage, missing metadata, source coverage, and tag confidence.
- `#/entities`: canonical case library preview grouped by cause, court, lawyer, and status.
- `#/settings`: sanitized config summary, onboarding state, and data-provider status.

Demo mode:

- `?demo=1` or `?demo=overview` opens deterministic mock legal data for documentation and testing.
- `?demo=review`, `?demo=items`, `?demo=checks`, `?demo=entities`, and `?demo=detail` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language.
- Demo API responses never read or write files under `app/.data/`.

## File Contract

Read `references/casebase-schema.md` before editing the app, scripts, or generated JSON.

- `app/.data/casebase_snapshot.json`: canonical snapshot with case records, review items, checks, metrics, and activity log.
- `app/.data/decisions.json`: reviewer verdicts keyed by review item id.
- `app/.data/agent_tasks.json`: queued agent revision work from `request_changes` decisions.
- `app/.data/execution_report.json`: dry-run/apply operations from approved decisions (written only by `scripts/execute_decisions.ts`).
- `app/.data/export_report.json`: paths/formats written by `scripts/export_case_records.ts`; kept separate so exports never overwrite the decision-execution audit trail.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes; write endpoints reject with HTTP 423 while it exists.

Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Inputs

- archived judgment PDFs/DOCX/text from the matter management system
- court or arbitral award metadata
- anonymization rules aligned to the People's Court case database standard
- reviewer sampling plan and required tags

## Workflow

1. Collect document exports from the matter system or a safe local folder; never paste full privileged files into chat when paths can be used.
2. Run the agent extraction pass to produce records with facts, issues, holdings, legal basis, tags, and anonymization evidence.
3. Write or merge records through scripts/ingest_documents.ts, then validate with scripts/validate_ui_schema.ts.
4. Send reviewers to #/review. Approve, request changes, revise, or block records; every decision is written to decisions.json.
5. Run scripts/execute_decisions.ts as a dry run, then with --apply to mark approved records done and write an execution report. Export approved records with scripts/export_case_records.ts.

## Review Gates

- Block or request changes when PII evidence is missing, anonymization checks fail, duplicate risk is unresolved, required taxonomy is incomplete, source coverage is thin, or extraction confidence is low.
- Approve only when the record has enough facts, reasoning, legal basis, tags, and source pointers for downstream reuse without exposing raw client names or privileged source text.
- Export only approved or done records, and keep downstream visibility explicit: precedent desk and firm radar may consume sanitized records; client advice and filings remain outside this app.

## Scripts

- `scripts/generate_demo_snapshot.ts`: write deterministic demo data into `app/.data/casebase_snapshot.json`.
- `scripts/ingest_documents.ts`: merge agent-prepared or imported domain payloads into the snapshot.
- `scripts/validate_ui_schema.ts`: validate the local snapshot file contract.
- `scripts/execute_decisions.ts [--apply]`: dry-run or apply approved reviewer decisions with no external side effects.
- `scripts/export_case_records.ts --out <dir>`: export approved/done items as Markdown, JSON, and CSV handoff files.

## Safety Defaults

- Treat all source documents, parties, trade secrets, personal data, and attorney work product as sensitive.
- Do not ingest a record if anonymization evidence is missing, PII-risk checks fail, or reviewer approval is absent.
- Preserve enough facts, reasoning, and legal application for reuse while minimizing raw source text.
- Never expose private source text, secrets, or real client names through demo data, screenshots, logs, or config summaries.
