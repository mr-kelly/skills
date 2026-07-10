# Kelly Insure Data Restore Manifest

The restore manifest is a portable backup description for rebuilding a Kelly Insure Data Busabase workspace after a destructive reset.

It stores the workspace tree shape, Drive files, Base schemas, record values, and AI-readable asset metadata. It does not embed binary file bytes; `restore_busabase_snapshot.ts` reads those from a local backup directory.

## Shape

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "busabase",
  "folder": {
    "id": "nod_...",
    "slug": "hk-insurance-library-0630",
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
        "metadata": {
          "carrier": "Carrier",
          "product_name": "Product",
          "parsed_text": "PDF text extracted by the metadata backfill parser",
          "parsed_text_chars": 1234
        }
      }
    ]
  },
  "bases": {
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
    "news": {
      "id": "bse_...",
      "node_id": "nod_...",
      "slug": "insurance-news",
      "name": "新闻资讯",
      "description": "",
      "fields": [],
      "records": []
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
- Files are uploaded as assets, then attached to the Drive through a Drive ChangeRequest.
- Records are restored through Base bulk ChangeRequests.
- Existing objects are reused when their slug/id/path is already present.

This manifest is not a full Busabase database dump. It is scoped to the Kelly Insure Data workspace contract: one folder, one Drive, one QA Base, one News Base, and one User Feedback Base.
