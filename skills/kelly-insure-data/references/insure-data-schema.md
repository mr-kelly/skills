# Kelly Insure Data UI Schema

This schema powers the local UI for insurance data entry and governance.

## Snapshot

`app/.data/insure_snapshot.json`:

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "local|busabase",
  "drive": {
    "node_id": "Busabase Drive node id",
    "name": "港险资料库",
    "slug": "hk-insurance-drive",
    "metadata": {},
    "metadata_fields": [{ "key": "owner", "value": "Kelly" }]
  },
  "bases": {
    "featured": {
      "base_id": "bse_...",
      "name": "资讯精选",
      "slug": "featured-information",
      "fields": [{ "key": "title", "value": "Title (text)" }]
    },
    "notices": {
      "base_id": "bse_...",
      "name": "保司通知",
      "slug": "insurance-news",
      "fields": [{ "key": "title", "value": "Title (text)" }]
    },
    "qa": {
      "base_id": "bse_...",
      "name": "问答",
      "slug": "insurance-qa",
      "fields": [{ "key": "question", "value": "Question (text)" }]
    },
    "feedback": {
      "base_id": "bse_...",
      "name": "用户反馈",
      "slug": "user-feedback",
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

Both Featured Information (`featured-information`) and Insurer Notices (`insurance-news`) share the same canonical Busabase fields: `title`, `content`, `source_url`, `published_at`, `carrier`, `status`, `content_html`, `content_type` (`information`/`knowledge`), `category`, `attachments`, `lifebee_key`. Only `title` is required for governance scoring; `summary`, `source`, and `tags` are not required fields in the actual Bases.

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
