# Legal Casebase Ingest

Legal Casebase Ingest is a Busabase App-in-Skill casebase intake and anonymization QA desk for law-firm judgment and award documents. The agent extracts facts, holdings, legal basis, tags, and anonymization evidence from source documents; the human reviewer approves, revises, requests changes, or blocks every record through the App-in-Skill review queue before it becomes a searchable knowledge asset.

## What It Shows

- Overview: casebase command desk with intake progress, anonymization risk, review load, and recent activity.
- Workbench (`#/items`): case-record facts, court reasoning, legal basis, tags, and source snippets.
- Review queue: approval-gated case records with stable refs (`Intake #1`), anonymization evidence, review notes, and decision controls (approve / request changes / revise / block).
- Checks: deterministic QA checks for PII leakage, taxonomy completeness, source coverage, and tag confidence.
- Library (`#/entities`): canonical case library grouped by cause, court, lawyer, and status.
- Settings: sanitized firm profile, ingestion/anonymization/taxonomy policy, export preferences, and data-provider status.

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
  <tr>
    <td width="50%"><img src="assets/screenshots/entities.webp" alt="Legal Casebase Ingest library"></td>
  </tr>
  <tr>
    <td><strong>Library</strong><br>Ingested case library with needs-review and approved buckets and per-item counts.</td>
  </tr>
</table>

## Demo Mode

Start the AirApp locally and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-legal-casebase-ingest/app dev
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

`scripts/ingest_documents.mjs` accepts a single item object or `{ "entities": [...], "items": [...], "checks": [...] }`:

```json
{
  "items": [
    {
      "id": "ingest-lease-arrears",
      "title": "Commercial lease arrears termination case",
      "category": "Civil/Commercial",
      "status": "needs_review",
      "owner": "Reviewer name",
      "risk": ["privacy", "business_secret"],
      "summary": "One-paragraph review summary.",
      "recommendation": "Approve for ingest but redact business metrics.",
      "evidence": ["Party names replaced", "Phone numbers removed"],
      "fields": {
        "cause": "Lease contract dispute",
        "court": "Intermediate People's Court",
        "procedure": "Second instance",
        "outcome": "Partially supports landlord",
        "paragraphs": ["Facts 3", "Reasoning 2"],
        "extraction_confidence": 0.91,
        "duplicate_score": 0.22,
        "pii_cleared": true,
        "parties_redacted": true,
        "contacts_redacted": true
      }
    }
  ],
  "entities": [{ "id": "case-lease-arrears", "title": "Commercial lease arrears cases", "summary": "..." }],
  "checks": [{ "id": "chk-pii", "label": "PII redaction", "status": "warn", "item_id": "ingest-lease-arrears" }]
}
```

After ingesting, run `node scripts/execute_decisions.mjs --apply` once a reviewer has decided, and `node scripts/export_case_records.mjs --out <dir>` to export genuinely approved records as Markdown + JSON + CSV. See `references/casebase-schema.md` for the full Busabase field contract.

## Busabase Setup

Legal Casebase Ingest provisions its own Folder and four Bases (`items`, `entities`, `checks`, `settings`) lazily on first run in a Busabase Space — no manual setup required. See `SKILL.md`'s Busabase Resources section.

## Boundary

The AirApp reads and writes Busabase only — it never files documents, sends client advice, contacts counterparties, or performs other external side effects. Every legal position, client-facing output, external citation, or outbound message is approval-required and happens outside the app only after explicit human approval. Ingesting a document and exporting approved records are local-file operations performed by the trusted `scripts/*.mjs` scripts, never by the browser. Never commit local payload files, env files, or generated exports (`exports/` is gitignored).
