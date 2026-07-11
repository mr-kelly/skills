import {
  briefById,
  date,
  dateTime,
  deltaArrow,
  demoBanner,
  els,
  enumLabel,
  escapeHtml,
  isLocked,
  kindBadge,
  loadState,
  lockBanner,
  render,
  reportById,
  research,
  signals,
  sparkline,
  state,
  statusBadge,
  t,
  trends,
} from "../app.js";
/* ---------- Research ---------- */

export function renderResearch() {
  els.title.textContent = t("research");
  const questions = research().questions;
  const query = state.query.trim().toLowerCase();
  const items = questions.filter(
    (item) =>
      !query ||
      [item.question, item.status, item.depth]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
  );
  els.subtitle.textContent = `${items.length} ${t("questions").toLowerCase()}`;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>${t("question")}</th><th>${t("status")}</th><th>${t("depth")}</th><th>${t("askedAt")}</th><th>${t("costNote")}</th></tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td><a href="#/research/${encodeURIComponent(item.question_id)}"><span class="strong">${escapeHtml(item.question)}</span></a></td>
              <td>${statusBadge(item.status)}</td>
              <td>${escapeHtml(enumLabel(item.depth, "depth"))}</td>
              <td class="muted">${date(item.asked_at)}</td>
              <td class="muted">${escapeHtml(item.cost_note || "")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${items.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function briefStagePanel(question, brief) {
  const disabled = isLocked() || state.saving ? "disabled" : "";
  return `
    <div class="panel">
      <div class="detail-head">
        <h2>${t("briefFor")}</h2>
        ${statusBadge(brief.status)}
        <span class="muted">${escapeHtml(enumLabel(brief.depth, "depth"))} · ${dateTime(brief.drafted_at)}</span>
      </div>
      <h3>${t("scope")}</h3>
      <p>${escapeHtml(brief.scope)}</p>
      <h3>${t("plannedSources")}</h3>
      <ul>${(brief.planned_sources || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      <h3>${t("expectedDeliverable")}</h3>
      <p>${escapeHtml(brief.expected_deliverable || "")}</p>
      ${brief.notes ? `<p class="muted">${escapeHtml(brief.notes)}</p>` : ""}
    </div>
    <div class="panel">
      <h2>${t("triage")}</h2>
      <div class="action-row">
        <button type="button" class="action primary" data-action="approve" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("approveBrief")}</button>
        <button type="button" class="action" data-action="request_changes" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="action" data-action="block" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("block")}</button>
      </div>
      <label class="note-label" for="review-note">${t("reviewNote")}</label>
      <textarea id="review-note" class="review-note" placeholder="${t("reviewNote")}">${escapeHtml(brief.triage?.comment || "")}</textarea>
      <div id="decision-feedback" class="muted decision-feedback"></div>
    </div>
  `;
}

function reportStagePanel(question, report) {
  const disabled = isLocked() || state.saving ? "disabled" : "";
  const sourceIndex = new Map((report.sources || []).map((source, index) => [source.source_id, index + 1]));
  const confidence = Number(report.confidence || 0);
  return `
    <div class="panel">
      <div class="detail-head">
        <h2>${t("reportFor")}</h2>
        <span class="muted">${t("filedAt")} ${dateTime(report.filed_at)}</span>
      </div>
      <h3 class="report-title">${escapeHtml(report.title)}</h3>
      <p>${escapeHtml(report.summary)}</p>
      ${(report.sections || [])
        .map(
          (section) => `
        <section class="report-section">
          <h3>${escapeHtml(section.heading)}</h3>
          <p>${escapeHtml(section.body)}</p>
          <div class="citation-chips">
            ${(section.source_ids || [])
              .map((sourceId) => {
                const index = sourceIndex.get(sourceId);
                const source = (report.sources || []).find((entry) => entry.source_id === sourceId);
                return source
                  ? `<a class="citation-chip" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(source.title)}">[${index}] ${escapeHtml(source.title)}</a>`
                  : "";
              })
              .join("")}
          </div>
          ${(report.annotations || [])
            .filter((annotation) => annotation.section_id === section.section_id)
            .map(
              (annotation) => `
            <div class="annotation"><strong>${escapeHtml(annotation.author)}</strong> · ${dateTime(annotation.at)}<p>${escapeHtml(annotation.text)}</p></div>
          `,
            )
            .join("")}
        </section>
      `,
        )
        .join("")}
      <h3>${t("sources")}</h3>
      <ol class="source-list">
        ${(report.sources || []).map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.title)}</a></li>`).join("")}
      </ol>
    </div>
    <div class="panel">
      <h2>${t("rateConfidence")}</h2>
      <div class="action-row confidence-row">
        ${[1, 2, 3, 4, 5]
          .map(
            (value) => `
          <button type="button" class="action confidence ${confidence >= value ? "filled" : ""}" data-action="approve" data-kind="report" data-id="${escapeHtml(report.report_id)}" data-confidence="${value}" ${disabled} title="${t("confidence")} ${value}/5">${value}</button>
        `,
          )
          .join("")}
        <span class="muted">${t("confidence")}: ${confidence || "—"}/5</span>
      </div>
      <label class="note-label" for="followup-input">${t("followups")}</label>
      <textarea id="followup-input" class="review-note" placeholder="${t("followUpPlaceholder")}"></textarea>
      <div class="action-row">
        <button type="button" class="action primary" id="file-followup" data-question="${escapeHtml(question.question_id)}" ${disabled}>${t("askFollowup")}</button>
      </div>
      ${(question.followups || [])
        .map(
          (fu) => `
        <div class="followup-row"><span>${escapeHtml(fu.question)}</span>${statusBadge(fu.status)}</div>
      `,
        )
        .join("")}
      <div id="decision-feedback" class="muted decision-feedback"></div>
    </div>
  `;
}

export function renderResearchDetail() {
  const question = research().questions.find((item) => item.question_id === state.route.id);
  if (!question) {
    renderResearch();
    return;
  }
  const brief = briefById(question.brief_id);
  const report = reportById(question.report_id);
  const briefStage = question.status === "brief_needs_review" && brief;
  els.title.textContent = question.question;
  els.subtitle.textContent = `${enumLabel(question.status)} · ${enumLabel(question.depth, "depth")} · ${t("askedAt")} ${date(question.asked_at)}`;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        ${briefStage ? briefStagePanel(question, brief) : ""}
        ${!briefStage && report ? reportStagePanel(question, report) : ""}
        ${!briefStage && !report ? `<div class="panel"><h2>${escapeHtml(enumLabel(question.status))}</h2><p class="muted">${escapeHtml(brief?.scope || "")}</p></div>` : ""}
      </div>
      <aside class="detail-side">
        <h2>${t("question")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${escapeHtml(enumLabel(question.status))}</dd>
          <dt>${t("depth")}</dt><dd>${escapeHtml(enumLabel(question.depth, "depth"))}</dd>
          <dt>${t("askedAt")}</dt><dd>${date(question.asked_at)}</dd>
          <dt>${t("costNote")}</dt><dd>${escapeHtml(question.cost_note || "")}</dd>
          ${question.confidence ? `<dt>${t("confidence")}</dt><dd>${question.confidence}/5</dd>` : ""}
        </dl>
        ${brief && !briefStage ? `<h2>${t("briefFor")}</h2><p class="muted">${escapeHtml(brief.scope)}</p>` : ""}
      </aside>
    </section>
  `;
  bindDecisionButtons();
  bindFollowup();
}

/* ---------- Trends ---------- */

export function renderTrends() {
  els.title.textContent = t("trends");
  const { movers, opportunities } = trends();
  const query = state.query.trim().toLowerCase();
  const items = movers.filter(
    (item) => !query || [item.keyword, item.source].some((value) => String(value).toLowerCase().includes(query)),
  );
  els.subtitle.textContent = `${items.length} ${t("topMovers").toLowerCase()} · ${opportunities.length} ${t("opportunityCards").toLowerCase()}`;
  const opportunityById = new Map(opportunities.map((item) => [item.opportunity_id, item]));
  const disabled = isLocked() || state.saving ? "disabled" : "";
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>${t("keyword")}</th><th>${t("source")}</th><th>${t("volume")}</th><th>${t("delta")}</th><th>${t("momentum")}</th><th>${t("opportunity")}</th></tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const opportunity = opportunityById.get(item.opportunity_id);
              return `
              <tr>
                <td><span class="strong">${escapeHtml(item.keyword)}</span></td>
                <td>${kindBadge(item.source)}</td>
                <td class="num">${Number(item.volume_proxy).toLocaleString()}</td>
                <td>${deltaArrow(item.delta_pct)}</td>
                <td><span class="spark-cell">${sparkline(item.momentum)}</span></td>
                <td>${opportunity ? statusBadge(opportunity.status) : `<span class="muted">${t("noOpportunity")}</span>`}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <h2 class="section-heading">${t("opportunityCards")}</h2>
    <div class="opportunity-grid">
      ${
        opportunities
          .map(
            (item) => `
        <div class="opportunity-card">
          <div class="detail-head">
            ${statusBadge(item.status)}
            <span class="muted">${date(item.created_at)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="muted">${escapeHtml(item.rationale)}</p>
          <div class="handoff-chip">${t("proposedNextStep")}: <strong>${escapeHtml(enumLabel(item.proposed_next_step?.operation, "operation"))}</strong><br>${escapeHtml(item.proposed_next_step?.summary || "")}</div>
          <div class="action-row">
            ${
              item.status === "needs_review"
                ? `
              <button type="button" class="action primary" data-action="approve" data-kind="opportunity" data-id="${escapeHtml(item.opportunity_id)}" ${disabled}>${t("approve")}</button>
              <button type="button" class="action" data-action="ignore" data-kind="opportunity" data-id="${escapeHtml(item.opportunity_id)}" ${disabled}>${t("ignore")}</button>
            `
                : `<span class="muted">${escapeHtml(item.triage?.comment || "")}</span>`
            }
          </div>
        </div>
      `,
          )
          .join("") || `<div class="empty">${t("empty")}</div>`
      }
    </div>
    <div id="decision-feedback" class="muted decision-feedback"></div>
  `;
  bindDecisionButtons();
}

/* ---------- Settings ---------- */

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const defaults = summary.research_defaults || {};
  els.content.innerHTML = `
    ${demoBanner()}
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("cadence")}</dt><dd>${escapeHtml(
            Object.entries(summary.cadence || {})
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ") || "—",
          )}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("products")}</h2>
        ${
          (summary.profile?.products || [])
            .map(
              (product) => `
          <div class="settings-row">
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.positioning)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("watchlist")}</h2>
        ${
          (summary.watchlist || [])
            .map(
              (target) => `
          <div class="settings-row">
            <strong>${escapeHtml(target.name)}</strong>
            <span>${escapeHtml(enumLabel(target.type, "target_type"))} · ${target.source_count} ${t("sources").toLowerCase()}</span>
            <span>${(target.methods || []).map((method) => escapeHtml(enumLabel(method, "method"))).join(", ")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("researchDefaults")}</h2>
        <dl>
          <dt>${t("depth")}</dt><dd>${escapeHtml(enumLabel(defaults.default_depth, "depth"))}</dd>
          <dt>${t("sourcePolicy")}</dt><dd>${escapeHtml(defaults.source_policy || "")}</dd>
          <dt>${t("requireCitations")}</dt><dd>${defaults.require_citations ? "✓" : "✗"}</dd>
          <dt>${t("maxSources")}</dt><dd>${defaults.max_sources || "—"}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("trendSources")}</h2>
        ${
          (summary.trend_sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${kindBadge(source.kind)}</span>
            <span>${escapeHtml(enumLabel(source.method, "method"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("envReadiness")}</h2>
        ${
          (summary.env_readiness || [])
            .map(
              (entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(entry.name)}</strong>
            <span class="${entry.ready ? "positive" : "negative"}">${entry.ready ? t("ready") : t("missing")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">—</div>`
        }
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${(state.snapshot?.sync_log || [])
          .slice(0, 8)
          .map(
            (entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(entry.action)}</strong>
            <span>${escapeHtml(entry.detail)}</span>
            <span class="muted">${dateTime(entry.at)}</span>
          </div>
        `,
          )
          .join("")}
      </section>
    </div>
  `;
}

/* ---------- Decisions ---------- */

export function bindDecisionButtons() {
  els.content.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const note = els.content.querySelector("#review-note")?.value || "";
      submitDecision({
        kind: button.dataset.kind,
        id: button.dataset.id,
        action: button.dataset.action,
        comment: note,
        confidence: button.dataset.confidence ? Number(button.dataset.confidence) : undefined,
      });
    });
  });
}

