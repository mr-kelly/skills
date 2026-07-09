# Batch & Decisions Provider Schema

Read this when generating, updating, or executing a kelly-email review batch.

Generate provider email records that can be projected into a batch with this shape. Local mode stores the records in `.agents/skills/kelly-email/app/.data/email_records.json`; Busabase mode stores them as Emails Base `review_item` rows. Contact rows are derived from the batch into local `email_contacts.json` or the Busabase Email Contacts Base, with email rows linking to contacts through sender/recipient contact id columns. `current_batch.json` and `decisions.json` are compatibility snapshots, not the canonical store.

```json
{
  "batch_id": "kelly-email-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "kelly-email-skill",
  "mode": "app-in-skill",
  "classification_pipeline": {
    "version": "pipeline version",
    "stage": "rule_prefilter|agent_review",
    "requires_agent_review": false
  },
  "metrics": {
    "scanned": 20,
    "prepared": 13,
    "needs_review": 7,
    "drafted": 0
  },
  "items": [
    {
      "id": "stable local id",
      "uid": "imap uid",
      "thread_id": "message id or thread id",
      "message_id": "raw RFC message id",
      "account": "mailbox account",
      "mailbox_group_id": "dedupe group",
      "folder": "INBOX",
      "from": "sender",
      "to": "recipient",
      "cc": "cc recipients",
      "date": "received date",
      "subject": "subject",
      "category": "customer|money|course_feedback|system|marketing|other",
      "risk": ["money", "privacy"],
      "status": "prepared|needs_review|draft_requested|drafted|executed",
      "proposed_action": "archive|mark_read|send_reply|keep_unread|review",
      "classification_method": "rule_prefilter|agent_review",
      "classification_pipeline_version": "pipeline version",
      "rule_prefilter": {
        "category": "category before agent review",
        "risk": ["risk before agent review"],
        "status": "status before agent review",
        "proposed_action": "action before agent review",
        "reason": "rule reason"
      },
      "agent_review": {
        "status": "pending|reviewed",
        "confidence": "low|medium|high",
        "evidence": "short sender/subject/body evidence",
        "changed": true,
        "reviewed_at": "ISO timestamp"
      },
      "review_number": 1,
      "review_ref": "Review #1",
      "review_brief": {
        "background": "what this email appears to be about",
        "why_review": "why the agent stopped",
        "recommendation": "what the user should do next",
        "suggested_reply": "optional short reply draft or reply outline when replying is recommended"
      },
      "reason": "why this action is proposed",
      "summary": "short list-preview summary, not the main detail view",
      "suggested_reply": "optional editable reply draft shown in the UI for review items",
      "body": "trimmed original text for review",
      "html": "sanitized HTML email body for sandboxed iframe preview",
      "has_html": true,
      "quote_preview": "short quote to include if replying",
      "attachments": [{ "filename": "name", "content_type": "mime", "size": 123, "url": "/attachments/batch/item/file.pdf", "preview": true }],
      "draft": "optional editable reply draft",
      "decision": {
        "action": "archive|mark_read|send_reply|draft_reply|keep_unread|no_action|needs_review|revise",
        "decided_at": "ISO timestamp",
        "comment": "optional user note"
      },
      "execution": {
        "status": "executed|blocked|error",
        "action": "archive|mark_read|send_reply",
        "reason": "blocked/error reason",
        "executed_at": "ISO timestamp",
        "send_as": "identity email"
      },
      "execution_override": {},
      "user_comment": "latest UI review note",
      "updated_at": "ISO timestamp"
    }
  ]
}
```

## Derived UI workflow state

Current UI workflow state is derived from the item rather than stored as a separate field:

- `All`: every item in the current batch.
- `Needs Review`: `status=needs_review`, `status=drafted` without `decision.action=send_reply`, or `decision.action` is `needs_review`/`revise`. Drafted replies always return here for final human send approval.
- `Approved`: explicit executable decision waiting for `/kelly-email`, such as `archive`, `mark_read`, `send_reply`, or `draft_reply` while `status=draft_requested`; also includes prepared non-reply cleanup items with a clear AI next step, so the user does not need to approve an extra intermediate state. Do not include drafted replies unless the user explicitly approved sending them.
- `Done`: `execution.status=executed` or `decision.action=no_action`.
- `Blocked`: `execution.status=blocked`.

Avoid using `status=decided`; the user's decision belongs in `decision.action`, while `status` describes the item's current support lifecycle.

## Decisions

After the user reviews in the UI, read decisions through the active provider. Local mode derives them from `email_records.json`; Busabase mode derives them from `review_item.decision_*` Base columns. Treat them as the user's approval/comment layer, but still execute only decisions that are explicit: `archive` (move to the configured category/risk target folder and mark read), `mark_read`, `send_reply`, `draft_reply`, `keep_unread`, `no_action`, `needs_review`, `revise`.
