---
name: kelly-legal-contracts
license: MIT
description: Legal-contract App-in-Skill review desk for NDAs, MSAs, DPAs, SOWs, clause playbooks, risk checks, fallback language, and approval-gated issue-list exports. Use when the user invokes $kelly-legal-contracts or /kelly-legal-contracts, mentions legal, 法务, contract review, 合同审阅, NDA, MSA, DPA, SOW, redlines, clause playbook, legal intake, issue list, or wants a local UI where a human legal reviewer approves, revises, or blocks agent-prepared contract issues.
---

# Kelly Legal Contracts

## Overview

Use this skill as a local legal-contract review desk. The agent can ingest contract facts or extracted clauses, map issues against a company playbook, draft fallback language, and prepare issue-list exports. The human legal reviewer inspects every issue in a local App UI, edits recommendations, approves safe exports, requests changes, or blocks high-risk items.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or ingest the contract review snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present numbered issues (`Issue #1`) and take verdicts in conversation.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Legal Contracts overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Kelly Legal Contracts review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Legal command desk with contract × workstream status, risk pass rate, review queue preview, and recent activity.</td>
    <td><strong>Review queue</strong><br>Approval-gated legal issue queue with approve / request changes / block decisions and audit notes.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Kelly Legal Contracts risk checks"></td>
    <td width="50%"><img src="assets/screenshots/issues.webp" alt="Kelly Legal Contracts issue workbench"></td>
  </tr>
  <tr>
    <td><strong>Risk checks</strong><br>Per-rule pass/warn/fail results across clause issues, including hard-stop terms and playbook violations.</td>
    <td><strong>Clause issues</strong><br>Editable issue detail with fallback language, memo fields, reviewer rationale, and risk-check evidence.</td>
  </tr>
</table>

## Boundary

- This skill assists legal operations and contract review; it does not provide final legal advice and does not replace licensed counsel or an authorized legal reviewer.
- The skill may read user-supplied contract text, summaries, playbooks, and clause positions; draft issue summaries and fallback language; run deterministic risk checks; and write local handoff files.
- The app reads and writes local files only. It never sends redlines, emails counterparties, signs contracts, accepts terms, deletes files, or performs external side effects.
- Every outbound legal position, redline, counterparty message, approval, signature, filing, or waiver is approval-required and happens outside the app only after explicit human approval.
- Treat contracts and playbooks as sensitive. Do not commit `config.local.json`, env files, `app/.data/`, exports, contract text, counterparties, or privileged notes.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before doing real work.

Private config priority:

1. `KELLY_LEGAL_CONTRACTS_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-legal-contracts/config.local.json`
3. `~/.config/kelly-legal-contracts/config.json`
4. `skills/kelly-legal-contracts/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_LEGAL_CONTRACTS_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-legal-contracts/.env.local`
5. `~/.config/kelly-legal-contracts/.env`

Onboarding asks, turn by turn: legal profile (company/entity, reviewer role, preferred risk scale), enabled workstreams (`nda`, `msa`, `dpa`, `sow`), jurisdictions, clause playbook sources, hard-stop terms, escalation policy, export preferences, and which external skill handles approved sends/redlines if any. Ask for non-secret details only; secrets belong only in local env files. When setup is complete and the user confirms, write:

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
skills/kelly-legal-contracts/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_LEGAL_CONTRACTS_UI_PORT` when set. `/api/state` reports `app: "kelly-legal-contracts"`.

Required app views:

- `#/overview`: legal command desk with contract × workstream status, risk pass rate, review queue preview, and recent activity.
- `#/products` and `#/products/<id>`: contract library. The internal schema keeps the generic `products[]` key, but the UI presents them as contracts with counterparty, matter type, facts, key obligations, watch terms, required document checklist, and linked issues.
- `#/drafts` and `#/drafts/<id>`: clause issue workbench. Internal `drafts[]` are agent-prepared contract issues with editable fallback language, negotiation notes, memo summary, and linked risk checks.
- `#/checks`: deterministic risk checks across issues, including required fields, title limits, hard-stop terms, restricted positions, document checklist, and clause-playbook violations.
- `#/claims`: clause playbook. Internal `claims[]` are approved fallback clauses or rejected positions; `rules[]` are hard-stop/restricted terms.
- `#/review`: approval queue with workflow states (`needs_review` / `changes_requested` / `approved` / `done` / `blocked`), risk summary, reviewer rationale, decision buttons, `Review note`, and stable refs (`Issue #1`). `done` means exported or handed off in the execution report.
- `#/settings`: sanitized legal profile, enabled workstreams/rules, jurisdictions, hard-stop term counts, export prefs, data provider, and onboarding state. Never expose secret values or raw private playbooks.

