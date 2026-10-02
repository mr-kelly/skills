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
  gateSummaryText,
  kbById,
  knowledge,
  loadState,
  matchesQuery,
  priorityChip,
  qaPairById,
  qaPairs,
  recordTotal,
  referenceNow,
  render,
  slaCountdown,
  state,
  t,
  ticketById,
  tickets,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";
import { runQualityGate } from "./support-model.js?v=0.1.0";
/* ----- knowledge ----- */

export function renderKnowledge() {
  els.title.textContent = t("knowledgeBase");
  const list = knowledge().filter((article) =>
    matchesQuery([article.title, article.body, article.category, ...(article.tags || [])]),
  );
  els.subtitle.textContent = `${recordTotal("knowledge-base", list.length)} ${t("knowledgeBase")}`;
  const importPanel = state.settings?.demo
    ? ""
    : `
      <div class="row knowledge-actions">
        <button type="button" class="btn primary" data-action="toggle-material-import">${t("importMaterial")}</button>
      </div>
      ${
        state.materialImportOpen
          ? `<section class="overview-panel material-import-panel">
              <div class="settings-form-grid">
                <label><span>${t("materialTitle")}</span><input id="material-title" type="text"></label>
                <label><span>${t("sourceMaterial")}</span><input id="material-url" type="url" placeholder="https://"></label>
                <label><span>${t("materialPublishedAt")}</span><input id="material-published-at" type="text" placeholder="YYYY-MM-DD"></label>
                <label><span>${t("category")}</span><input id="material-category" type="text" value="service-script"></label>
                <label class="settings-span-2"><span>${t("materialBody")}</span><textarea id="material-body" rows="7"></textarea></label>
                <label class="settings-span-2"><span>${t("materialQaJson")}</span><textarea id="material-qa" rows="10" placeholder='[{"question":"...","answer":"..."}]'></textarea></label>
              </div>
              <div class="row"><button type="button" class="btn primary" data-action="import-material">${t("importAsDraft")}</button></div>
            </section>`
          : ""
      }
    `;
  const grid = list.length
    ? `<div class="kb-grid">
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
    </div>`
    : `<div class="empty">${t("empty")}</div>`;
  els.content.innerHTML = `${importPanel}${grid}`;
}

function stableMaterialId(value) {
  const source = String(value || "").trim();
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `kb-material-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function importMaterialAction() {
  const title = document.querySelector("#material-title")?.value.trim() || "";
  const sourceUrl = document.querySelector("#material-url")?.value.trim() || "";
  const publishedAt = document.querySelector("#material-published-at")?.value.trim() || "";
  const category = document.querySelector("#material-category")?.value.trim() || "service-script";
  const body = document.querySelector("#material-body")?.value.trim() || "";
  const qaSource = document.querySelector("#material-qa")?.value.trim() || "";
  if (!title || !body || !qaSource) {
    flashNotice(t("materialRequired"));
    return;
  }
  let pairs;
  try {
    pairs = JSON.parse(qaSource);
  } catch {
    flashNotice(t("materialQaInvalid"));
    return;
  }
  if (!Array.isArray(pairs) || !pairs.length || pairs.some((pair) => !pair.question?.trim() || !pair.answer?.trim())) {
    flashNotice(t("materialQaInvalid"));
    return;
  }
  const articleId = stableMaterialId(sourceUrl || title);
  const now = new Date().toISOString();
  const provider = await getProvider();
  try {
    await provider.importKnowledgeBundle({
      article: {
        article_id: articleId,
        kind: "article",
        title,
        body,
        tags: ["training-source", category],
        category,
        source_url: sourceUrl,
        source_published_at: publishedAt,
        source_fetched_at: now,
        content_hash: await sha256(JSON.stringify({ title, sourceUrl, body })),
        updated_at: now,
      },
      qa_pairs: pairs.map((pair, index) => ({
        pair_id: `${articleId}-qa-${String(index + 1).padStart(2, "0")}`,
        article_id: articleId,
        question: pair.question.trim(),
        answer: pair.answer.trim(),
        category: pair.category?.trim() || category,
        tags: Array.isArray(pair.tags) ? pair.tags : [],
        status: "draft",
        reviewed_by: "",
        updated_at: now,
      })),
    });
  } catch (error) {
    flashNotice(error.message || t("materialImportFailed"));
    return;
  }
  state.materialImportOpen = false;
  await loadState();
  location.hash = "#/qa-pairs";
  flashNotice(t("materialImported").replace("{n}", String(pairs.length)));
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
          ${
            article.source_url
              ? `<p class="kb-provenance"><strong>${t("sourceMaterial")}:</strong> <a class="text-link" href="${escapeHtml(article.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(article.source_url)}</a>${article.source_published_at ? ` · ${escapeHtml(article.source_published_at.slice(0, 10))}` : ""}</p>`
              : ""
          }
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

/* ----- qa pairs ----- */

