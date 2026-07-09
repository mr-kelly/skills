import { createHash } from "node:crypto";

export const BUSABASE_SCHEMA = {
  provider: "busabase",
  schema_id: "kelly-email.storage",
  schema_version: "1",
  base: {
    default_id: "kelly-email",
    name: "Kelly Email",
    record_kinds: [
      "schema_meta",
      "config",
      "onboarding",
      "lock",
      "batch",
      "decision_set",
      "review_item",
      "reply_draft",
      "execution_report",
      "scan_state",
    ],
  },
  drive: {
    default_id: "kelly-email-files",
    roots: ["attachments", "imports", "exports", "reports"],
  },
  secrets: {
    namespace: "kelly-email",
    refs: ["KELLY_EMAIL_IMAP_*", "KELLY_EMAIL_SMTP_*", "KELLY_EMAIL_BUSABASE_API_KEY"],
  },
  records: {
    schema_meta: "kelly-email-schema",
    config: "kelly-email-config",
    onboarding: "kelly-email-onboarding",
    lock: "kelly-email-lock",
    current_batch: "kelly-email-current-batch",
    decisions: "kelly-email-decisions",
    scan_state: "kelly-email-scan-state",
  },
} as const;

export function schemaFingerprint() {
  return createHash("sha256").update(JSON.stringify(BUSABASE_SCHEMA)).digest("hex");
}
