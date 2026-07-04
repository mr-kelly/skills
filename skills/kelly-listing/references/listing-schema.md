# Kelly Listing Snapshot Schema

Use this schema for `app/.data/listing_snapshot.json`. Keep the shape stable so the local app, scripts, and the agent's drafting workflow can evolve independently. Validate with `scripts/validate_ui_schema.mjs` before relying on a snapshot.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-listing",
  "seller": { "brand": "Brand", "entity": "Legal entity" },
  "metrics": {
    "product_count": 0,
    "draft_count": 0,
    "drafts_by_platform": { "amazon": 0 },
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

`drafts_approved` counts `approved` plus `done`; `compliance_pass_rate` is the percentage of checks that pass; `exported_this_week` counts drafts marked `done` in the last 7 days.

## Product

```json
{
  "product_id": "prod-lunchbox",
  "ref": 1,
  "name": "Collapsible Silicone Lunch Box",
  "sku": "NH-LB-01",
  "category": "Kitchen & Dining",
  "source": "manual|kelly_picks",
  "platforms": ["amazon", "tiktok_shop", "shopify", "ebay"],
  "locales": ["US", "DE"],
  "specs": [{ "name": "Material", "value": "Food-grade silicone" }],
  "features": ["benefit-worthy fact"],
  "keywords": ["target keyword"],
  "images": [{ "name": "Main image on white", "status": "ready|missing|needs_edit" }],
  "notes": "free-form, e.g. kelly-picks handoff reference",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

`ref` is a stable per-snapshot number. `source: "kelly_picks"` marks products created from a kelly-picks handoff brief.

## Draft

```json
{
  "draft_id": "d-lunchbox-amazon-us",
  "ref": 1,
  "product_id": "prod-lunchbox",
  "platform": "amazon|shopify|tiktok_shop|ebay",
  "locale": "US|DE|JP",
  "variant_group": "lunchbox-amazon",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "compliance_score": 0,
  "keyword_strategy": "agent's keyword-strategy note",
  "fields": { "…platform shape below…" },
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

`ref` gives the stable chat reference (`Draft #1`). Drafts sharing a `variant_group` are locale variants of the same product+platform listing and render as locale tabs. Listing copy in `fields` stays in the target-market language regardless of UI language.

### Platform field shapes

- `amazon`: `{ "title", "bullets": ["…5 items…"], "description", "search_terms", "aplus_outline": [] }`
- `shopify`: `{ "title", "description", "seo_title", "seo_description" }`
- `tiktok_shop`: `{ "title", "selling_points": [] }`
- `ebay`: `{ "title", "subtitle", "description", "item_specifics": [{ "name", "value" }] }`

## Rule

```json
{
  "rule_id": "title_length",
  "name": "Title within platform cap",
  "severity": "error|warning",
  "platforms": ["amazon", "shopify", "tiktok_shop", "ebay"]
}
```

Rule parameters (caps, banned words, required fields) live in private config under `platforms[].rules` and the top-level `banned_words` / `competitor_brands` / `keyword_stuffing` / `allowed_all_caps` keys; `scripts/run_checks.mjs` copies the sanitized catalog into the snapshot for display. Built-in rule ids: `required_fields`, `title_length`, `banned_words`, `competitor_brands`, `bullet_count`, `search_terms_bytes`, `selling_points_count`, `seo_meta_length`, `all_caps_words`, `keyword_stuffing`, `image_checklist`.

## Check

```json
{
  "check_id": "chk-lunchbox-amazon-us-title_length",
  "draft_id": "d-lunchbox-amazon-us",
  "rule_id": "title_length",
  "severity": "error|warning",
  "result": "pass|warn|fail",
  "evidence": "Title is 198/200 characters.",
  "checked_at": "ISO timestamp"
}
```

Character caps count code points; byte caps (backend search terms ≤ 249) use `Buffer.byteLength`; banned-word matching uses word boundaries for ASCII terms and substring matching for CJK.

## Review Item

```json
{
  "review_id": "rv-lunchbox-amazon-us",
  "ref": 1,
  "draft_id": "d-lunchbox-amazon-us",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "compliance_summary": "one-line check summary",
  "suggestions": ["agent revision suggestion"],
  "created_at": "ISO timestamp"
}
```

`ref` matches the draft's `ref`. `done` means exported (recorded in the execution report). Decisions are stored separately in `app/.data/decisions.json` keyed by `review_id`:

```json
{
  "updated_at": "ISO timestamp",
  "decisions": {
    "rv-lunchbox-amazon-us": {
      "action": "approve|request_changes|block|revise",
      "comment": "review note",
      "fields": { "optional edited listing fields (revise)" },
      "decided_at": "ISO timestamp"
    }
  }
}
```

`request_changes` also queues a `revise_listing` entry in `app/.data/agent_tasks.json`. `revise` carries the human's edited fields for the agent to re-ingest.

## Activity Log Entry

```json
{
  "id": "stable id",
  "at": "ISO timestamp",
  "actor": "agent|seller",
  "detail": "what happened",
  "draft_id": "optional draft id"
}
```

## Warning

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "draft_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

## Ingest Payload

`scripts/ingest_drafts.mjs` accepts a single draft object or:

```json
{
  "products": [
    {
      "product_id": "optional; derived from name when absent",
      "name": "required",
      "sku": "required",
      "category": "optional",
      "source": "manual|kelly_picks",
      "platforms": ["amazon"],
      "locales": ["US"],
      "specs": [{ "name": "…", "value": "…" }],
      "features": ["…"],
      "keywords": ["…"],
      "images": [{ "name": "…", "status": "ready|missing|needs_edit" }],
      "notes": "optional"
    }
  ],
  "drafts": [
    {
      "draft_id": "optional; derived from product+platform+locale",
      "product_id": "or \"product\": name/SKU of an already-ingested product",
      "platform": "amazon|shopify|tiktok_shop|ebay",
      "locale": "US",
      "status": "optional; defaults to needs_review",
      "keyword_strategy": "optional agent note",
      "fields": { "…platform shape above…" },
      "compliance_summary": "optional review-item summary",
      "suggestions": ["optional review-item suggestions"]
    }
  ]
}
```

## Other Handoff Files

- `app/.data/decisions.json` — seller verdicts (shape above).
- `app/.data/agent_tasks.json` — `{ "updated_at": "…", "tasks": [{ "task_id", "type": "revise_listing", "review_id", "draft_id", "ref", "comment", "requested_at", "status" }] }`.
- `app/.data/execution_report.json` — written by `scripts/execute_decisions.mjs --apply` and `scripts/export_listings.mjs`; operations are `export_listing`, `publish_via_api` (`handoff_to_agent: true`), `request_revision`.
- `app/.data/onboarding.json` — `{ "completed": true, "completed_at": "…", "config_version": "…" }`.
- `app/.data/agent.lock` — `{ "owner", "message", "started_at" }`; write endpoints return HTTP 423 while it exists.