function bindFollowup() {
  const button = els.content.querySelector("#file-followup");
  if (!button) return;
  button.addEventListener("click", async () => {
    const input = els.content.querySelector("#followup-input");
    const question = input?.value.trim();
    if (!question) return;
    state.saving = true;
    try {
      const res = await fetch("/api/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question_id: button.dataset.question, question, demo: Boolean(state.settings?.demo) }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `Request failed: ${res.status}`);
      if (state.settings?.demo) {
        const target = research().questions.find((item) => item.question_id === button.dataset.question);
        if (target) {
          target.followups = target.followups || [];
          target.followups.push({
            followup_id: `fu-${Date.now()}`,
            question,
            status: "queued",
            asked_at: new Date().toISOString(),
          });
        }
        render();
      } else {
        await loadState();
      }
    } catch (error) {
      showFeedback(error.message);
    } finally {
      state.saving = false;
    }
  });
}

async function submitDecision(payload) {
  if (state.saving) return;
  state.saving = true;
  try {
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, demo: Boolean(state.settings?.demo) }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error || `Request failed: ${res.status}`);
    if (state.settings?.demo) {
      applyLocalDecision(payload);
      render();
    } else {
      await loadState();
    }
  } catch (error) {
    showFeedback(error.message);
  } finally {
    state.saving = false;
  }
}

