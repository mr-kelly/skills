# Legal Precedent Desk

Legal Precedent Desk is a Busabase App-in-Skill precedent-research desk for internal casebase search, local court-pattern analysis, similar-case packs, citations, and approval-gated research exports. The agent prepares research packs — matched similar cases, similarity scores, local court-pattern notes, and citations; the responsible lawyer approves, revises, requests changes, or blocks every pack through the App-in-Skill review queue before it becomes an approved research input.

## What It Shows

- Overview: precedent command desk with packs awaiting review, high-match cases, approved packs, and recent activity.
- Workbench (`#/items`): editable research pack, similar-case matches, and local court-pattern notes.
- Review queue: approval-gated research packs with stable refs (`Pack #1`), citations, review notes, and decision controls (approve / request changes / revise / block).
- Checks: precedent QA checks for citation traceability, similarity rationale, jurisdiction fit, and confidentiality limits.
- Library (`#/entities`): issue clusters, court-pattern groups, or precedent collections grouped by issue, court, outcome, and lawyer.
- Settings: sanitized firm profile, search policy, export preferences, and data-provider status.

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
  <tr>
    <td width="50%"><img src="assets/screenshots/entities.webp" alt="Legal Precedent Desk library"></td>
  </tr>
  <tr>
    <td><strong>Library</strong><br>Internal precedent and trial-court pattern library, bucketed by review state.</td>
  </tr>
</table>

## Demo Mode

Start the AirApp locally and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-legal-precedent-desk/content/kelly-legal-precedent-desk-app dev
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

`scripts/create_research_batch.mjs` accepts a single item object or `{ "entities": [...], "items": [...], "checks": [...] }`:

```json
{
  "items": [
    {
      "id": "pack-lease-break",
      "title": "Commercial lease arrears termination precedent pack",
      "category": "租赁合同纠纷",
      "status": "needs_review",
      "owner": "Reviewer name",
      "risk": ["legal", "confidentiality"],
      "summary": "One-paragraph review summary.",
      "recommendation": "Search 2025+ Shenzhen basic-court cases before use in a client memo.",
      "evidence": ["case-lease-arrears-shenzhen similarity 0.86"],
      "fields": {
        "query": "疫情影响下商业租赁欠租能否解除",
        "jurisdiction": "深圳",
        "match_count": 4,
        "high_match_count": 3,
        "top_similarity": 0.86,
        "avg_similarity": 0.81,
        "court_pattern": "深圳法院更重视催告、欠租持续性、减免协商记录与损失证明。",
        "citation_count": 9
      }
    }
  ],
  "entities": [{ "id": "prec-lease-break", "title": "疫情期间商业租赁解除与违约金调减", "summary": "..." }],
  "checks": [{ "id": "chk-citations", "label": "Citation coverage", "status": "pass", "item_id": "pack-lease-break" }]
}
```

After importing, run `node scripts/execute_decisions.mjs --apply` once a reviewer has decided, and `node scripts/export_research_pack.mjs --out <dir>` to export genuinely approved research packs as Markdown + JSON + CSV. See `references/precedent-schema.md` for the full Busabase field contract.

## Busabase Setup

Legal Precedent Desk provisions its own Folder and four Bases (`items`, `entities`, `checks`, `settings`) lazily on first run in a Busabase Space — no manual setup required. See `SKILL.md`'s Busabase Resources section.

## Boundary

The AirApp reads and writes Busabase only — it never files documents, sends client advice, contacts counterparties, publishes brand claims, or performs other external side effects. Every legal position, client-facing output, external citation, filing step, or outbound message is approval-required and happens outside the app only after explicit human approval. Ingesting research batches and exporting approved packs are local-file operations performed by the trusted `scripts/*.mjs` scripts, never by the browser. Never commit local payload files, env files, or generated exports (`exports/` is gitignored).
