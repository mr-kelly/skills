// Local reply-draft review store: app/.cache/reply_reviews.json.
// Single-operator, zero-dependency. Same interface as the Busabase store, so a
// team can switch to KELLY_EMAIL_REPLY_PROVIDER=busabase without code changes.

import fs from "node:fs/promises";
import path from "node:path";

function storePath(skillDir) {
  return path.join(skillDir, "app", ".data", "reply_reviews.json");
}

async function readStore(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { reviews: {} };
    throw error;
  }
}

async function writeStore(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function createLocalReplyStore(meta = {}) {
  const file = storePath(meta.skillDir);

  function nextId(reviews) {
    // Stable, content-free id so the same email reply keeps one record.
    let n = 1;
    while (reviews[`reply-${n}`]) n += 1;
    return `reply-${n}`;
  }

  return {
    kind: "local",

    configSummary() {
      return { provider: "local", reply_store: file };
    },

    async openReplyDraft({ email_id, to, subject, draft, thread_id }) {
      const store = await readStore(file);
      store.reviews ||= {};
      // Reuse an existing open record for the same email if present.
      const existing = Object.values(store.reviews).find(
        (r) => r.email_id === email_id && r.status !== "done" && r.status !== "blocked",
      );
      const reply_id = existing?.reply_id || nextId(store.reviews);
      store.reviews[reply_id] = {
        reply_id,
        email_id,
        thread_id: thread_id || existing?.thread_id || "",
        to: to || existing?.to || "",
        subject: subject || existing?.subject || "",
        draft: draft ?? existing?.draft ?? "",
        status: "needs_review",
        comment: existing?.comment || "",
        history: existing?.history || [],
        updated_at: new Date().toISOString(),
      };
      await writeStore(file, store);
      return { reply_id };
    },

    async listReplyDrafts() {
      const store = await readStore(file);
      return Object.values(store.reviews || {}).map((r) => ({
        reply_id: r.reply_id,
        email_id: r.email_id,
        to: r.to,
        subject: r.subject,
        draft: r.draft,
        status: r.status,
        base_fields: r.history?.length ? { body: r.history[r.history.length - 1].draft } : null,
      }));
    },

    async reviewReply(reply_id, /** @type {any} */ { verdict, edits, comment } = {}) {
      const store = await readStore(file);
      const r = store.reviews?.[reply_id];
      if (!r) {
        /** @type {any} */
        const error = new Error(`reply not found: ${reply_id}`);
        error.statusCode = 404;
        throw error;
      }
      if (edits !== undefined && edits !== null && edits !== r.draft) {
        r.history.push({ draft: r.draft, at: r.updated_at });
        r.draft = edits;
      }
      if (comment) r.comment = comment;
      if (verdict === "approve") r.status = "approved";
      else if (verdict === "request_changes") r.status = "changes_requested";
      else if (verdict === "revise") r.status = "needs_review";
      else if (verdict === "block") r.status = "blocked";
      else {
        /** @type {any} */
        const error = new Error(`unknown verdict: ${verdict}`);
        error.statusCode = 400;
        throw error;
      }
      r.updated_at = new Date().toISOString();
      await writeStore(file, store);
      return { ok: true, status: r.status };
    },

    async getApprovedReply(reply_id) {
      const store = await readStore(file);
      const r = store.reviews?.[reply_id];
      if (!r || r.status !== "approved") return null;
      return { reply_id, to: r.to, subject: r.subject, body: r.draft };
    },

    async markSent(reply_id, result) {
      const store = await readStore(file);
      const r = store.reviews?.[reply_id];
      if (!r) return { ok: false };
      r.status = "done";
      r.sent_at = new Date().toISOString();
      if (result) r.send_result = result;
      r.updated_at = r.sent_at;
      await writeStore(file, store);
      return { ok: true };
    },

    async listAgentTasks() {
      const store = await readStore(file);
      return Object.values(store.reviews || {})
        .filter((r) => r.status === "changes_requested")
        .map((r) => ({
          reply_id: r.reply_id,
          email_id: r.email_id,
          trigger: "changes_requested",
          reason: r.comment || "",
          draft: r.draft,
        }));
    },
  };
}