Demo mode:

- `?demo=overview`, `?demo=products`, `?demo=drafts`, `?demo=checks`, `?demo=claims`, `?demo=review`, and `?demo=detail` open deterministic mock scenes for documentation and screenshots.
- `lang=en` or `lang=zh` forces UI chrome language. Demo legal metadata is localized; contract/legal terms may stay in English when that is realistic.
- Deep links such as `/?demo=detail&lang=zh#/drafts/d-msa-liability-us` must work.
- Demo API responses never read or write files under `app/.data/`.

## File Contract

Read `references/contracts-schema.md` before editing the app, scripts, or any generated JSON.

- `app/.data/contract_snapshot.json`: contracts, issues, risk rules, checks, review items, metrics, activity log.
- `app/.data/claims.json`: clause playbook — approved fallback clauses, rejected positions, and hard-stop/restricted terms.
- `app/.data/decisions.json`: reviewer verdicts keyed by review id.
- `app/.data/agent_tasks.json`: queued `revise_contract_issue` work for the agent.
- `app/.data/execution_report.json`: export, handoff, and revision operations.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes; write endpoints reject with HTTP 423 while it exists.

Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Review Workflow

1. Collect inputs: contract type, counterparty, our entity, governing law, deal owner, target date, business ask, extracted clause text, and company playbook positions.
2. Create or update contract records and issue records with `scripts/ingest_contracts.ts payload.json`. The current schema keeps generic keys (`products`, `drafts`, `platform`) for compatibility; map them as contract, issue, and workstream (`nda`, `msa`, `dpa`, `sow`).
3. Run `scripts/run_checks.ts` to refresh deterministic risk checks and scores. The checks catch missing fields, hard-stop terms, restricted positions, all-caps/noisy terms, overlong notes, incomplete document checklists, and clause-playbook violations.
4. Send the reviewer to `#/review`. Verdicts persist through `POST /api/decision` into `decisions.json`. Field edits saved in the workbench arrive as `revise` decisions carrying edited issue fields.
5. Poll `app/.data/agent_tasks.json` for `revise_contract_issue` tasks created by `request_changes`. Redraft the issue per the comment and return it to `needs_review`.
6. Before executing anything, re-read decisions and run `node scripts/execute_decisions.ts` (dry-run). With `--apply` it records `export_issue_list`, `handoff_redline`, and `request_revision` operations in `execution_report.json` — no external side effects.

## Export Workflow

`node scripts/export_issues.ts --out <dir>` writes approved issues as Markdown issue memos plus `issues.csv`. It records `export_issue_list` entries and marks those issues `done`.

Actual sending, redline generation, counterparty communications, CLM updates, signature, or filing happen only outside the app after explicit approval, through the user or a separate approved connector/skill.

## Safety Defaults

- Never fabricate legal approval, waiver, signature authority, regulatory conclusion, or attorney review.
- Treat legal, privacy, money, IP, employment, and dispute-related terms as approval-required.
- Do not send issue lists, redlines, fallback clauses, or counterparty messages without an explicit `approve` decision.
- If a hard-stop term is present (`uncapped liability`, `perpetual data retention`, broad indemnity, missing DPA terms), block or request changes rather than weakening the rule.
- Preserve privilege and confidentiality: keep local data minimal, avoid copying full contracts when summaries/evidence snippets suffice, and never expose raw secrets or private playbooks through `/api/state`, logs, reports, screenshots, or exported demo data.
