// Busabase reply-draft review store: a thin HTTP client to a shared Busabase
// base. This is the team path — every teammate sees the same reply-review queue
// and the audit of who approved which reply. A reply draft is a Busabase record
// (fields kind="email_reply", to, subject, body); the agent draft is a change
// request; a human verdict is a review; "make it warmer" is request_changes
// (→ changes_requested → the agent revises → re-review); an approved reply is
// the canonical body. SENDING stays an external side effect performed by the
// kelly-email runner after approval — Busabase never sends mail.
//
// Config (config.busabase, env wins):
//   base_url     KELLY_EMAIL_BUSABASE_URL
//   base_id      KELLY_EMAIL_BUSABASE_BASE_ID
//   api_key_env  -> Bearer token (required by busabase-cloud / multi-tenant)

const STATUS_MAP = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const REPLY_KIND = "email_reply";

export function createBusabaseReplyStore(meta = {}) {
  const busa = (meta.config && meta.config.busabase) || {};
  const baseUrl = (process.env.KELLY_EMAIL_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_EMAIL_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_EMAIL_BUSABASE_API_KEY || ""
    : process.env.KELLY_EMAIL_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase reply store needs base_url and base_id. Set config.busabase.{base_url,base_id} "
          + "or KELLY_EMAIL_BUSABASE_URL / KELLY_EMAIL_BUSABASE_BASE_ID.",
      );
    }
  }

  async function api(method, pathname, body) {
    requireConfig();
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function primaryOperation(cr) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function toReply(cr) {
    const op = primaryOperation(cr) || {};
    const fields = (op.headCommit && op.headCommit.fields) || {};
    return {
      reply_id: cr.id,
      email_id: fields.email_id || "",
      to: fields.to || "",
      subject: fields.subject || "",
      draft: typeof fields.body === "string" ? fields.body : "",
      status: STATUS_MAP[cr.status] || "needs_review",
      base_fields: op.baseFields || null,
      operation_id: op.id || null,
      busabase_status: cr.status,
    };
  }

  async function getCr(reply_id) {
    return api("GET", `/api/v1/change-requests/${encodeURIComponent(reply_id)}`);
  }

  return {
    kind: "busabase",

    configSummary() {
      return {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
      };
    },

    async openReplyDraft({ email_id, to, subject, draft, thread_id }) {
      const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
        payload: {
          fields: { kind: REPLY_KIND, email_id, thread_id: thread_id || "", to, subject, body: draft || "" },
          message: `Reply draft for ${subject || email_id}`,
          submittedBy: "kelly-email",
        },
      });
      return { reply_id: cr?.id || null };
    },

    async listReplyDrafts() {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      return list
        .map(toReply)
        .filter((r) => {
          // Only reply records (others may share the base).
          return r.to || r.subject || r.draft;
        });
    },

    async reviewReply(reply_id, { verdict, edits, comment } = {}) {
      const cr = await getCr(reply_id);
      const op = primaryOperation(cr);
      const current = (op && op.headCommit && op.headCommit.fields) || {};
      if (verdict === "approve") {
        if (edits !== undefined && edits !== null && edits !== current.body && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: { ...current, body: edits }, message: "Edited before approval", author: "kelly-email" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reply_id)}/reviews`, {
          payload: { verdict: "approved", reason: comment || undefined },
        });
      } else if (verdict === "revise") {
        if (!op) throw new Error("reply change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: { ...current, body: edits ?? current.body }, message: comment || "Saved edits", author: "kelly-email" },
        });
      } else if (verdict === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reply_id)}/reviews`, {
          payload: { verdict: "rejected", reason: comment || "Please revise the reply" },
        });
      } else if (verdict === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reply_id)}/close`, {
          reason: comment || "Closed by reviewer",
        });
      } else {
        const error = new Error(`unknown verdict: ${verdict}`);
        error.statusCode = 400;
        throw error;
      }
      return { ok: true };
    },

    async getApprovedReply(reply_id) {
      const cr = await getCr(reply_id);
      if (cr.status !== "approved") return null;
      const fields = (primaryOperation(cr)?.headCommit?.fields) || {};
      return { reply_id, to: fields.to || "", subject: fields.subject || "", body: fields.body || "" };
    },

    async markSent(reply_id) {
      // Approved reply has been sent by the runner; merge it to canonical.
      await api("POST", `/api/v1/change-requests/${encodeURIComponent(reply_id)}/merge`, {});
      return { ok: true };
    },

    async listAgentTasks() {
      const tasks = await api("GET", "/api/v1/agent/tasks");
      const list = Array.isArray(tasks) ? tasks : tasks?.items || [];
      return list.map((t) => ({
        reply_id: t.changeRequest?.id,
        trigger: t.trigger,
        reason: t.reviewReason || "",
      }));
    },
  };
}
