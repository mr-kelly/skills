// Reply-draft review store for kelly-email.
//
// kelly-email is mostly "approve-an-action" work (archive / mark read), which
// fits the local file/action-queue model. But one slice is genuine
// "edit-to-canonical" content: the outbound REPLY DRAFT. A reply is written,
// reviewed, revised ("make it warmer"), and approved before it is sent — the
// canonical review loop. This module backs only that slice, optionally with
// Busabase so a team shares one reply-review queue + audit trail. Triage stays
// on the existing local handoff; sending stays an external side effect the
// skill performs after approval.
//
//   KELLY_EMAIL_REPLY_PROVIDER=local     (default) app/.cache/reply_reviews.json
//   KELLY_EMAIL_REPLY_PROVIDER=busabase  HTTP client to a shared Busabase base
//
// Both implement the same ReplyReviewStore interface:
//   openReplyDraft({ email_id, to, subject, draft, thread_id }) -> { reply_id }
//   listReplyDrafts()                  -> [{ reply_id, status, to, subject, draft, base_fields }]
//   reviewReply(reply_id, { verdict, edits?, comment? })  verdict: approve|request_changes|revise|block
//   getApprovedReply(reply_id)         -> { reply_id, to, subject, body } | null  (for the skill to send)
//   markSent(reply_id, result?)        -> {ok}   (after the skill sends; merge/close)
//   listAgentTasks()                   -> reply drafts in changes_requested (the agent should revise)
//   configSummary()

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseReplyStore } from "./busabase-reply-store.mjs";
import { createLocalReplyStore } from "./local-reply-store.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function configCandidates() {
  return [
    process.env.KELLY_EMAIL_CONFIG,
    path.join(skillDir, "config.local.json"),
    path.join(os.homedir(), ".config", "kelly-email", "config.json"),
    path.join(skillDir, "config.example.json"),
  ].filter(Boolean);
}

async function loadConfig() {
  for (const candidate of configCandidates()) {
    try {
      return { config: JSON.parse(await fs.readFile(candidate, "utf8")), source: candidate };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { config: {}, source: null };
}

export async function createReplyReviewStore() {
  const meta = await loadConfig();
  meta.skillDir = skillDir;
  const kind = String(process.env.KELLY_EMAIL_REPLY_PROVIDER || meta.config.reply_provider || "local").toLowerCase();
  if (kind === "local") return createLocalReplyStore(meta);
  if (kind === "busabase") return createBusabaseReplyStore(meta);
  throw new Error(`Unknown KELLY_EMAIL_REPLY_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
