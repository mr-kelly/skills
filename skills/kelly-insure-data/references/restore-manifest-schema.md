# Kelly Insure Data Restore Manifest

The restore manifest is a portable backup description for rebuilding a Kelly Insure Data Busabase workspace after a destructive reset.

It stores the workspace tree shape, Drive files, Base schemas, record values, and AI-readable asset metadata. It does not embed binary file bytes; `restore_busabase_snapshot.ts` reads those from a local backup directory. `parsed_text` is never stored in file metadata; the manifest uses `text_status` to track extraction state only.

## Shape

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "busabase",
  "folder": {
    "id": "nod_...",
    "slug": "hk-insurance-company-folders",
    "name": "港险资料库",
    "description": ""
  },
  "drive": {
    "node_id": "nod_...",
    "slug": "hk-insurance-drive",
    "name": "港险资料库 Drive",
    "description": "港险资料库文件盘",
    "metadata": {},
    "files": [
      {
        "path": "Carrier/01_产品手册/file.pdf",
        "name": "file.pdf",
        "displayName": "file.pdf",
        "size": 12345,
        "mimeType": "application/pdf",
        "updatedAt": "ISO timestamp",
        "assetId": "ast_...",
        "contentHash": "sha256:...",
        "text_status": "unknown",
        "metadata": {
          "carrier": "Carrier",
          "product_name": "Product",
          "parsed_text_chars": 1234
        }
      }
    ]
  },
  "bases": {
    "featured": {
      "id": "bse_...",
      "node_id": "nod_...",
      "slug": "featured-information",
      "name": "资讯精选",
      "description": "",
      "fields": [
        {
          "slug": "title",
          "name": "Title",
          "type": "text",
          "required": true,
          "options": {}
        }
      ],
      "records": [
        {
          "id": "rec_...",
          "fields": {
            "title": "...",
            "content": "...",
            "carrier": "...",
            "published_at": "ISO timestamp"
          }
        }
      ]
    },
    "notices": {
      "id": "bse_...",
      "node_id": "nod_...",
      "slug": "insurance-news",
      "name": "保司通知",
      "description": "",
      "fields": [],
      "records": []
    },
    "qa": {
      "id": "bse_...",
      "node_id": "nod_...",
      "slug": "insurance-qa",
      "name": "问答",
      "description": "",
      "fields": [
        {
          "slug": "question",
          "name": "Question",
          "type": "text",
          "required": true,
          "options": {}
        }
      ],
      "records": [
        {
          "id": "rec_...",
          "fields": {
            "question": "...",
            "answer": "..."
          }
        }
      ]
    },
    "feedback": {
      "id": "bse_...",
      "node_id": "nod_...",
      "slug": "user-feedback",
      "name": "用户反馈",
      "description": "",
      "fields": [
        {
          "slug": "content",
          "name": "反馈内容",
          "type": "longtext",
          "required": true,
          "options": {}
        }
      ],
      "records": [
        {
          "id": "rec_...",
          "fields": {
            "title": "...",
            "content": "...",
            "source": "...",
            "status": "new",
            "created_at": "ISO timestamp"
          }
        }
      ]
    }
  }
}
```

## Restore Behavior

`restore_busabase_snapshot.ts` is intentionally explicit:

- `--dry-run` prints the intended folder, Drive, Base, file, and record actions without mutating Busabase.
- `--apply` creates missing nodes and writes data.
- Local files are resolved by joining `--files-root` with each manifest file `path`.
- Files are uploaded as assets, then attached to the Drive through a Drive ChangeRequest. Metadata is sanitized before upload (`parsed_text` removed).
- Records are restored through Base bulk ChangeRequests.
- Existing objects are reused when their slug/id/path is already present.
- Text slots are **not** restored from the manifest. After `--apply`, run `npm run busabase:backfill-pdf-text -- --drive-node-id <resolved-id> --files-root <local-backup> --apply` to rebuild Asset text slots from trusted local PDFs.

The export CLI accepts `--featured-slug` and `--notices-slug`; legacy `--news-slug` is accepted as a notices alias. The restore script accepts both current `bases.notices` and legacy `bases.news` manifests.

This manifest is not a full Busabase database dump. It is scoped to the Kelly Insure Data workspace contract: one folder, one Drive, one Featured Information Base, one Insurer Notices Base, one QA Base, and one User Feedback Base.
