import { createHash } from "node:crypto";

export const BUSABASE_SCHEMA = {
  provider: "busabase",
  schema_id: "kelly-social.storage",
  schema_version: "1",
  folder: {
    default_slug: "kelly-social-workspace",
    children: ["base", "drive"],
  },
  base: {
    id: "kelly-social",
    slug: "kelly-social",
    name: "Kelly Social Records",
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
    id: "kelly-social-files",
    slug: "kelly-social-workspace-files",
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
    namespace: "kelly-social",
    provider: "busabase-vault",
    refs: ["BUSABASE_API_KEY"],
  },
} as const;

export function schemaFingerprint(): string {
  return createHash("sha256").update(JSON.stringify(BUSABASE_SCHEMA)).digest("hex");
}
