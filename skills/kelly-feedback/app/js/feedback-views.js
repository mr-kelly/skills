import {
  channelBadge,
  date,
  decisions,
  els,
  enumLabel,
  escapeHtml,
  feedbackItems,
  feedbackTable,
  filteredFeedback,
  lockBanner,
  preview,
  productName,
  proposals,
  render,
  requestLink,
  requests,
  sentimentBadge,
  state,
  statusBadge,
  t,
  trendArrow,
  triageBadge,
} from "../app.js";
export function renderInbox() {
  els.title.textContent = t("inbox");
  const items = filteredFeedback();
  els.subtitle.textContent = `${items.length} ${t("items")} · ${items.filter((item) => item.triage === "new").length} ${t("newUncategorized")}`;
  els.content.innerHTML = `${lockBanner()}${feedbackTable(items)}`;
}

export function renderInboxDetail() {
  const item = feedbackItems().find((entry) => entry.feedback_id === state.route.id);
  if (!item) {
    renderInbox();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  els.title.textContent = item.user?.handle || item.feedback_id;
  els.subtitle.textContent = `${enumLabel(item.channel, "channel")} · ${productName(item.product)} · ${date(item.received_at)}`;
  const assignValue = state.edits.assign[item.feedback_id] || item.request_id || "";
  els.content.innerHTML = `
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/inbox">← ${t("inbox")}</a>
        <div class="panel">
          <h2>${t("fullText")}</h2>
          <blockquote class="feedback-text">${escapeHtml(item.text)}</blockquote>
          ${item.agent_note ? `<p class="agent-note"><strong>${t("agentNote")}</strong> ${escapeHtml(item.agent_note)}</p>` : ""}
        </div>
        <div class="panel triage-panel">
          <h2>${t("triage")}</h2>
          <div class="triage-actions">
            <select id="assignSelect" ${locked ? "disabled" : ""}>
              <option value="">${escapeHtml(t("noRequest"))}</option>
              ${requests()
                .map(
                  (request) =>
                    `<option value="${escapeHtml(request.request_id)}" ${request.request_id === assignValue ? "selected" : ""}>${escapeHtml(request.title)}</option>`,
                )
                .join("")}
            </select>
            <button type="button" data-action="assign" ${locked ? "disabled" : ""}>${t("assignToRequest")}</button>
            <button type="button" data-action="ignore" ${locked ? "disabled" : ""}>${t("ignore")}</button>
            <button type="button" data-action="insight" ${locked ? "disabled" : ""}>${t("markInsight")}</button>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("userContext")}</h2>
        <dl>
          <dt>${t("user")}</dt><dd>${escapeHtml(item.user?.handle || "")}</dd>
          <dt>${t("plan")}</dt><dd>${escapeHtml(item.user?.plan || "")}</dd>
          <dt>${t("tenure")}</dt><dd>${item.user?.tenure_months ?? 0} ${t("months")}</dd>
          <dt>${t("weight")}</dt><dd>${item.user?.weight ?? 1}</dd>
          <dt>${t("channel")}</dt><dd>${channelBadge(item.channel)}</dd>
          <dt>${t("source")}</dt><dd>${escapeHtml(item.source_id)}</dd>
          <dt>${t("sentiment")}</dt><dd>${sentimentBadge(item.sentiment)}</dd>
          <dt>${t("triage")}</dt><dd>${triageBadge(item.triage)}</dd>
          <dt>${t("clusterLink")}</dt><dd>${requestLink(item.request_id)}</dd>
          <dt>${t("permalink")}</dt><dd>${item.permalink ? `<a href="${escapeHtml(item.permalink)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.permalink)}</a>` : t("notAvailable")}</dd>
        </dl>
      </aside>
    </section>
  `;
  const select = els.content.querySelector("#assignSelect");
  select?.addEventListener("change", () => {
    state.edits.assign[item.feedback_id] = select.value;
  });
  els.content.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      submitDecision({
        kind: "feedback",
        id: item.feedback_id,
        action,
        request_id: action === "assign" ? (state.edits.assign[item.feedback_id] ?? item.request_id ?? "") : "",
      });
    });
  });
}

// ---------- Requests ----------

function filteredRequests() {
  const query = state.query.trim().toLowerCase();
  if (!query) return requests();
  return requests().filter((request) =>
    [request.title, request.product, request.status, request.problem_statement]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function renderRequests() {
  els.title.textContent = t("requests");
  const items = filteredRequests();
  els.subtitle.textContent = `${items.length} ${t("requests").toLowerCase()} · ${items.filter((item) => item.status === "needs_info").length} ${t("needsInfo")}`;
  const sorted = [...items].sort((a, b) => b.weighted_score - a.weighted_score);
  els.content.innerHTML = `
    ${lockBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("requests")}</th><th>${t("product")}</th><th class="num">${t("frequency")}</th><th class="num">${t("weightedScore")}</th><th>${t("trend")}</th><th>${t("status")}</th><th class="num">${t("linked")}</th><th>${t("updated")}</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((request) => {
              const linked = feedbackItems().filter((item) => item.request_id === request.request_id).length;
              return `
              <tr>
                <td><a href="#/requests/${encodeURIComponent(request.request_id)}"><strong>${escapeHtml(request.title)}</strong></a><div class="muted">${escapeHtml(preview(request.problem_statement, 90))}</div></td>
                <td><span class="badge">${escapeHtml(productName(request.product))}</span></td>
                <td class="num">${request.frequency}</td>
                <td class="num strong">${request.weighted_score}</td>
                <td>${trendArrow(request.trend)}</td>
                <td>${statusBadge(request.status)}</td>
                <td class="num">${linked}</td>
                <td class="nowrap">${date(request.updated_at)}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderRequestDetail() {
  const request = requests().find((item) => item.request_id === state.route.id);
  if (!request) {
    renderRequests();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  const linked = feedbackItems().filter((item) => item.request_id === request.request_id);
  const quoteItems = (request.representative_feedback_ids || [])
    .map((id) => feedbackItems().find((item) => item.feedback_id === id))
    .filter(Boolean);
  const effortDecision = decisions().requests?.[request.request_id]?.effort_estimate;
  const effortValue = state.edits.effort[request.request_id] ?? effortDecision ?? request.effort_estimate ?? "";
  els.title.textContent = request.title;
  els.subtitle.textContent = `${productName(request.product)} · ${enumLabel(request.status)} · ${request.frequency} × ${t("weight").toLowerCase()} = ${request.weighted_score}`;
  els.content.innerHTML = `
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/requests">← ${t("requests")}</a>
        <div class="panel">
          <h2>${t("problemStatement")}</h2>
          <p>${escapeHtml(request.problem_statement || "")}</p>
          <h2>${t("specSummary")}</h2>
          <p>${escapeHtml(request.spec_summary || "")}</p>
        </div>
        ${
          quoteItems.length
            ? `
          <div class="panel">
            <h2>${t("quotes")}</h2>
            ${quoteItems
              .map(
                (item) => `
              <blockquote class="quote">
                <p>${escapeHtml(item.text)}</p>
                <footer>${escapeHtml(item.user?.handle || "")} · ${channelBadge(item.channel)} · ${date(item.received_at)}</footer>
              </blockquote>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        <div class="panel">
          <h2>${t("allLinkedFeedback")} (${linked.length})</h2>
          ${feedbackTable(linked)}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("requests")}</h2>
        <dl>
          <dt>${t("product")}</dt><dd>${escapeHtml(productName(request.product))}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(request.status)}</dd>
          <dt>${t("frequency")}</dt><dd>${request.frequency}</dd>
          <dt>${t("weightedScore")}</dt><dd>${request.weighted_score}</dd>
          <dt>${t("trend")}</dt><dd>${trendArrow(request.trend)}</dd>
          <dt>${t("created")}</dt><dd>${date(request.created_at)}</dd>
          <dt>${t("updated")}</dt><dd>${date(request.updated_at)}</dd>
        </dl>
        <div class="effort-field">
          <label for="effortInput">${t("effortEstimate")}</label>
          <input id="effortInput" type="text" value="${escapeHtml(effortValue)}" ${locked ? "disabled" : ""}>
          <button type="button" id="effortSave" ${locked ? "disabled" : ""}>${t("save")}</button>
        </div>
        <h2>${t("decisionHistory")}</h2>
        <div class="history">
          ${
            (request.decision_history || [])
              .map(
                (entry) => `
            <div class="history-row">
              <strong>${escapeHtml(enumLabel(entry.action, "action"))}</strong>
              <span>${escapeHtml(entry.actor || "")} · ${date(entry.at)}</span>
              ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
            </div>
          `,
              )
              .join("") || `<div class="muted">${t("notAvailable")}</div>`
          }
        </div>
      </aside>
    </section>
  `;
  const effortInput = els.content.querySelector("#effortInput");
  effortInput?.addEventListener("input", () => {
    state.edits.effort[request.request_id] = effortInput.value;
  });
  els.content.querySelector("#effortSave")?.addEventListener("click", () => {
    submitDecision({
      kind: "request",
      id: request.request_id,
      effort_estimate: state.edits.effort[request.request_id] ?? effortValue,
    });
  });
}

// ---------- Roadmap ----------

export function renderRoadmap() {
  const items = proposals();
  const waiting = items.filter((item) => item.status === "needs_review").length;
  els.title.textContent = t("roadmap");
  els.subtitle.textContent = `${items.length} ${t("proposal").toLowerCase()} · ${waiting} ${t("decisionsWaiting")}`;
  const roadmap = state.snapshot?.roadmap || { now: [], next: [], later: [] };
  els.content.innerHTML = `
    ${lockBanner()}
    <section class="proposal-list">
      <h2 class="section-title">${t("decisionQueue")}</h2>
      ${items.map((proposal) => proposalCard(proposal)).join("") || `<div class="empty">${t("empty")}</div>`}
    </section>
    <section class="roadmap-board">
      <h2 class="section-title">${t("currentRoadmap")}</h2>
      <div class="roadmap-columns">
        ${["now", "next", "later"]
          .map(
            (laneKey) => `
          <div class="roadmap-column">
            <h3>${escapeHtml(enumLabel(laneKey, "lane"))}</h3>
            ${
              (roadmap[laneKey] || [])
                .map(
                  (item) => `
              <div class="roadmap-card">
                <strong>${escapeHtml(item.title)}</strong>
                ${item.note ? `<p class="muted">${escapeHtml(item.note)}</p>` : ""}
                ${item.request_id ? `<div>${requestLink(item.request_id)}</div>` : ""}
              </div>
            `,
                )
                .join("") || `<div class="muted roadmap-empty">${t("notAvailable")}</div>`
            }
          </div>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
  bindProposalCards();
}

function proposalCard(proposal) {
  const locked = Boolean(state.settings?.lock);
  const decided = ["approved", "done", "blocked"].includes(proposal.status);
  const draftValue = state.edits.draft[proposal.proposal_id] ?? proposal.draft ?? "";
  const noteValue = state.edits.note[proposal.proposal_id] ?? proposal.review_note ?? "";
  const showDraft = Boolean(proposal.draft || proposal.draft_kind);
  return `
    <article class="proposal-card" data-proposal="${escapeHtml(proposal.proposal_id)}">
      <header class="proposal-header">
        <span class="proposal-ref">${t("proposal")} #${proposal.ref}</span>
        <span class="badge">${escapeHtml(enumLabel(proposal.type, "type"))}</span>
        ${proposal.target_lane ? `<span class="badge">${t("targetLane")}: ${escapeHtml(enumLabel(proposal.target_lane, "lane"))}</span>` : ""}
        ${statusBadge(proposal.status)}
      </header>
      <h3>${escapeHtml(proposal.title)}</h3>
      <p class="proposal-reason"><strong>${t("reason")}</strong> ${escapeHtml(proposal.reason)}</p>
      ${proposal.evidence ? `<p class="proposal-evidence"><strong>${t("evidence")}</strong> ${escapeHtml(proposal.evidence)}</p>` : ""}
      ${proposal.request_id ? `<p class="proposal-request">${requestLink(proposal.request_id)}${(proposal.request_ids || []).length > 1 ? ` + ${proposal.request_ids.length - 1}` : ""}</p>` : ""}
      ${
        showDraft
          ? `
        <label class="field-label">${t("draft")}${proposal.draft_kind ? ` · ${escapeHtml(proposal.draft_kind.replaceAll("_", " "))}` : ""}</label>
        <textarea class="proposal-draft" data-field="draft" rows="4" ${locked || decided ? "disabled" : ""}>${escapeHtml(draftValue)}</textarea>
      `
          : ""
      }
      <label class="field-label">${t("reviewNote")}</label>
      <textarea class="proposal-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${locked ? "disabled" : ""}>${escapeHtml(noteValue)}</textarea>
      <footer class="proposal-actions">
        <button type="button" data-verdict="approve" class="primary" ${locked || decided ? "disabled" : ""}>${t("approve")}</button>
        <button type="button" data-verdict="request_changes" ${locked || proposal.status === "done" ? "disabled" : ""}>${t("requestChanges")}</button>
        <button type="button" data-verdict="block" ${locked || decided ? "disabled" : ""}>${t("block")}</button>
        ${proposal.decided_at ? `<span class="muted decided-at">${t("decided")} ${date(proposal.decided_at)}</span>` : ""}
      </footer>
    </article>
  `;
}

function bindProposalCards() {
  els.content.querySelectorAll(".proposal-card").forEach((card) => {
    const proposalId = card.dataset.proposal;
    card.querySelectorAll("textarea[data-field]").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        state.edits[textarea.dataset.field === "draft" ? "draft" : "note"][proposalId] = textarea.value;
      });
    });
    card.querySelectorAll("button[data-verdict]").forEach((button) => {
      button.addEventListener("click", () => {
        submitDecision({
          kind: "proposal",
          id: proposalId,
          action: button.dataset.verdict,
          review_note: state.edits.note[proposalId] ?? "",
          draft: state.edits.draft[proposalId],
        });
      });
    });
  });
}

// ---------- Settings ----------

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const scoring = summary.scoring || {};
  const planWeights = Object.entries(scoring.plan_weights || {});
  const syncLog = [...(state.snapshot?.sync_log || [])].reverse().slice(0, 8);
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("roadmapLanes")}</dt><dd>${(summary.roadmap_lanes || []).map((laneKey) => escapeHtml(enumLabel(laneKey, "lane"))).join(" · ")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("products")}</h2>
        ${
          (summary.products || [])
            .map(
              (product) => `
          <div class="settings-row">
            <strong>${escapeHtml(product.display_name)}</strong>
            <span>${escapeHtml(product.product_id)}</span>
            <span class="muted">${escapeHtml(product.tagline || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("sources")}</h2>
        ${
          (summary.sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${channelBadge(source.channel)} ${escapeHtml(source.collection || "")}</span>
            <span class="${source.secrets_ready ? "positive" : "negative"}">${source.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("scoringWeights")}</h2>
        <dl>
          ${planWeights.map(([plan, weight]) => `<dt>${t("planWeights")} · ${escapeHtml(plan)}</dt><dd>${escapeHtml(String(weight))}</dd>`).join("")}
          <dt>${t("defaultWeight")}</dt><dd>${escapeHtml(String(scoring.default_weight ?? 1))}</dd>
          <dt>${t("recencyHalfLife")}</dt><dd>${escapeHtml(String(scoring.recency_half_life_days ?? 30))}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${
          syncLog
            .map(
              (entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(enumLabel(entry.action, "action"))}</strong>
            <span class="muted">${date(entry.at)}</span>
            <span>${escapeHtml(entry.detail || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </section>
    </div>
  `;
}

// ---------- Decisions ----------

async function submitDecision(payload) {
  if (state.settings?.lock) {
    toast(t("lockActive"));
    return;
  }
  if (state.settings?.demo) {
    applyDecisionLocally(payload);
    render();
    toast(t("demoNotPersisted"));
    return;
  }
  try {
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    const body = await res.json();
    if (state.settings) state.settings.decisions = body.decisions;
    render();
    toast(t("decisionSaved"));
  } catch (error) {
    toast(error.message);
  }
}

function applyDecisionLocally(payload) {
  const now = new Date().toISOString();
  const store = state.settings.decisions || (state.settings.decisions = { proposals: {}, feedback: {}, requests: {} });
  if (payload.kind === "proposal") {
    store.proposals[payload.id] = {
      action: payload.action,
      review_note: payload.review_note || "",
      draft: payload.draft,
      decided_at: now,
    };
  } else if (payload.kind === "feedback") {
    store.feedback[payload.id] = { action: payload.action, request_id: payload.request_id || "", decided_at: now };
  } else if (payload.kind === "request") {
    store.requests[payload.id] = { effort_estimate: payload.effort_estimate || "", decided_at: now };
  }
}

let toastTimer = null;
function toast(message) {
  let node = document.querySelector("#toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "toast";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 2600);
}