const QA_STATUS_CLASS = { draft: "warning", approved: "positive", rejected: "" };

function qaStatusBadge(status) {
  return `<span class="badge ${QA_STATUS_CLASS[status] || ""}">${t(`qaStatus_${status}`)}</span>`;
}

export function renderQaPairs() {
  els.title.textContent = t("qaPairs");
  const list = qaPairs().filter((pair) => matchesQuery([pair.question, pair.answer, pair.category, pair.article_id]));
  const draftCount = qaPairs().filter((pair) => pair.status === "draft").length;
  els.subtitle.textContent = draftCount
    ? t("qaPairsSubtitleDraft").replace("{n}", draftCount)
    : t("qaPairsSubtitleClear");
  const practiceActions = state.settings?.demo
    ? ""
    : [...new Set(list.map((pair) => pair.article_id))]
        .map((articleId) => {
          const article = kbById(articleId);
          if (!article) return "";
          return `<button type="button" class="btn" data-action="create-practice-tickets" data-article="${escapeHtml(articleId)}">${t("createPracticeTickets")} · ${escapeHtml(article.title)}</button>`;
        })
        .join("");
  els.content.innerHTML = list.length
    ? `
    ${practiceActions ? `<div class="row qa-practice-actions">${practiceActions}</div>` : ""}
    <div class="qa-list">
      ${list
        .map((pair) => {
          const article = kbById(pair.article_id);
          return `
        <div class="qa-card" data-qa-id="${escapeHtml(pair.pair_id)}">
          <div class="row between">
            ${qaStatusBadge(pair.status)}
            ${article ? `<a class="qa-source" href="#/knowledge/${encodeURIComponent(article.article_id)}">${escapeHtml(article.title)}</a>` : `<span class="muted">${escapeHtml(pair.article_id)}</span>`}
          </div>
          <p class="qa-question"><strong>${t("qaQuestion")}:</strong> ${escapeHtml(pair.question)}</p>
          <p class="qa-answer"><strong>${t("qaAnswer")}:</strong> ${escapeHtml(pair.answer)}</p>
          ${
            pair.status === "draft"
              ? `
            <div class="row">
              <button type="button" class="btn primary" data-action="qa-decide" data-pair="${escapeHtml(pair.pair_id)}" data-decision="approved">${t("qaApprove")}</button>
              <button type="button" class="btn" data-action="qa-decide" data-pair="${escapeHtml(pair.pair_id)}" data-decision="rejected">${t("qaReject")}</button>
            </div>`
              : `<p class="muted qa-reviewed">${t("qaReviewedBy").replace("{name}", escapeHtml(pair.reviewed_by || "—"))}</p>`
          }
        </div>
      `;
        })
        .join("")}
    </div>
    <div class="boundary-note qa-training-note">${t("qaTrainingHandoff")}</div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

export async function createPracticeTicketsAction(articleId) {
  const article = kbById(articleId);
  const pairs = qaPairs().filter((pair) => pair.article_id === articleId);
  if (!article || !pairs.length) {
    flashNotice(t("practiceTicketsUnavailable"));
    return;
  }
  try {
    const provider = await getProvider();
    const result = await provider.createPracticeTicketsFromQa({ article, qa_pairs: pairs });
    await loadState();
    location.hash = "#/tickets/needs_review";
    flashNotice(t("practiceTicketsCreated").replace("{n}", String(result.ticket_count)));
  } catch (error) {
    flashNotice(error.message || t("practiceTicketsFailed"));
  }
}

export async function qaPairDecision(pairId, status) {
  if (state.settings?.demo) {
    const pair = qaPairById(pairId);
    if (!pair) return;
    pair.status = status;
    pair.reviewed_by = "you (demo)";
    flashNotice(t("demoNotice"));
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.reviewQaPair({ pair_id: pairId, status });
  } catch (error) {
    flashNotice(error.message || "Review failed");
    return;
  }
  await loadState();
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
  const sla = summary.sla_policy || {};
  const hours = sla.first_response_hours || {};
  const style = summary.reply_style || {};
  const checked = (value) => (value === false ? "" : "checked");
  els.content.innerHTML = `
    <div class="settings">
      <section class="settings-editor">
        <div class="row between settings-editor-head">
          <div>
            <h2>${t("supportPolicies")}</h2>
            <p class="muted">${state.settings?.onboarding?.settings_completed ? t("settingsReady") : t("settingsRequired")}</p>
          </div>
          <span class="badge ${state.settings?.onboarding?.settings_completed ? "positive" : "warning"}">${state.settings?.onboarding?.settings_completed ? t("completed") : t("incomplete")}</span>
        </div>
        <div class="settings-form-grid">
          ${["urgent", "high", "normal", "low"]
            .map(
              (priority) =>
                `<label><span>${escapeHtml(enumLabel(priority, "severity"))} · ${t("firstResponseTarget")}</span><input data-settings-field="sla-${priority}" type="number" min="0.25" step="0.25" value="${escapeHtml(hours[priority] ?? { urgent: 2, high: 4, normal: 8, low: 24 }[priority])}"></label>`,
            )
            .join("")}
          <label class="settings-span-2"><span>${t("businessHours")}</span><input data-settings-field="business-hours" type="text" value="${escapeHtml(sla.business_hours || "24/7")}"></label>
          <label><span>${t("maxAutoRefund")}</span><input data-settings-field="max-auto-refund" type="number" min="0" step="0.01" value="${escapeHtml(risk.max_auto_refund ?? 0)}"></label>
          <label class="settings-span-2"><span>${t("replyTone")}</span><input data-settings-field="tone" type="text" value="${escapeHtml(style.tone || "professional, concise, direct, solution-focused")}"></label>
          <label><span>${t("languagePolicy")}</span><select data-settings-field="language"><option value="follow_customer" ${style.language === "follow_customer" || !style.language ? "selected" : ""}>${t("followCustomer")}</option><option value="zh-CN" ${style.language === "zh-CN" ? "selected" : ""}>简体中文</option><option value="en" ${style.language === "en" ? "selected" : ""}>English</option></select></label>
          <label><span>${t("replySignature")}</span><input data-settings-field="signature" type="text" value="${escapeHtml(style.signature || "Support")}"></label>
          <label class="settings-span-2"><span>${t("knowledgeSource")}</span><input data-settings-field="kb-source" type="text" value="${escapeHtml(summary.knowledge_base?.source_path || "")}" placeholder="https://docs.example.com"></label>
        </div>
        <div class="settings-toggles">
          <label><input data-settings-field="refund-approval" type="checkbox" ${checked(risk.refund_requires_approval)}> ${t("refundApproval")}</label>
          <label><input data-settings-field="block-ungrounded" type="checkbox" ${checked(risk.block_ungrounded_replies)}> ${t("blockUngrounded")}</label>
          <label><input data-settings-field="block-commitments" type="checkbox" ${checked(risk.block_commitments_without_approval)}> ${t("blockCommitments")}</label>
        </div>
        <div class="row settings-save-row">
          <button type="button" class="primary" data-action="save-settings">${t("saveSettings")}</button>
          <span class="muted">${t("settingsReviewNote")}</span>
        </div>
      </section>
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

export async function saveSettingsAction() {
  const value = (name) => String(els.content.querySelector(`[data-settings-field="${name}"]`)?.value || "").trim();
  const number = (name) => Number(value(name));
  const checked = (name) => Boolean(els.content.querySelector(`[data-settings-field="${name}"]`)?.checked);
  const payload = {
    onboarding_status: "complete",
    onboarding_version: 1,
    sla_policy: {
      first_response_hours: {
        urgent: number("sla-urgent"),
        high: number("sla-high"),
        normal: number("sla-normal"),
        low: number("sla-low"),
      },
      business_hours: value("business-hours"),
    },
    risk_policy: {
      refund_requires_approval: checked("refund-approval"),
      max_auto_refund: number("max-auto-refund"),
      block_ungrounded_replies: checked("block-ungrounded"),
      block_commitments_without_approval: checked("block-commitments"),
    },
    reply_style: {
      tone: value("tone"),
      language: value("language"),
      signature: value("signature"),
      avoid: state.settings?.config_summary?.reply_style?.avoid || [],
    },
    kb_source_path: value("kb-source"),
  };
  if (state.settings?.demo) {
    state.settings.config_summary = { ...state.settings.config_summary, ...payload };
    state.settings.onboarding.settings_completed = true;
    state.settings.onboarding.completed = true;
    flashNotice(`${t("saveSettings")} · ${t("demoNotice")}`);
    render();
    return;
  }
  try {
    const provider = await getProvider();
    const result = await provider.saveSettings(payload);
    flashNotice(
      result.change_request_id ? `${t("settingsPendingReview")}: ${result.change_request_id}` : t("settingsSaved"),
    );
    await loadState();
  } catch (error) {
    flashNotice(error.message || "Settings save failed");
  }
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
  // The real support-qa gate — demo edits reflect verdicts live using the
  // exact same function the Busabase provider runs, not a mirror of it.
  const risk = state.settings?.config_summary?.risk_policy || {};
  ticket.quality_gate = runQualityGate(ticket, knowledge(), risk);
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
  try {
    const provider = await getProvider();
    await provider.saveReply({ ticket_id: ticketId, text, note });
  } catch (error) {
    flashNotice(error.message || "Save failed");
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
      flashNotice(gateSummaryText(ticket.quality_gate));
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
  try {
    const provider = await getProvider();
    await provider.decideApproval({ ticket_id: ticketId, action, comment, text });
  } catch (error) {
    flashNotice(error.message || "Decision failed");
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
  try {
    const provider = await getProvider();
    await provider.saveSla({ ticket_id: ticketId, due_by: dueBy });
  } catch (error) {
    flashNotice(error.message || "Save failed");
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
