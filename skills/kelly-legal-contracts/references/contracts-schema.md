# Kelly Legal Contracts Snapshot Schema

Use this schema for `app/.data/contract_snapshot.json`. The first implementation reuses the proven generic App-in-Skill list/detail model:

- `products[]` are **contracts**.
- `drafts[]` are **clause issues**.
- `platform` is the **workstream** (`nda`, `msa`, `dpa`, `sow`).
- `locale` is the **jurisdiction**.
- `claims.json` is the **clause playbook**.

Keep this shape stable so the app, scripts, and agent workflow can evolve independently. Validate with `scripts/validate_ui_schema.ts`.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-legal-contracts",
  "seller": { "brand": "Legal ops profile", "entity": "Legal entity" },
  "metrics": {
    "product_count": 0,
    "draft_count": 0,
    "drafts_by_platform": { "nda": 0 },
    "drafts_needs_review": 0,
    "drafts_approved": 0,
    "drafts_in_revision": 0,
    "checks_failed": 0,
    "compliance_pass_rate": 0,
    "exported_this_week": 0
  },
  "products": [],
  "drafts": [],
  "rules": [],
  "checks": [],
  "review_items": [],
  "activity_log": [],
  "warnings": []
}
```

## Contract (`products[]`)

```json
{
  "product_id": "ct-acme-nda",
  "ref": 1,
  "name": "Acme Mutual NDA",
  "sku": "Acme Robotics",
  "category": "Vendor evaluation",
  "source": "manual|kelly_picks",
  "platforms": ["nda", "msa", "dpa", "sow"],
  "locales": ["US", "UK", "EU"],
  "specs": [{ "name": "Governing law", "value": "California" }],
  "features": ["Mutual confidentiality"],
  "keywords": ["residuals", "purpose limitation"],
  "images": [{ "name": "Counterparty redline", "status": "ready|missing|needs_edit" }],
  "notes": "free-form legal intake note",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

`sku` is displayed as the counterparty. `features` are key obligations; `keywords` are watch terms; `images` are required documents.

## Clause Issue (`drafts[]`)

```json
{
  "draft_id": "d-msa-liability-us",
  "ref": 1,
  "product_id": "ct-zenith-msa",
  "platform": "nda|msa|dpa|sow",
  "locale": "US|UK|EU",
  "variant_group": "msa-liability",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "compliance_score": 0,
  "keyword_strategy": "reviewer rationale",
  "fields": { "workstream-specific issue shape" },
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

`ref` gives the stable chat/UI reference (`Issue #1`).

### Workstream Field Shapes

- `nda`: `{ "title", "bullets": ["risk notes"], "description", "search_terms", "aplus_outline": [] }`
- `msa`: `{ "title", "description", "seo_title", "seo_description" }`
- `dpa`: `{ "title", "selling_points": [] }`
- `sow`: `{ "title", "subtitle", "description", "item_specifics": [{ "name", "value" }] }`

Legacy workstream aliases `amazon`, `shopify`, `tiktok_shop`, and `ebay` are accepted by the first implementation for compatibility and displayed as NDA/MSA/DPA/SOW respectively.

## Clause Playbook (`claims.json`)

```json
{
  "updated_at": "ISO timestamp",
  "claims": [
    {
      "claim_id": "clause-liability-cap",
      "text": "Liability cap at fees paid in the preceding 12 months",
      "status": "approved|pending|rejected",
      "category": "Liability",
      "substantiation": "When this fallback is approved",
      "evidence": ["playbooks/msa-risk-matrix.xlsx"],
      "approved_by": "GC",
      "approved_at": "ISO timestamp"
    }
  ],
  "rules": [
    {
      "rule_id": "claimrule-uncapped-liability",
      "phrase": "uncapped liability",
      "type": "banned_word|restricted_phrase",
      "severity": "error|warning",
      "reason": "Requires escalation",
      "alternative": "cap liability at fees paid in the preceding 12 months"
    }
  ]
}
```

Approved claims are reusable fallback positions. Pending/rejected claims and hard-stop rules are flagged by `claims_registry` checks.

## Check

```json
{
  "check_id": "chk-msa-liability-us-claims_registry",
  "draft_id": "d-msa-liability-us",
  "rule_id": "claims_registry",
  "severity": "error|warning",
  "result": "pass|warn|fail",
  "evidence": "Clause playbook issue(s): hard-stop term \"uncapped liability\".",
  "checked_at": "ISO timestamp"
}
```

Built-in rule ids: `required_fields`, `title_length`, `banned_words`, `competitor_brands`, `bullet_count`, `search_terms_bytes`, `selling_points_count`, `seo_meta_length`, `all_caps_words`, `keyword_stuffing`, `image_checklist`, `claims_registry`.

## Review Item

```json
{
  "review_id": "rv-msa-liability-us",
  "ref": 1,
  "draft_id": "d-msa-liability-us",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "compliance_summary": "one-line risk summary",
  "suggestions": ["agent revision suggestion"],
  "created_at": "ISO timestamp"
}
```

Decisions live in `app/.data/decisions.json`:

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "rv-msa-liability-us": {
      "action": "approve|request_changes|block|revise",
      "comment": "review note",
      "fields": { "optional edited issue fields" },
      "decided_at": "ISO timestamp"
    }
  }
}
```

`request_changes` queues `revise_contract_issue` in `agent_tasks.json`; `revise` carries human-edited fields for re-ingest.

## Other Handoff Files

- `app/.data/agent_tasks.json`
- `app/.data/execution_report.json`
- `app/.data/onboarding.json`
- `app/.data/agent.lock`
