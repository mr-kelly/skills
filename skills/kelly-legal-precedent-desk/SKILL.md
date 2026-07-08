---
name: kelly-legal-precedent-desk
license: MIT
description: Legal precedent App-in-Skill desk for internal casebase search, local court-pattern analysis, similar-case packs, AI Q&A, citations, and approval-gated research exports. Use when the user invokes $kelly-legal-precedent-desk, mentions 类案检索, 本地裁判尺度, 内部案例库查询, AI 智能问答, 案例查阅与收藏, precedent research, similar cases, legal research pack, or wants a local UI where lawyers review agent-prepared precedent findings before reuse.
---

# Legal Precedent Desk

## Overview

Use this skill as a local App-in-Skill desk. It finds and packages internal precedents for a new legal question: similar facts, local court tendencies, decisive evidence, holdings, citations, and a reviewer-approved research memo.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or generate the local snapshot, start or reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present stable refs such as `Pack #1` and record verdicts in local decision files.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Legal Precedent Desk overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Legal Precedent Desk review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Precedent command desk with packs awaiting review, high-match cases, approved packs, and recent activity.</td>
    <td><strong>Review queue</strong><br>Similar-case packs with local court-pattern notes, citations, evidence, and approval controls.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Legal Precedent Desk checks"></td>
    <td width="50%"><img src="assets/screenshots/workbench.webp" alt="Legal Precedent Desk workbench"></td>
  </tr>
  <tr>
    <td><strong>Checks</strong><br>Quality checks for citation traceability, similarity rationale, jurisdiction fit, and confidentiality limits.</td>
    <td><strong>Workbench</strong><br>Detail view for precedent reasoning, decisive facts, internal citations, draft memo, and review note.</td>
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

1. `KELLY_LEGAL_PRECEDENT_DESK_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-legal-precedent-desk/config.local.json`
3. `~/.config/kelly-legal-precedent-desk/config.json`
4. `skills/kelly-legal-precedent-desk/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_LEGAL_PRECEDENT_DESK_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-legal-precedent-desk/.env.local`
5. `~/.config/kelly-legal-precedent-desk/.env`

Onboarding asks, turn by turn:

- casebase data-provider or export path
- enabled jurisdictions and practice areas
- similarity fields and citation policy
- research-pack export preferences

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
skills/kelly-legal-precedent-desk/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_LEGAL_PRECEDENT_DESK_UI_PORT` when set. `/api/state` reports `app: "kelly-legal-precedent-desk"`.

Required app views:

- `#/overview`: precedent research desk with open questions, match quality, and local court-pattern summaries.
- `#/review`: approval queue for precedent packs with citations, quote snippets, and reviewer notes.
- `#/items`: research-pack workbench with question, answer outline, similar cases, and recommended use.
- `#/checks`: citation and confidentiality checks for source coverage, quote limits, and internal-use labels.
- `#/entities`: similar-case library grouped by issue, court, outcome, and lawyer.
- `#/settings`: sanitized casebase/provider configuration and onboarding state.

Demo mode:

- `?demo=1` or `?demo=overview` opens deterministic mock legal data for documentation and testing.
- `?demo=review`, `?demo=items`, `?demo=checks`, `?demo=entities`, and `?demo=detail` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language.
- Demo API responses never read or write files under `app/.data/`.

## File Contract

Read `references/precedent-schema.md` before editing the app, scripts, or generated JSON.

- `app/.data/precedent_snapshot.json`: canonical snapshot with precedent packs, review items, checks, metrics, and activity log.
- `app/.data/decisions.json`: reviewer verdicts keyed by review item id.
- `app/.data/agent_tasks.json`: queued agent revision work from `request_changes` decisions.
- `app/.data/execution_report.json`: dry-run/apply operations from approved decisions.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes; write endpoints reject with HTTP 423 while it exists.

Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Inputs

- new matter facts or a focused legal question
- internal casebase records approved by the ingest skill
- jurisdiction, court level, cause of action, and desired output format
- citation policy and confidentiality limits

## Workflow

1. Clarify the new matter facts, legal question, target jurisdiction, and whether the output is for internal research, client advice, or drafting support.
2. Search the approved internal casebase and prepare a precedent pack with similarity rationale, court-pattern notes, citations, and use limits.
3. Write or merge packs through scripts/create_research_batch.ts, then validate with scripts/validate_ui_schema.ts.
4. Send the lawyer to #/review to approve, revise, request more cases, or block unsafe findings.
5. Run scripts/execute_decisions.ts and export approved packs with scripts/export_research_pack.ts. Do not cite or send unapproved findings externally.

## Scripts

- `scripts/generate_demo_snapshot.ts`: write deterministic demo data into `app/.data/precedent_snapshot.json`.
- `scripts/create_research_batch.ts`: merge agent-prepared or imported domain payloads into the snapshot.
- `scripts/validate_ui_schema.ts`: validate the local snapshot file contract.
- `scripts/execute_decisions.ts [--apply]`: dry-run or apply approved reviewer decisions with no external side effects.
- `scripts/export_research_pack.ts --out <dir>`: export approved/done items as Markdown, JSON, and CSV handoff files.

## Safety Defaults

- Do not present internal precedent findings as final legal advice or guaranteed outcomes.
- Keep client names and privileged strategy out of exported packs unless expressly approved.
- Every quoted snippet must trace to an approved case record and respect the configured quote policy.
- If the internal casebase does not contain enough similar cases, say so and route to external legal research instead of inventing support.
