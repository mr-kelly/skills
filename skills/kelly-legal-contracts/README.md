# Kelly Legal Contracts

Kelly Legal Contracts is a local App-in-Skill contract review desk for NDAs, MSAs, DPAs, and SOWs. The agent prepares clause issues, fallback language, playbook checks, and issue-list exports; the human legal reviewer approves, edits, requests changes, or blocks everything in a local browser UI.

## What It Shows

- Overview: contract × workstream status, risk pass rate, review queue preview, and recent legal activity.
- Contracts: counterparty, matter type, governing law, deal owner, key obligations, watch terms, and document checklist.
- Clause Issues: editable fallback language, negotiation notes, memo summary, jurisdiction tabs, and per-rule risk checks.
- Risk Checks: rule × issue results with pass/warn/fail badges and evidence.
- Playbook: approved fallback clauses plus hard-stop/restricted terms.
- Review: approve / request changes / block queue with stable refs (`Issue #1`) and legal audit notes.
- Settings: sanitized legal profile, enabled workstreams, jurisdictions, rule counts, export preferences, and data provider.

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-legal-contracts/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=products&lang=en#/products
/?demo=drafts&lang=en#/drafts
/?demo=checks&lang=en#/checks
/?demo=claims&lang=en#/claims
/?demo=review&lang=en#/review
/?demo=detail&lang=en#/drafts/d-msa-liability-us
```

The featured detail scene opens `/?demo=detail&lang=zh#/drafts/d-msa-liability-us`: a Zenith SaaS MSA issue where customer paper requests uncapped liability and broad indemnity. The clause playbook flags it as escalation-required. Demo mode never reads or writes local contract files.

## Payload Format

`scripts/ingest_contracts.ts` accepts `{ "products": [...], "drafts": [...] }`. The schema keeps generic App-in-Skill keys for compatibility:

- `products[]` = contracts
- `drafts[]` = clause issues
- `platform` = workstream (`nda`, `msa`, `dpa`, `sow`)
- `locale` = jurisdiction

Example:

```json
{
  "products": [
    {
      "product_id": "ct-acme-nda",
      "name": "Acme Mutual NDA",
      "sku": "Acme Robotics",
      "category": "Vendor evaluation",
      "source": "manual",
      "platforms": ["nda"],
      "locales": ["US"],
      "specs": [{ "name": "Governing law", "value": "California" }],
      "features": ["Mutual confidentiality", "Residuals clause added"],
      "keywords": ["residuals", "purpose limitation"],
      "images": [{ "name": "Counterparty redline", "status": "ready" }]
    }
  ],
  "drafts": [
    {
      "product_id": "ct-acme-nda",
      "platform": "nda",
      "locale": "US",
      "keyword_strategy": "Residuals clause exceeds playbook.",
      "fields": {
        "title": "Residuals clause allows retained ideas after NDA ends",
        "bullets": ["Risk note", "Business impact", "Fallback", "Compromise", "Escalation"],
        "description": "Delete the residuals clause or narrow to unaided memory only.",
        "search_terms": "Ask counterparty to remove residuals.",
        "aplus_outline": ["Memo", "Redline", "Fallback"]
      }
    }
  ]
}
```

After ingesting, run:

```bash
node scripts/run_checks.ts
node scripts/export_issues.ts --out exports
```

`scripts/execute_decisions.ts` is dry-run by default and records execution reports only with `--apply`.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-legal-contracts/config.json`, then configure legal profile, workstreams, jurisdictions, hard-stop terms, clause playbook references, escalation policy, and export preferences. Secrets, if any external connector is later used, belong in env files only.

## Boundary

The app renders local files only. It never sends redlines, contacts counterparties, signs contracts, accepts terms, or provides final legal advice. Legal positions, exports, redlines, and external sends require explicit human approval and are executed outside the app.