function statusForAction(action) {
  if (action === "approve") return "approved";
  if (action === "watch") return "needs_review";
  if (action === "ignore") return "done";
  if (action === "block") return "blocked";
  if (action === "request_changes") return "changes_requested";
  return "needs_review";
}

function applyLocalDecision({ kind, id, action, comment, confidence }) {
  const triage = {
    kind,
    action,
    status: statusForAction(action),
    comment: comment || "",
    decided_at: new Date().toISOString(),
  };
  if (kind === "signal") {
    const item = signals().find((signal) => signal.signal_id === id);
    if (item) Object.assign(item, { status: triage.status, triage });
  } else if (kind === "brief") {
    const item = briefById(id);
    if (item) Object.assign(item, { status: triage.status, triage });
    const question = research().questions.find((entry) => entry.brief_id === id);
    if (question && question.status === "brief_needs_review") {
      if (action === "approve") question.status = "researching";
      if (action === "block") question.status = "closed";
    }
  } else if (kind === "opportunity") {
    const item = trends().opportunities.find((entry) => entry.opportunity_id === id);
    if (item) Object.assign(item, { status: triage.status, triage });
  } else if (kind === "report") {
    const item = reportById(id);
    if (item) {
      item.triage = triage;
      if (confidence !== undefined) item.confidence = confidence;
      const question = research().questions.find((entry) => entry.report_id === id);
      if (question) question.confidence = confidence ?? question.confidence;
    }
  }
}

function showFeedback(message) {
  const node = els.content.querySelector("#decision-feedback");
  if (node) node.textContent = message;
}
