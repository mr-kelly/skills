# Kelly PR Review UI Schema

`app/.cache/current_batch.json`:

```json
{
  "batch_id": "kelly-pr-review-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "kelly-pr-review",
  "mode": "app-in-skill",
  "metrics": {
    "needs_review": 0,
    "to_approve": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0
  },
  "items": [
    {
      "id": "owner/repo#123",
      "review_ref": "Review #1",
      "repo": "owner/repo",
      "number": 123,
      "title": "PR title",
      "author": "login",
      "url": "https://github.com/owner/repo/pull/123",
      "summary": "Short reason for review",
      "body": "Trimmed PR body or review context",
      "status": "needs_review|to_approve|approved|done|blocked|merged",
      "proposed_action": "approve|comment|request_changes|no_action|needs_review",
      "reason": "Why this action is proposed",
      "risk": ["security"],
      "labels": ["bug"],
      "changed_files": ["path/file.ts"],
      "additions": 10,
      "deletions": 2,
      "updated_at": "ISO timestamp",
      "state": "open|closed",
      "merged": true,
      "merged_at": "ISO timestamp",
      "verification_status": "needs_test|tested",
      "tested_at": "ISO timestamp",
      "test_note": "Human verification notes",
      "test_evidence": [
        {
          "filename": "screenshot.png",
          "content_type": "image/png",
          "url": "/test-evidence/owner-repo-123/screenshot.png"
        }
      ],
      "review_body": "Editable review body",
      "decision": {
        "action": "approve|comment|request_changes|no_action|needs_review|block",
        "comment": "user note",
        "review_body": "final review text",
        "decided_at": "ISO timestamp"
      },
      "execution": {
        "status": "pending|executed|blocked|error",
        "reason": "result detail",
        "executed_at": "ISO timestamp"
      }
    }
  ]
}
```

`app/.cache/decisions.json` contains approved decisions keyed by item id plus the editable review body.

`app/.cache/tested.json` is local-only post-merge verification state. A merged PR can move from `needs_test` to `tested` only when a human adds a test note or uploads screenshot evidence.
