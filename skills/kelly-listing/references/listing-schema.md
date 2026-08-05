# Kelly Listing Schema

Use this schema when reading or writing Kelly Listing's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/listing-model.js`). Compliance checks, per-draft compliance
scores, review-item content, the recent-activity feed, and metrics are all
computed client-side from the `products`/`drafts`/`checks`/`claims`/
`claim_rules`/`settings` Bases on every read (`buildSnapshot`/
`assembleSnapshot` in `listing-model.js`) — the only persisted state is what
lives directly on those six Bases.

Workflow statuses: `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `block`, `revise`.

Product sources: `manual`, `kelly_picks`.

Platforms: `amazon`, `shopify`, `tiktok_shop`, `ebay`.

Check results: `pass`, `warn`, `fail`.

## Products (`kelly-listing-products-v1`)

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `product-id` | `product_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number so the seller can say "Product #2" |
| `name` | `name` | text | product display name |
| `sku` | `sku` | text | SKU |
| `category` | `category` | text | product category |
| `source` | `source` | text | `manual\|kelly_picks` |
| `platforms` | `platforms` | longtext | JSON array of platforms, e.g. `["amazon"]` |
| `locales` | `locales` | longtext | JSON array of locales, e.g. `["US","DE"]` |
| `specs` | `specs` | longtext | JSON array of `{name, value}` specifications |
| `features` | `features` | longtext | JSON array of feature-list facts |
| `keywords` | `keywords` | longtext | JSON array of target keywords (used by the `keyword_stuffing` check) |
| `images` | `images` | longtext | JSON array of `{name, status}` image checklist entries (`ready\|missing\|needs_edit`) |
| `notes` | `notes` | longtext | freeform note, e.g. kelly-picks handoff reference |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Drafts (`kelly-listing-drafts-v1`)

A draft record is both the platform listing draft and its review-queue item
— there is no separate review-item or decisions Base.
`scripts/ingest_drafts.mjs` writes the draft/field columns;
`scripts/run_checks.mjs` writes `compliance-score`; the AirApp (or a human
in a standalone local preview) writes the `decision-*` fields;
`scripts/execute_decisions.mjs` writes the `execution-*` fields. The
per-platform field shape (see `PLATFORM_FIELD_SHAPES` in
`listing-model.js`) determines which of `title`/`subtitle`/`bullets`/
`description`/`search-terms`/`seo-title`/`seo-description`/
`selling-points`/`aplus-outline`/`item-specifics` are populated for a given
draft:

