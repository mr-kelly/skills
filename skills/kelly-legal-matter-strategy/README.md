# Legal Matter Strategy

Legal Matter Strategy is a Busabase App-in-Skill matter-strategy desk for new-case strategy, issue trees, evidence checklists, risk analysis, pleading outlines, and approval-gated drafting packs grounded in internal precedents. The agent prepares strategy packs — issue tree, evidence map, risk posture, negotiation options, and pleading outlines; the responsible lawyer approves, revises, requests changes, or blocks every pack through the App-in-Skill review queue before it becomes an approved drafting handoff.

## What It Shows

- Overview: strategy command desk with partner-review queue, evidence gaps, and deadline pressure.
- Workbench (`#/items`): editable strategy plan, pleading outline, and negotiation options.
- Review queue: approval-gated strategy packs with stable refs (`Strategy #1`), evidence, review notes, and decision controls (approve / request changes / revise / block).
- Checks: strategy QA checks for unsupported conclusions, evidence gaps, and approval-required legal positions.
- Library (`#/entities`): matter families, issue clusters, and strategy lanes grouped by cause, stage, and responsible lawyer.
- Settings: sanitized firm profile, strategy policy, drafting templates, export preferences, and data-provider status.

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
  <tr>
    <td width="50%"><img src="assets/screenshots/entities.webp" alt="Legal Matter Strategy library"></td>
  </tr>
  <tr>
    <td><strong>Library</strong><br>Matter-strategy library of evidence and drafting plans, bucketed by review state.</td>
  </tr>
</table>

## Demo Mode

Start the AirApp locally and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-legal-matter-strategy/app dev
```

Then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=review&lang=en#/review
/?demo=items&lang=en#/items
/?demo=checks&lang=en#/checks
/?demo=entities&lang=en#/entities
/?demo=detail&lang=en
```

Demo mode never reads or writes Busabase.

## Payload Format

`scripts/create_strategy_batch.mjs` accepts a single item object or `{ "entities": [...], "items": [...], "checks": [...] }`:

```json
{
  "items": [
    {
      "id": "strategy-saas-arrears",
      "title": "SaaS service-fee arrears pre-suit strategy",
      "category": "合同纠纷",
      "status": "needs_review",
      "owner": "Reviewer name",
      "risk": ["legal", "deadline"],
      "summary": "One-paragraph review summary.",
      "recommendation": "Fix delivery/cure-notice evidence before sending a demand letter.",
      "evidence": ["pack-lease-break: 催告程序重要性"],
      "fields": {
        "matter_stage": "诉前",
        "evidence_gap_count": 2,
        "evidence_gaps_list": ["服务验收节点缺少客户确认"],
        "issue_tree": [{ "label": "服务是否完成交付", "children": ["交付节点是否有客户确认"] }],
        "negotiation_options": ["先发律师函固定解除权"],
        "posture": "证据补强后再启动正式函件。",
        "pleading_outline": "请求解除合同、支付服务费、承担违约金。",
        "deadline": "2026-07-20"
      }
    }
  ],
  "entities": [{ "id": "matter-saas-arrears", "title": "SaaS 服务费欠款与解除争议", "summary": "..." }],
  "checks": [{ "id": "chk-evidence", "label": "Evidence map", "status": "warn", "item_id": "strategy-saas-arrears" }]
}
```

After importing, run `node scripts/execute_decisions.mjs --apply` once a reviewer has decided, and `node scripts/export_strategy_pack.mjs --out <dir>` to export genuinely approved strategy packs as Markdown + JSON + CSV. See `references/strategy-schema.md` for the full Busabase field contract.

## Busabase Setup

Legal Matter Strategy provisions its own Folder and four Bases (`items`, `entities`, `checks`, `settings`) lazily on first run in a Busabase Space — no manual setup required. See `SKILL.md`'s Busabase Resources section.

## Boundary

The AirApp reads and writes Busabase only — it never files documents, sends client advice, contacts counterparties, publishes brand claims, or performs other external side effects. Every legal position, client-facing output, external citation, filing step, or outbound message is approval-required and happens outside the app only after explicit human approval. Ingesting strategy batches and exporting approved packs are local-file operations performed by the trusted `scripts/*.mjs` scripts, never by the browser. Never commit local payload files, env files, or generated exports (`exports/` is gitignored).
