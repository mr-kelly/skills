import { createHash } from "node:crypto";

export const BUSABASE_SCHEMA = {
  provider: "busabase",
  schema_id: "kelly-audit.storage",
  schema_version: "1",
  folder: {
    default_slug: "kelly-audit-workspace",
    children: ["base", "drive"],
  },
  base: {
    id: "kelly-audit",
    slug: "kelly-audit",
    name: "Kelly Audit Records",
    fields: [
      "record_id",
      "kind",
      "title",
      "source",
      "body_text",
      "status",
      "decision_action",
      "execution_status",
      "updated_at",
    ],
    record_kinds: ["review_item", "task", "approval", "canonical_record", "execution_report"],
  },
  related_bases: [],
  drive: {
    id: "kelly-audit-files",
    slug: "kelly-audit-workspace-files",
    config_files: ["config/config.json"],
    state_files: ["state/schema.json", "state/lock.json", "state/scan_state.json"],
    compat_files: ["state/current_batch.json", "state/decisions.json"],
    roots: ["config", "state", "batches", "attachments", "imports", "exports"],
  },
  docs: {
    roots: ["docs"],
    use_for: ["long_form_drafts", "canonical_documents"],
  },
  secrets: {
    namespace: "kelly-audit",
    provider: "busabase-vault",
    refs: ["BUSABASE_API_KEY"],
  },
} as const;

export function schemaFingerprint(): string {
  return createHash("sha256").update(JSON.stringify(BUSABASE_SCHEMA)).digest("hex");
}
