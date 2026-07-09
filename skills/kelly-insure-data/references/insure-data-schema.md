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
    "name": "文件盘",
    "slug": "optional slug",
    "metadata": {},
    "metadata_fields": [{ "key": "owner", "value": "Kelly" }]
  },
  "bases": {
    "qa": {
      "base_id": "bse_...",
      "name": "问答",
      "slug": "insurance-qa",
      "fields": [{ "key": "question", "value": "Question (text)" }]
    },
    "news": {
      "base_id": "bse_...",
      "name": "新闻资讯",
      "slug": "insurance-news",
      "fields": [{ "key": "title", "value": "Title (text)" }]
    }
  },
  "metrics": {
    "file_count": 0,
    "metadata_field_count": 0,
    "qa_count": 0,
    "news_count": 0,
    "total_records": 0,
    "data_quality_score": 0,
    "needs_governance": 0
  },
  "files": [],
  "qa_pairs": [],
  "news_items": [],
  "warnings": []
}
```

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
- `category`
- `source`
- `tags`
- `updated_at`
- `status`
- `fields`
- `governance`

The QA pair corresponds to one record in the configured QA Base.

## News Item

Required:

- `id`
- `title`
- `summary`
- `url`
- `source`
- `published_at`
- `category`
- `tags`
- `status`
- `fields`
- `governance`

The news item corresponds to one record in the configured news Base.

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
