# Kelly Insure Data UI Schema

This schema powers the AirApp UI for insurance data governance. It is the
`snapshot` object returned by `content/kelly-insure-data-app/app/js/providers/busabase-provider.js`
(read from the operator-provisioned Busabase workspace) and
`content/kelly-insure-data-app/app/js/providers/demo-provider.js` (deterministic offline fixture) —
there is no local snapshot file anymore.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "local|busabase",
  "drive": {
    "node_id": "Busabase Drive node id",
    "name": "港险资料库",
    "slug": "kelly-insure-data-files",
    "metadata": {},
    "metadata_fields": [{ "key": "owner", "value": "Kelly" }]
  },
  "bases": {
    "featured": {
      "base_id": "bse_...",
      "name": "资讯精选",
      "slug": "kelly-insure-data-featured",
      "fields": [{ "key": "title", "value": "Title (text)" }]
    },
    "notices": {
      "base_id": "bse_...",
      "name": "保司通知",
      "slug": "kelly-insure-data-notices",
      "fields": [{ "key": "title", "value": "Title (text)" }]
    },
    "qa": {
      "base_id": "bse_...",
      "name": "问答",
      "slug": "kelly-insure-data-qa",
      "fields": [{ "key": "question", "value": "Question (text)" }]
    },
    "feedback": {
      "base_id": "bse_...",
      "name": "用户反馈",
      "slug": "kelly-insure-data-feedback",
      "fields": [{ "key": "content", "value": "反馈内容 (longtext)" }]
    }
  },
  "metrics": {
    "file_count": 0,
    "metadata_field_count": 0,
    "qa_count": 0,
    "featured_count": 0,
    "notice_count": 0,
    "news_count": 0,
    "feedback_count": 0,
    "total_records": 0,
    "data_quality_score": 0,
    "needs_governance": 0
  },
  "files": [],
  "qa_pairs": [],
  "news_items": [],
  "featured_items": [],
  "notice_items": [],
  "feedback_items": [],
  "warnings": []
}
```

`news_items` is the ordered union of `featured_items` and `notice_items`. Every item carries `collection: "featured" | "notice"`. `news_count` is their total.

## File Item

Required:

- `id`
- `name`
- `path`
- `size`
- `mime_type`
- `updated_at`
- `metadata`
- `governance.completeness_pct`
- `governance.missing_fields`
- `governance.status`

The file item corresponds to a file under one Busabase Drive node. `metadata` should carry insurance governance fields such as `policy_type`, `carrier`, `region`, `effective_date`, `status`, `tags`, and source/ownership fields when available.

## QA Pair

Required:

- `id`
- `question`
- `answer`
- `carrier` (mapped from `source`)
- `updated_at`
- `status`
- `fields`
- `governance`

The QA pair corresponds to one record in the configured QA Base. Raw `source_path` is preserved in `fields`.

## News Item (Featured Information / Insurer Notices)

Required:

- `id`
- `collection` (`"featured"` or `"notice"`)
- `title`
- `summary` (mapped from `content`)
- `url` (mapped from `source_url`)
- `source` (mapped from `carrier`)
- `published_at`
- `category`
- `status`
- `fields`
- `governance`

Both Featured Information (`kelly-insure-data-featured`) and Insurer Notices (`kelly-insure-data-notices`) share the same canonical Busabase fields: `title`, `content`, `source_url`, `published_at`, `carrier`, `status`, `content_html`, `content_type` (`information`/`knowledge`), `category`, `attachments`, `lifebee_key`. Only `title` is required for governance scoring; `summary`, `source`, and `tags` are not required fields in the actual Bases.

## Feedback Item

Required:

- `id`
- `title`
- `content`
- `source`
- `user_name`
- `contact`
- `rating`
- `category`
- `tags`
- `created_at`
- `status`
- `fields`
- `governance`

The feedback item corresponds to one record in the configured user feedback Base. It should preserve the user-visible feedback text, source context, status, and any contact/rating fields that are safe to store.

## Preset Prompt Item (miniapp-owned Base)

`insurance-prompts` (预置提示词) sits in the same workspace folder as the four
Bases above, but it belongs to the insure miniapp, which reads it read-only for
its home prompt rows. This AirApp does not declare it in `content/kelly-insure-data-app/app/js/config.js`,
does not read it, and it is absent from the snapshot — there is no
`prompt_items` array. It is documented here because an operator rebuilding this
workspace must recreate it with the schema the miniapp expects.

Canonical fields:

| Field slug | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | text | yes | Short home-row label. Keep to 14 characters or fewer, or the miniapp row overflows. |
| `prompt` | longtext | yes | Full question inserted into the composer. Never equal to `title`. |
| `category` | text | no | One of `查资料` / `答异议` / `做计划书`. These are the three home slots; a row with any other value is not shown. |
| `expected_result` | longtext | no | What a good answer should contain. Reference material for AI retrieval — never rendered to the end user. |
| `status` | text | no | `active` shows the row. Any other non-empty value hides it. |

The miniapp rotates one prompt per category per day. Prompt text is insurance
sales copy, so it must avoid guarantees, absolute claims, and promised outcomes.

Known gap: `scripts/export_busabase_snapshot.mjs` resolves Bases from the fixed
`--featured-slug` / `--notices-slug` / `--qa-slug` / `--feedback-slug` arguments,
so a restore manifest omits this Base and restoring a workspace from a manifest
drops the prompt library. Teaching the export/restore scripts about it is
separate work.

## Governance

Every record-like item should carry:

```json
{
  "governance": {
    "completeness_pct": 100,
    "missing_fields": [],
    "status": "active"
  }
}
```

Use `missing_fields` to drive UI attention. Use `status` values such as `active`, `draft`, `review`, `needs_metadata`, `needs_review`, or a source-specific status string.

## Asset text

PDF binary reads yield no extracted body and PDFs have no companion `.meta` file. Full extracted text belongs only in the Asset text slot:

- Write: `PUT /api/v1/assets/{assetId}/text` with `{ "text": "..." }`
- Read: `GET /api/v1/assets/{assetId}/text/lines`

`Asset.metadata` may contain parser facts, `parsed_text_chars`, a short `extraction_summary`, source details, and structured governance fields. It must never contain `parsed_text` or the full body.
