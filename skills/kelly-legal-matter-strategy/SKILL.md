---
name: kelly-legal-matter-strategy
license: MIT
description: Legal matter-strategy App-in-Skill desk for new-case strategy, issue trees, evidence checklists, risk analysis, pleading outlines, and approval-gated drafting packs grounded in internal precedents. Use when the user invokes $kelly-legal-matter-strategy, mentions 案件策略, 办案辅助, 证据清单, 争议焦点, 文书生成辅助, litigation strategy, arbitration strategy, pleading outline, or wants a local UI where responsible lawyers review agent-prepared strategy before use.
---

# Legal Matter Strategy

## Overview

Use this skill as a local App-in-Skill desk. It builds reviewer-gated matter strategy packs from facts and internal precedents: issue tree, evidence map, risk posture, negotiation options, and pleading or memo outlines.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or generate the local snapshot, start or reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar; in that mode present stable refs such as `Strategy #1` and record verdicts in local decision files.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Legal Matter Strategy overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Legal Matter Strategy review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Matter-strategy command desk with partner review load, ready-to-draft strategies, blocked items, and activity.</td>
    <td><strong>Review queue</strong><br>Issue-tree and evidence-map recommendations with responsible-lawyer approval controls.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Legal Matter Strategy checks"></td>
    <td width="50%"><img src="assets/screenshots/workbench.webp" alt="Legal Matter Strategy workbench"></td>
  </tr>
  <tr>
    <td><strong>Checks</strong><br>Strategy QA for missing facts, evidence gaps, deadline caveats, precedent grounding, and risk warnings.</td>
    <td><strong>Workbench</strong><br>Detail pane for issue tree, evidence map, risk posture, negotiation options, and draft outline.</td>
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

1. `KELLY_LEGAL_MATTER_STRATEGY_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-legal-matter-strategy/config.local.json`
3. `~/.config/kelly-legal-matter-strategy/config.json`
4. `skills/kelly-legal-matter-strategy/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_LEGAL_MATTER_STRATEGY_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-legal-matter-strategy/.env.local`
5. `~/.config/kelly-legal-matter-strategy/.env`

Onboarding asks, turn by turn:

- enabled matter types and jurisdictions
- strategy template preferences
- evidence taxonomy and risk scale
- export destinations for approved strategy packs

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
skills/kelly-legal-matter-strategy/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_LEGAL_MATTER_STRATEGY_UI_PORT` when set. `/api/state` reports `app: "kelly-legal-matter-strategy"`.

Required app views:

- `#/overview`: strategy command desk with partner-review queue, evidence gaps, and deadline pressure.
- `#/review`: approval queue for strategy packs with issue trees, evidence notes, and risk posture.
- `#/items`: strategy workbench with editable plan, pleading outline, and negotiation options.
- `#/checks`: strategy QA checks for unsupported conclusions, evidence gaps, and approval-required legal positions.
- `#/entities`: matter library grouped by cause, stage, responsible lawyer, and outcome.
- `#/settings`: sanitized strategy template and provider configuration.

Demo mode:

- `?demo=1` or `?demo=overview` opens deterministic mock legal data for documentation and testing.
- `?demo=review`, `?demo=items`, `?demo=checks`, `?demo=entities`, and `?demo=detail` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language.
- Demo API responses never read or write files under `app/.data/`.

## File Contract

Read `references/strategy-schema.md` before editing the app, scripts, or generated JSON.

- `app/.data/strategy_snapshot.json`: canonical snapshot with strategy packs, review items, checks, metrics, and activity log.
- `app/.data/decisions.json`: reviewer verdicts keyed by review item id.
- `app/.data/agent_tasks.json`: queued agent revision work from `request_changes` decisions.
- `app/.data/execution_report.json`: dry-run/apply operations from approved decisions.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes; write endpoints reject with HTTP 423 while it exists.

Validate with `scripts/validate_ui_schema.ts` before relying on a snapshot.

## Inputs

- new matter facts, client goal, deadlines, and procedural posture
- approved precedent packs from the precedent desk
- available evidence list and missing-evidence concerns
- reviewer role and desired deliverable type

## Workflow

1. Clarify the client objective, procedural posture, deadline, jurisdiction, and available evidence before drafting strategy.
2. Ground every strategic recommendation in supplied facts, approved precedent packs, or explicit assumptions.
3. Write or merge strategy items through scripts/create_strategy_batch.ts, then validate with scripts/validate_ui_schema.ts.
4. Send the responsible lawyer or partner to #/review to approve, edit, request changes, or block the strategy.
5. Run scripts/execute_decisions.ts and export approved packs with scripts/export_strategy_pack.ts for downstream drafting. No filing, sending, or client advice occurs from the app.

## Scripts

- `scripts/generate_demo_snapshot.ts`: write deterministic demo data into `app/.data/strategy_snapshot.json`.
- `scripts/create_strategy_batch.ts`: merge agent-prepared or imported domain payloads into the snapshot.
- `scripts/validate_ui_schema.ts`: validate the local snapshot file contract.
- `scripts/execute_decisions.ts [--apply]`: dry-run or apply approved reviewer decisions with no external side effects.
- `scripts/export_strategy_pack.ts --out <dir>`: export approved/done items as Markdown, JSON, and CSV handoff files.

## Safety Defaults

- Do not fabricate facts, evidence, procedural deadlines, counsel approval, or expected judicial outcomes.
- Treat legal advice, settlement posture, filing strategy, and client communications as approval-required.
- If evidence is missing, mark the strategy as needing information rather than filling the gap.
- Approved exports are internal work product unless the responsible lawyer explicitly repurposes them elsewhere.
