import { createHash } from "node:crypto";

export const BUSABASE_SCHEMA = {
  provider: "busabase",
  schema_id: "kelly-email.storage",
  schema_version: "1",
  folder: {
    default_slug: "kelly-email-workspace",
    name: "Kelly Email",
    children: ["base", "drive"],
  },
  base: {
    default_id: "kelly-email",
    default_slug: "kelly-email",
    name: "Kelly Email",
    record_kinds: ["review_item", "reply_draft", "execution_report"],
    fields: [
      "record_id",
      "kind",
      "batch_id",
      "item_id",
      "email_uid",
      "thread_id",
      "message_id",
      "folder",
      "subject",
      "sender",
      "recipients",
      "cc",
      "source_account",
      "email_date",
      "category",
      "risk",
      "reason",
      "summary",
      "review_background",
      "review_recommendation",
      "body_excerpt",
      "draft_excerpt",
      "user_comment",
      "has_html",
      "has_draft",
      "has_translation",
      "has_attachments",
      "drive_path",
      "attachment_count",
      "attachment_names",
      "classification_method",
      "user_language",
      "source_language",
      "status",
      "proposed_action",
      "updated_at",
      "created_at",
      "report",
      "latest_record_id",
    ],
  },
  drive: {
    default_id: "kelly-email-files",
    default_slug: "kelly-email-workspace-files",
    config_files: ["config/config.json"],
    state_files: [
      "state/schema.json",
      "state/current_batch.json",
      "state/decisions.json",
      "state/lock.json",
      "state/scan_state.json",
    ],
    roots: ["config", "state", "batches", "attachments", "imports", "exports", "reports"],
  },
  secrets: {
    namespace: "kelly-email",
    provider: "busabase-vault",
    refs: ["KELLY_EMAIL_IMAP_*", "KELLY_EMAIL_SMTP_*", "KELLY_EMAIL_BUSABASE_API_KEY"],
  },
} as const;

export const BUSABASE_LEGACY_RECORDS = {
  current_batch: "kelly-email-current-batch",
  decisions: "kelly-email-decisions",
} as const;

export function schemaFingerprint() {
  return createHash("sha256").update(JSON.stringify(BUSABASE_SCHEMA)).digest("hex");
}
