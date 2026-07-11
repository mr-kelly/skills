import {
  activeLang,
  breachingTickets,
  csatStars,
  csatTrendSvg,
  dateTime,
  els,
  enumLabel,
  escapeHtml,
  flashNotice,
  kbById,
  knowledge,
  loadState,
  matchesQuery,
  priorityChip,
  referenceNow,
  render,
  slaCountdown,
  state,
  t,
  ticketById,
  tickets,
} from "../app.js";
/* ----- knowledge ----- */

export function renderKnowledge() {
  els.title.textContent = t("knowledgeBase");
  const list = knowledge().filter((article) =>
    matchesQuery([article.title, article.body, article.category, ...(article.tags || [])]),
  );
  els.subtitle.textContent = `${list.length} ${t("knowledgeBase")}`;
  els.content.innerHTML = list.length
    ? `
    <div class="kb-grid">
      ${list
        .map(
          (article) => `
        <a class="kb-card ${article.kind === "macro" ? "macro" : ""}" href="#/knowledge/${encodeURIComponent(article.article_id)}">
          <div class="row between">
            <strong>${escapeHtml(article.title)}</strong>
            <span class="badge">${article.kind === "macro" ? t("macro") : escapeHtml(article.category || "")}</span>
          </div>
          <p class="kb-body">${escapeHtml(article.body)}</p>
          <div class="kb-tags">${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        </a>
      `,
        )
        .join("")}
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

export function renderKbDetail() {
  const article = kbById(state.route.id);
  if (!article) {
    renderKnowledge();
    return;
  }
  els.title.textContent = article.title;
  els.subtitle.textContent = `${article.kind === "macro" ? t("macro") : article.category || ""} · ${article.article_id}`;
  const citedBy = tickets().filter((ticket) => (ticket.kb_refs || []).includes(article.article_id));
  els.content.innerHTML = `
    <button class="back-to-list" type="button" data-action="back" data-target="knowledge">← ${t("knowledge")}</button>
    <section class="detail">
      <div class="detail-main">
        <div class="overview-panel kb-article">
          <p class="kb-article-body">${escapeHtml(article.body)}</p>
          <div class="kb-tags">${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("tickets")}</h2>
        ${
          citedBy.length
            ? citedBy
                .map(
                  (ticket) => `
          <a class="side-row" href="#/tickets/${encodeURIComponent(ticket.ticket_id)}">
            <strong>#${ticket.ref} ${escapeHtml(ticket.customer?.name || "")}</strong>
            <span class="muted">${escapeHtml(ticket.subject || "")}</span>
          </a>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
      </aside>
    </section>
  `;
}

/* ----- sla & csat ----- */

export function renderSla() {
  els.title.textContent = t("sla");
  const metrics = state.snapshot?.metrics || {};
  const open = tickets().filter((item) => item.status !== "done" && item.status !== "blocked" && item.sla?.due_by);
  const withCountdown = open
    .map((ticket) => ({ ticket, sla: slaCountdown(ticket.sla.due_by) }))
    .sort((a, b) => new Date(a.ticket.sla.due_by).getTime() - new Date(b.ticket.sla.due_by).getTime());
  const rated = tickets()
    .filter((item) => item.csat)
    .sort((a, b) => String(b.csat?.rated_at).localeCompare(String(a.csat?.rated_at)));
  els.subtitle.textContent = `${breachingTickets().length} ${t("slaBreached")} · ${t("csatAverage")} ${metrics.csat_average || 0}/5`;
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric ${breachingTickets().length ? "bad" : ""}"><span>${t("breachingSla")}</span><strong>${breachingTickets().length}</strong></div>
      <div class="metric"><span>${t("firstResponse")}</span><strong>${metrics.first_response_median_minutes || 0}<small class="inline-muted"> ${activeLang() === "zh" ? "分钟" : "min"}</small></strong></div>
      <div class="metric"><span>${t("csatAverage")}</span><strong>${metrics.csat_average || 0}<small class="inline-muted"> / 5</small></strong><small>${metrics.csat_responses || 0} ${t("csatResponses")}</small></div>
      <div class="metric"><span>${t("resolved")}</span><strong>${metrics.resolved_count || 0}</strong></div>
    </div>
    <section class="overview-grid two">
      <div class="overview-panel">
        <h2>${t("slaBoard")}</h2>
        ${
          withCountdown.length
            ? `<div class="sla-list">${withCountdown
                .map(
                  ({ ticket, sla }) => `
            <a class="sla-row ${sla.overdue ? "breached" : ""}" href="#/tickets/${encodeURIComponent(ticket.ticket_id)}">
              <span class="sla-copy">
                <strong>#${ticket.ref} ${escapeHtml(ticket.customer?.name || "")}</strong>
                <span class="muted">${escapeHtml(ticket.subject || "")}</span>
              </span>
              <span class="sla-meta">
                ${priorityChip(ticket.priority)}
                <span class="${sla.overdue ? "overdue" : "muted"}">${escapeHtml(sla.text)}</span>
              </span>
            </a>
          `,
                )
                .join("")}</div>`
            : `<div class="empty-inline">—</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("csatTrend")}</h2>
        ${csatTrendSvg(metrics.csat_trend)}
        <div class="csat-list">
          ${
            rated.length
              ? rated
                  .map(
                    (ticket) => `
            <a class="csat-row" href="#/tickets/${encodeURIComponent(ticket.ticket_id)}">
              <span class="sla-copy">
                <strong>#${ticket.ref} ${escapeHtml(ticket.customer?.name || "")}</strong>
                ${ticket.csat?.comment ? `<span class="muted">"${escapeHtml(ticket.csat.comment)}"</span>` : ""}
              </span>
              ${csatStars(ticket.csat?.score)}
            </a>
          `,
                  )
                  .join("")
              : `<div class="empty-inline">—</div>`
          }
        </div>
      </div>
    </section>
  `;
}

/* ----- settings ----- */

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const syncLog = state.snapshot?.sync_log || [];
  const report = state.settings?.execution_report;
  const risk = summary.risk_policy || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("knowledgeBase")}</dt><dd>${escapeHtml(summary.knowledge_base?.source_path || "—")}</dd>
          ${summary.reply_style ? `<dt>${t("replyStyle")}</dt><dd>${escapeHtml(summary.reply_style.tone || "")}</dd>` : ""}
        </dl>
      </section>
      <section>
        <h2>${t("riskPolicy")}</h2>
        <dl>
          <dt>Refund approval</dt><dd>${risk.refund_requires_approval === false ? t("off") || "off" : "required"}</dd>
          <dt>Max auto-refund</dt><dd>${risk.max_auto_refund ?? "—"}</dd>
          <dt>Block ungrounded</dt><dd>${risk.block_ungrounded_replies === false ? "no" : "yes"}</dd>
          <dt>Block commitments</dt><dd>${risk.block_commitments_without_approval === false ? "no" : "yes"}</dd>
        </dl>
      </section>
      ${
        summary.sla_policy
          ? `
      <section>
        <h2>${t("slaPolicy")}</h2>
        <dl>
          ${Object.entries(summary.sla_policy.first_response_hours || {})
            .map(
              ([severity, hours]) =>
                `<dt>${escapeHtml(enumLabel(severity, "severity"))}</dt><dd>${t("firstResponse")}: ${escapeHtml(hours)}h</dd>`,
            )
            .join("")}
          ${summary.sla_policy.business_hours ? `<dt>Business hours</dt><dd>${escapeHtml(summary.sla_policy.business_hours)}</dd>` : ""}
        </dl>
      </section>
      `
          : ""
      }
      <section>
        <h2>${t("accounts")}</h2>
        ${
          (summary.accounts || [])
            .map(
              (account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.channel, "channel"))} · ${escapeHtml(enumLabel(account.connector, "connector"))} ${account.handle ? `· ${escapeHtml(account.handle)}` : ""}</span>
            <span>${account.secret_envs.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${
          syncLog.length
            ? syncLog
                .slice(-8)
                .reverse()
                .map(
                  (entry) => `
          <div class="settings-account">
            <strong>${escapeHtml(entry.account_id)}</strong>
            <span>${escapeHtml(enumLabel(entry.method, "connector"))} · ${dateTime(entry.at)}</span>
            <span>${escapeHtml(entry.message || "")}</span>
          </div>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
      </section>
      ${
        report
          ? `
        <section>
          <h2>${t("executionReport")}</h2>
          ${(report.results || [])
            .map(
              (result) => `
            <div class="settings-account">
              <strong>#${result.ref} ${escapeHtml(result.ticket_id || "")}</strong>
              <span>${escapeHtml(enumLabel(result.status))} · ${escapeHtml(enumLabel(result.operation, "action"))}</span>
              <span>${escapeHtml(result.detail || result.target || "")}</span>
            </div>
          `,
            )
            .join("")}
        </section>
      `
          : ""
      }
    </div>
  `;
}

/* ----- actions ----- */

function currentReplyText(ticketId) {
  return String(
    state.drafts[ticketId] !== undefined
      ? state.drafts[ticketId]
      : els.content.querySelector("#composer-text")?.value || "",
  );
}

function applyGateDemo(ticket) {
  // Lightweight mirror of the server gate so demo edits reflect verdicts live.
  const reply = String(ticket.suggested_reply || "");
  const kbIds = new Set(knowledge().map((a) => a.article_id));
  const refs = ticket.kb_refs || [];
  const valid = refs.filter((id) => kbIds.has(id));
  const dangling = refs.filter((id) => !kbIds.has(id));
  const grounded = valid.length > 0 || reply.trim().length < 40;
  const commitment =
    /\b(refund|money back|reimburse|compensat|guarantee|credit your account|free month|discount code|coupon)\b/i.test(
      reply,
    );
  const refundApproved = ticket.proposed_action === "refund" && ticket.status === "approved";
  const checks = [
    { id: "grounding", ok: grounded, message: grounded ? "Grounded." : "Substantive reply cites no valid KB article." },
    {
      id: "kb_refs_resolve",
      ok: dangling.length === 0,
      message: dangling.length ? `Unknown KB refs: ${dangling.join(", ")}.` : "All KB refs resolve.",
    },
    {
      id: "no_unapproved_commitment",
      ok: !commitment || refundApproved,
      message:
        !commitment || refundApproved ? "No unapproved commitment." : "Promises a refund/commitment without approval.",
    },
    {
      id: "refund_policy",
      ok: ticket.proposed_action !== "refund" || ticket.status === "approved",
      message:
        ticket.proposed_action === "refund"
          ? ticket.status === "approved"
            ? "Refund approved."
            : "Refund needs approval."
          : "No refund.",
    },
  ];
  const hardBlocks = checks.filter((c) => (c.id === "no_unapproved_commitment" || c.id === "refund_policy") && !c.ok);
  const softFixes = checks.filter((c) => (c.id === "grounding" || c.id === "kb_refs_resolve") && !c.ok);
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  let verdict = "ship";
  let summary = "Grounded and within policy.";
  if (hardBlocks.length) {
    verdict = "block";
    summary = hardBlocks.map((c) => c.message).join(" ");
  } else if (softFixes.length) {
    verdict = "fix";
    summary = softFixes.map((c) => c.message).join(" ");
  }
  ticket.quality_gate = { verdict, score, summary, checks };
}

export async function saveReplyAction(ticketId) {
  const text = currentReplyText(ticketId).trim();
  const note = String(state.notes[ticketId] || "").trim();
  if (!text) return;
  if (state.settings?.demo) {
    const ticket = ticketById(ticketId);
    if (ticket) {
      ticket.suggested_reply = text;
      if (note) ticket.reason = note;
      if (ticket.status !== "done") ticket.status = "needs_review";
      ticket.decision = null;
      applyGateDemo(ticket);
    }
    delete state.drafts[ticketId];
    delete state.notes[ticketId];
    flashNotice(`${t("queueReply")} · ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/tickets/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, text, note }),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Save failed: ${res.status}`);
    return;
  }
  delete state.drafts[ticketId];
  delete state.notes[ticketId];
  flashNotice(t("queueReply"));
  await loadState();
}

export async function decideAction(ticketId, action) {
  const comment = String(els.content.querySelector("#decision-comment")?.value || "").trim();
  const text = currentReplyText(ticketId).trim() || undefined;
  if (state.settings?.demo) {
    const ticket = ticketById(ticketId);
    if (!ticket) return;
    if (typeof text === "string" && text) ticket.suggested_reply = text;
    applyGateDemo(ticket);
    if (action === "approve" && ticket.quality_gate?.verdict === "block") {
      flashNotice(ticket.quality_gate.summary);
      render();
      return;
    }
    if (action === "approve") ticket.status = "approved";
    else if (action === "request_changes") ticket.status = "changes_requested";
    else if (action === "block") ticket.status = "blocked";
    ticket.decision = { action, comment, decided_at: new Date().toISOString() };
    delete state.drafts[ticketId];
    flashNotice(t("demoNotice"));
    render();
    return;
  }
  const res = await fetch("/api/tickets/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, action, comment, text }),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Decision failed: ${res.status}`);
    return;
  }
  delete state.drafts[ticketId];
  await loadState();
}

export async function saveSlaAction(ticketId) {
  const raw = String(els.content.querySelector("#sla-due")?.value || "");
  const dueBy = raw ? new Date(raw).toISOString() : "";
  if (state.settings?.demo) {
    const ticket = ticketById(ticketId);
    if (ticket) {
      ticket.sla = ticket.sla || { policy: "custom", due_by: "", breached: false };
      ticket.sla.due_by = dueBy;
      ticket.sla.breached =
        dueBy &&
        ticket.status !== "done" &&
        ticket.status !== "blocked" &&
        !ticket.sla.first_response_at &&
        new Date(dueBy).getTime() < referenceNow();
    }
    delete state.slas[ticketId];
    flashNotice(`${t("saveSla")} · ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/tickets/sla", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, due_by: dueBy }),
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Save failed: ${res.status}`);
    return;
  }
  delete state.slas[ticketId];
  flashNotice(t("saveSla"));
  await loadState();
}

export function toLocalDatetime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
