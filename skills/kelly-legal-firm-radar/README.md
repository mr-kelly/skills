# Legal Firm Radar

Legal Firm Radar is a Busabase App-in-Skill firm-analytics desk over anonymized internal casebase metadata. The agent prepares management insights — practice mix, local court outcomes, lawyer capability profiles, quality indicators, and brand proof points; the human partner approves, revises, requests changes, or blocks every insight through the App-in-Skill review queue before it becomes an approved management report or brand handoff.

## What It Shows

- Overview: firm radar command desk with practice mix, outcome trends, talent signals, and review queue.
- Workbench (`#/items`): management-insight methodology, evidence, suggested action, and visibility limits.
- Review queue: approval-gated management insights with stable refs (`Insight #1`), evidence, review notes, and decision controls (approve / request changes / revise / block).
- Checks: analytics QA checks for anonymization, sample size, attribution, and unsupported claims.
- Library (`#/entities`): lawyer and practice-area profile cards from anonymized metadata.
- Settings: sanitized firm profile, analytics policy, practice taxonomy, export preferences, and data-provider status.

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
  <tr>
    <td width="50%"><img src="assets/screenshots/entities.webp" alt="Legal Firm Radar library"></td>
  </tr>
  <tr>
    <td><strong>Library</strong><br>Practice-area and lawyer capability profile cards, grouped by review state.</td>
  </tr>
</table>

## Demo Mode

Start the AirApp locally and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-legal-firm-radar/content/kelly-legal-firm-radar-app dev
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

`scripts/import_metrics.mjs` accepts a single item object or `{ "entities": [...], "items": [...], "checks": [...] }`:

```json
{
  "items": [
    {
      "id": "insight-real-estate-growth",
      "title": "Commercial lease dispute growth and staffing recommendation",
      "category": "业务布局",
      "status": "needs_review",
      "owner": "Reviewer name",
      "risk": ["management", "privacy"],
      "summary": "One-paragraph review summary.",
      "recommendation": "Approve for an internal briefing but drop win-rate language before any external use.",
      "evidence": ["18 anonymized cases", "11 first-instance Shenzhen court samples"],
      "fields": {
        "sample_size": 18,
        "period": "last_12_months",
        "visibility": "internal_management",
        "lawyer_count": 4,
        "public_citable": 1,
        "quality_indicators": ["Shenzhen first-instance sample concentration", "Reusable lease evidence checklist"]
      }
    }
  ],
  "entities": [{ "id": "profile-real-estate", "title": "Real estate and lease disputes", "summary": "..." }],
  "checks": [{ "id": "chk-sample", "label": "Sample size", "status": "warn", "item_id": "insight-real-estate-growth" }]
}
```

After importing, run `node scripts/execute_decisions.mjs --apply` once a reviewer has decided, and `node scripts/export_management_report.mjs --out <dir>` to export genuinely approved insights as Markdown + JSON + CSV. See `references/firm-radar-schema.md` for the full Busabase field contract.

## Busabase Setup

Legal Firm Radar provisions its own Folder and four Bases (`items`, `entities`, `checks`, `settings`) lazily on first run in a Busabase Space — no manual setup required. See `SKILL.md`'s Busabase Resources section.

## Boundary

The AirApp reads and writes Busabase only — it never files documents, sends client advice, contacts counterparties, publishes brand claims, or performs other external side effects. Every management report, external citation, or outbound message is approval-required and happens outside the app only after explicit human approval. Importing metrics and exporting approved reports are local-file operations performed by the trusted `scripts/*.mjs` scripts, never by the browser. Never commit local payload files, env files, or generated exports (`exports/` is gitignored).