- `amazon`: `title`, `bullets` (exactly 5), `description`, `search-terms` (≤ 249 bytes), `aplus-outline`.
- `shopify`: `title`, `description`, `seo-title`, `seo-description`.
- `tiktok_shop`: `title`, `selling-points`.
- `ebay`: `title`, `subtitle`, `description`, `item-specifics`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `draft-id` | `draft_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number so the seller can say "Draft #2" |
| `product-id` | `product_id` | text | references `products.product-id` |
| `platform` | `platform` | text | `amazon\|shopify\|tiktok_shop\|ebay` |
| `locale` | `locale` | text | `US\|DE\|JP` |
| `variant-group` | `variant_group` | text | groups locale variants of the same product+platform draft for the locale-tabs UI |
| `status` | `status` | text | workflow status |
| `compliance-score` | `compliance_score` | number | `round(points/total*100)`, POINTS = pass 1 / warn 0.5 / fail 0 |
| `keyword-strategy` | `keyword_strategy` | longtext | agent's keyword-strategy note |
| `title` | `title` | text | listing title |
| `subtitle` | `subtitle` | text | subtitle (ebay) |
| `bullets` | `bullets` | longtext | JSON array of bullet points (amazon) |
| `description` | `description` | longtext | product description (amazon/shopify/ebay) |
| `search-terms` | `search_terms` | longtext | backend search terms (amazon) |
| `seo-title` | `seo_title` | text | SEO title (shopify) |
| `seo-description` | `seo_description` | longtext | SEO description (shopify) |
| `selling-points` | `selling_points` | longtext | JSON array, selling points (tiktok_shop) |
| `aplus-outline` | `aplus_outline` | longtext | JSON array, A+ content outline (amazon) |
| `item-specifics` | `item_specifics` | longtext | JSON array of `{name, value}` structured facts (ebay) |
| `compliance-summary` | `compliance_summary` | longtext | one-line compliance summary for the review queue |
| `suggestions` | `suggestions` | longtext | JSON array of agent suggestions |
| `decision-action` | `decision_action` | text | `approve\|request_changes\|block\|revise` |
| `decision-note` | `decision_note` | longtext | reviewer's review note / audit trail |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `execute_decisions.mjs` |
| `execution-operation` | `execution_operation` | text | `export_listing\|request_revision` |
| `execution-target` | `execution_target` | text | export path (`export_listing`) or `draft-id` (`request_revision`) |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Checks (`kelly-listing-checks-v1`)

One row per draft × compliance rule, keyed by `check-id = chk-<draft without
"d-" prefix>-<rule-id>`. `scripts/run_checks.mjs` upserts every row.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `check-id` | `check_id` | text | `chk-<draft>-<rule>`, required |
| `draft-id` | `draft_id` | text | references `drafts.draft-id` |
| `rule-id` | `rule_id` | text | see Compliance Rules below |
| `severity` | `severity` | text | `error\|warning` |
| `result` | `result` | text | `pass\|warn\|fail` |
| `evidence` | `evidence` | longtext | short evidence snippet |
| `ref-rules` | `ref_rules` | longtext | JSON array of `claim_rules.rule-id` tripped by `claims_registry` |
| `ref-claims` | `ref_claims` | longtext | JSON array of `claims.claim-id` referenced by `claims_registry` |
| `checked-at` | `checked_at` | text | ISO timestamp |

## Claims (`kelly-listing-claims-v1`)

Approved marketing claims or rejected claims, referenced by the
`claims_registry` check.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `claim-id` | `claim_id` | text | stable domain id, required |
| `text` | `text` | longtext | claim text, matched against the draft's field corpus |
| `status` | `status` | text | `approved\|pending\|rejected` |
| `category` | `category` | text | e.g. performance, safety, health |
| `substantiation` | `substantiation` | longtext | evidence/testing backing an approved claim |
| `evidence` | `evidence` | longtext | JSON array of source references |
| `approved-by` | `approved_by` | text | |
| `approved-at` | `approved_at` | text | ISO timestamp |
| `notes` | `notes` | longtext | e.g. why a claim was rejected |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Claim Rules (`kelly-listing-claim-rules-v1`)

Banned-word / restricted-phrase rules, referenced by the `claims_registry`
check.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `rule-id` | `rule_id` | text | stable domain id, required |
| `phrase` | `phrase` | text | term matched against the draft's field corpus |
| `type` | `type` | text | `banned_word\|restricted_phrase` |
| `severity` | `severity` | text | `error\|warning` |
| `reason` | `reason` | longtext | why the term matters |
| `alternative` | `alternative` | longtext | suggested replacement copy |
| `created-at` | `created_at` | text | ISO timestamp |

## Settings (`kelly-listing-settings-v1`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `seller-brand` | `seller_brand` | text | brand name |
| `seller-entity` | `seller_entity` | text | legal entity name |
| `seller-tone` | `seller_tone` | text | copy tone, e.g. "benefit-led, no hype words" |
| `locales` | `locales` | longtext | JSON array of locales in scope |
| `platforms` | `platforms` | longtext | JSON array of `{platform, enabled, locales, rules}` per-platform rule sets |
| `banned-words` | `banned_words` | longtext | JSON array of banned words |
| `competitor-brands` | `competitor_brands` | longtext | JSON array of competitor brand names |
| `keyword-stuffing-max-repeats` | `keyword_stuffing_max_repeats` | number | default 3 |
| `allowed-all-caps` | `allowed_all_caps` | longtext | JSON array of allowed all-caps terms (e.g. `POV`) |
| `export-format` | `export_format` | text | `markdown+csv` |
| `export-out-dir` | `export_out_dir` | text | default `exports` |
| `publish-handoff-to-agent` | `publish_handoff_to_agent` | text | `"true"\|"false"` |
| `publish-requires-approval` | `publish_requires_approval` | text | `"true"\|"false"` |

## Compliance Rules

Evaluated by `evaluateDraft()` in `listing-model.js` (same logic in the
AirApp's demo provider and `scripts/run_checks.mjs`), ported verbatim from
the retired `app/server/rules.ts`:

- `required_fields` — every field in the platform's `default_required` list (or `platforms[].rules.required_fields` override) must be present.
- `title_length` — the title must not exceed the platform's character cap (`platforms[].rules.title_max_chars`, default 200 Amazon / 70 Shopify / 255 TikTok Shop / 80 eBay).
- `banned_words` — none of `banned-words` (plus `platforms[].rules.extra_banned_words`) may appear in the field corpus (word-boundary match for ASCII terms).
- `competitor_brands` — none of `competitor-brands` may appear in the field corpus.
- `bullet_count` (amazon only) — exactly `platforms[].rules.bullets_exact` (default 5) bullet points.
- `search_terms_bytes` (amazon only) — backend search terms must not exceed `platforms[].rules.search_terms_max_bytes` (default 249) UTF-8 bytes.
- `selling_points_count` (tiktok_shop only) — at least `platforms[].rules.min_selling_points` (default 3) selling points.
- `seo_meta_length` (shopify only) — SEO title/description within `seo_title_max_chars`/`seo_description_max_chars` (defaults 60/160); a 5/10-char overage warns, further over fails.
- `all_caps_words` — flags ASCII all-caps words of 3+ letters not in `allowed-all-caps` (or the built-in default list).
- `keyword_stuffing` — flags a product target keyword (`products.keywords`) repeated beyond `keyword-stuffing-max-repeats` in the visible field corpus.
- `image_checklist` — every entry in the product's `images` (image checklist) must be `ready`.
- `claims_registry` — flags a `claim_rules` banned-word/restricted phrase, or a non-approved (`pending`/`rejected`) `claims` claim, referenced in the field corpus; empty registry passes trivially.

## Decisions

A human verdict writes `status` (via `statusForVerdict()`), `decision-action`,
`decision-note`, and `decided-at` directly onto the draft record —
`revise` additionally carries edited field values from the draft workbench
but never changes `status`. There is no separate decisions file: the draft
record is the single source of truth for both the copy and its review
state.

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads drafts with `decision-action: "approve"` or
`"request_changes"`, and with `--apply` writes `execution-status`/
`execution-operation`/`execution-target`/`execution-detail`/`executed-at`
back onto each — it never changes `status` itself. Operations:

- `export_listing` (from `approve`) → the agent runs `scripts/export_listings.mjs` to write the Markdown document and CSV row, then hands off publishing via the platform APIs/skills the user has configured per SKILL.md's Boundary.
- `request_revision` (from `request_changes`) → the agent redrafts the listing per `decision-note`, re-ingests with `scripts/ingest_drafts.mjs`, and re-runs `scripts/run_checks.mjs`.

## Export (`scripts/export_listings.mjs`)

Reads drafts with a genuine `decision-action: "approve"` from Busabase (not
merely `status: "approved"`, which an ingest payload could set directly
without a real human decision) and writes one Markdown document per listing
plus `listings.csv` (sku, product, platform, locale, title, bullets joined,
description, search terms, seo title/description, draft_id) to `--out`
(default `exports/` at the skill root, gitignored). Marks each exported
draft `status: "done"` in Busabase; this is the only write export performs.

## Ingest Payload (`scripts/ingest_drafts.mjs`)

Accepts a single draft object or:

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
      "draft_id": "optional; derived from product+platform+locale when absent",
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

A new product (matched by `product_id`, or by name/SKU label) is created on
the fly in the `products` Base, mirroring the retired local importer's
on-the-fly product creation.
