import {
  SOURCE_KINDS,
  candidateById,
  compactNumber,
  date,
  dateTime,
  deltaArrow,
  demoBanner,
  els,
  enumLabel,
  escapeHtml,
  filteredCandidates,
  gradeBadge,
  isLocked,
  loadState,
  lockBanner,
  money,
  pct,
  pickRef,
  proposalForCandidate,
  proposals,
  render,
  reviewBars,
  sourceBadge,
  sparkline,
  stageBadge,
  state,
  statusBadge,
  t,
  trendItems,
  verdictBadge,
} from "../app.js";
export function renderCandidates() {
  els.title.textContent = t("candidates");
  const items = filteredCandidates();
  const metrics = state.snapshot?.metrics || {};
  els.subtitle.textContent = `${items.length} ${t("candidates").toLowerCase()} · ${metrics.below_margin_floor || 0} ${t("belowFloor")}`;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("name")}</th><th>${t("category")}</th><th>${t("source")}</th><th>${t("momentum")}</th><th>${t("estPrice")}</th><th>${t("estMargin")}</th><th>${t("grade")}</th><th>${t("stage")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>
                <a href="#/candidates/${encodeURIComponent(item.candidate_id)}"><span class="strong">${escapeHtml(item.name)}</span></a>
                <div class="muted clamp">${escapeHtml(item.why_it_matters || "")}</div>
              </td>
              <td class="muted">${escapeHtml(item.category)}</td>
              <td>${sourceBadge(item.source)}</td>
              <td>${deltaArrow(item.momentum_pct)}</td>
              <td class="num">${money(item.est_price, item.currency)}</td>
              <td class="num ${item.margin_card?.below_floor ? "negative" : "positive"}">${pct(item.margin_card?.margin_pct)}</td>
              <td>${gradeBadge(item.competition_grade)}</td>
              <td>${stageBadge(item.stage)}</td>
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

function marginCardPanel(item) {
  const card = item.margin_card || {};
  const inputRow = (key, label, value, suffix = "") => `
    <div class="mc-row">
      <label for="mc-${key}">${label}${suffix}</label>
      <input id="mc-${key}" class="mc-input" data-mc="${key}" type="number" step="0.01" inputmode="decimal" value="${Number(value || 0)}">
    </div>
  `;
  return `
    <div class="panel">
      <h2>${t("marginCard")}</h2>
      <p class="muted mc-hint">${t("marginCardHint")}</p>
      <div class="margin-card" id="margin-card" data-currency="${escapeHtml(item.currency || "USD")}">
        <div class="mc-inputs">
          ${inputRow("price", t("price"), card.price)}
          ${inputRow("cogs", t("cogs"), card.cogs)}
          ${inputRow("freight", t("freight"), card.freight)}
          ${inputRow("fee", t("platformFee"), card.platform_fee_pct, " %")}
          ${inputRow("ad", t("adCost"), card.ad_cost)}
        </div>
        <div class="mc-results">
          <div class="mc-result"><span>${t("platformFee")}</span><strong id="mc-out-fee">${money(card.platform_fee, item.currency)}</strong></div>
          <div class="mc-result"><span>${t("margin")}</span><strong id="mc-out-margin">${money(card.margin, item.currency)}</strong></div>
          <div class="mc-result"><span>${t("marginPct")}</span><strong id="mc-out-margin-pct" class="${card.below_floor ? "negative" : "positive"}">${pct(card.margin_pct)}</strong></div>
          <div class="mc-result"><span>${t("breakevenAcos")}</span><strong id="mc-out-acos">${pct(card.breakeven_acos_pct)}</strong></div>
        </div>
        <div id="mc-floor-note" class="mc-floor ${card.below_floor ? "" : "hidden"}">${t("belowFloor")}</div>
      </div>
    </div>
  `;
}

function competitionPanel(item) {
  const comp = item.competition || {};
  return `
    <div class="panel">
      <h2>${t("competitionRead")} ${gradeBadge(item.competition_grade)}</h2>
      <h3>${t("topReviewCounts")}</h3>
      ${reviewBars(comp.top_review_counts || [])}
      <div class="comp-facts">
        <div><span class="muted">${t("headShare")}</span><strong>${pct(comp.head_share_pct)}</strong></div>
        <div><span class="muted">${t("newEntrants")}</span><strong>${comp.new_entrants_90d ?? "—"}</strong></div>
      </div>
      <h3>${t("dominance")}</h3>
      <p>${escapeHtml(comp.dominance_note || "")}</p>
      <h3>${t("velocity")}</h3>
      <p>${escapeHtml(comp.velocity_note || "")}</p>
    </div>
  `;
}

function verdictPanel(item) {
  const disabled = isLocked() || state.saving ? "disabled" : "";
  return `
    <div class="panel">
      <h2>${t("verdict")}</h2>
      <p class="muted">${t("verdictHint")}</p>
      <div class="action-row">
        <button type="button" class="action primary" data-action="develop" data-kind="candidate" data-id="${escapeHtml(item.candidate_id)}" ${disabled} title="${t("develop")}">${t("develop")}</button>
        <button type="button" class="action" data-action="watch" data-kind="candidate" data-id="${escapeHtml(item.candidate_id)}" ${disabled} title="${t("watch")}">${t("watch")}</button>
        <button type="button" class="action" data-action="drop" data-kind="candidate" data-id="${escapeHtml(item.candidate_id)}" ${disabled} title="${t("drop")}">${t("drop")}</button>
      </div>
      <label class="note-label" for="review-note">${t("reviewNote")}</label>
      <textarea id="review-note" class="review-note" placeholder="${t("reviewNote")}">${escapeHtml(item.verdict?.comment || "")}</textarea>
      <div id="decision-feedback" class="muted decision-feedback"></div>
    </div>
  `;
}

export function renderCandidateDetail() {
  const item = candidateById(state.route.id);
  if (!item) {
    renderCandidates();
    return;
  }
  const proposal = proposalForCandidate(item.candidate_id);
  const trend = trendItems().find((entry) => entry.trend_id === item.source_ref);
  els.title.textContent = item.name;
  els.subtitle.textContent = `${enumLabel(item.source, "source")} · ${item.category} · ${enumLabel(item.stage, "stage")}`;
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <div class="detail-head">
          ${sourceBadge(item.source)}
          ${gradeBadge(item.competition_grade)}
          ${stageBadge(item.stage)}
          ${deltaArrow(item.momentum_pct)}
          <span class="muted">${t("firstSeen")} ${date(item.first_seen)}</span>
        </div>
        <div class="panel why-panel">
          <h2>${t("whyItMatters")}</h2>
          <p>${escapeHtml(item.why_it_matters || "")}</p>
          ${trend ? `<div class="handoff-chip">${escapeHtml(enumLabel(trend.source, "source"))}: ${escapeHtml(trend.title)} · ${escapeHtml(trend.metric_label)} ${compactNumber(trend.metric_value)}</div>` : ""}
        </div>
        ${marginCardPanel(item)}
        ${competitionPanel(item)}
        ${verdictPanel(item)}
      </div>
      <aside class="detail-side">
        <h2>${t("evidence")}</h2>
        <ul class="evidence-list">
          ${(item.evidence || []).map((entry) => `<li><a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(entry.title)}</a></li>`).join("") || `<li class="muted">—</li>`}
        </ul>
        <h2>${t("candidate")}</h2>
        <dl>
          <dt>${t("platform")}</dt><dd>${escapeHtml(item.platform_id || "")}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(item.category)}</dd>
          <dt>${t("estPrice")}</dt><dd>${money(item.est_price, item.currency)}</dd>
          <dt>${t("stage")}</dt><dd>${escapeHtml(enumLabel(item.stage, "stage"))}</dd>
          ${item.verdict?.decided_at ? `<dt>${t("verdict")}</dt><dd>${escapeHtml(enumLabel(item.verdict.action, "verdict"))} · ${dateTime(item.verdict.decided_at)}</dd>` : ""}
        </dl>
        ${
          proposal
            ? `
          <h2>${t("reviewQueue")}</h2>
          <a class="handoff-chip block-link" href="#/decisions">${escapeHtml(pickRef(proposal.proposal_id))} · ${escapeHtml(proposal.title)} ${statusBadge(proposal.status)}</a>
        `
            : ""
        }
      </aside>
    </section>
  `;
  bindDecisionButtons();
  bindMarginCard();
}

function bindMarginCard() {
  const root = els.content.querySelector("#margin-card");
  if (!root) return;
  const currency = root.dataset.currency || "USD";
  const read = (key) => Number(root.querySelector(`[data-mc="${key}"]`)?.value || 0);
  const recompute = () => {
    const price = read("price");
    const cogs = read("cogs");
    const freight = read("freight");
    const feePct = read("fee");
    const ad = read("ad");
    const feeAmount = price * (feePct / 100);
    const marginBeforeAds = price - cogs - freight - feeAmount;
    const margin = marginBeforeAds - ad;
    const marginPct = price > 0 ? (margin / price) * 100 : 0;
    const acos = price > 0 ? (marginBeforeAds / price) * 100 : 0;
    const floor = Number(state.settings?.config_summary?.seller_profile?.margin_floor_pct || 25);
    const set = (id, value) => {
      const node = root.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    set("mc-out-fee", money(feeAmount, currency));
    set("mc-out-margin", money(margin, currency));
    set("mc-out-margin-pct", pct(Math.round(marginPct * 10) / 10));
    set("mc-out-acos", pct(Math.round(acos * 10) / 10));
    const pctNode = root.querySelector("#mc-out-margin-pct");
    if (pctNode) pctNode.className = marginPct < floor ? "negative" : "positive";
    const floorNote = root.querySelector("#mc-floor-note");
    if (floorNote) floorNote.classList.toggle("hidden", marginPct >= floor);
  };
  root.querySelectorAll(".mc-input").forEach((input) => input.addEventListener("input", recompute));
}

/* ---------- Trends ---------- */

function filteredTrendItems() {
  const query = state.query.trim().toLowerCase();
  return trendItems().filter((item) => {
    if (state.trendSource && item.source !== state.trendSource) return false;
    if (!query) return true;
    return [item.title, item.summary, item.source, item.metric_label]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

export function renderTrends() {
  els.title.textContent = t("trendFeed");
  const items = filteredTrendItems();
  els.subtitle.textContent = `${items.length} / ${trendItems().length}`;
  const disabled = isLocked() || state.saving ? "disabled" : "";
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="filter-chips">
      <button type="button" class="chip ${state.trendSource === "" ? "active" : ""}" data-source="">${t("allSources")}</button>
      ${SOURCE_KINDS.map((kind) => `<button type="button" class="chip source-${kind} ${state.trendSource === kind ? "active" : ""}" data-source="${kind}">${escapeHtml(enumLabel(kind, "source"))}</button>`).join("")}
    </div>
    <div class="trend-list">
      ${
        items
          .map((item) => {
            const linked = item.candidate_id ? candidateById(item.candidate_id) : null;
            return `
          <div class="trend-row">
            <div class="trend-badge">${sourceBadge(item.source)}</div>
            <div class="row-main">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.summary)}</small>
              <small class="muted">${escapeHtml(item.metric_label)}: ${compactNumber(item.metric_value)} · ${t("observed")} ${dateTime(item.observed_at)}</small>
            </div>
            <div class="trend-momentum">
              ${sparkline(item.momentum)}
              ${deltaArrow(item.delta_pct)}
            </div>
            <div class="trend-link">
              ${
                linked
                  ? `<a class="badge link-badge" href="#/candidates/${encodeURIComponent(linked.candidate_id)}">${t("viewCandidate")}</a>`
                  : item.promotion
                    ? `<span class="badge status-badge queued">${t("promoteQueued")}</span>`
                    : `<button type="button" class="action small" data-action="promote" data-kind="trend" data-id="${escapeHtml(item.trend_id)}" ${disabled}>${t("promote")}</button>`
              }
            </div>
          </div>
        `;
          })
          .join("") || `<div class="empty">${t("empty")}</div>`
      }
    </div>
    <div id="decision-feedback" class="muted decision-feedback"></div>
  `;
  els.content.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.trendSource = chip.dataset.source || "";
      render();
    });
  });
  bindDecisionButtons();
}

/* ---------- Decisions ---------- */

function filteredProposals() {
  const query = state.query.trim().toLowerCase();
  if (!query) return proposals();
  return proposals().filter((item) =>
    [item.title, item.reason, item.brief, item.status, item.verdict]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function renderDecisions() {
  els.title.textContent = t("decisions");
  const items = filteredProposals();
  const byStatus = (status) => proposals().filter((item) => item.status === status).length;
  els.subtitle.textContent = `${items.length} ${t("proposals")} · ${byStatus("needs_review")} ${t("proposalsToReview")}`;
  const disabled = isLocked() || state.saving ? "disabled" : "";
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="metrics">
      ${["needs_review", "changes_requested", "approved", "done"]
        .map(
          (status) => `
        <div class="metric"><span>${escapeHtml(enumLabel(status))}</span><strong>${byStatus(status)}</strong></div>
      `,
        )
        .join("")}
    </div>
    <div class="proposal-list">
      ${
        items
          .map((item) => {
            const candidateItem = candidateById(item.candidate_id);
            const open = ["needs_review", "changes_requested"].includes(item.status);
            return `
          <div class="proposal-card" data-proposal="${escapeHtml(item.proposal_id)}">
            <div class="detail-head">
              <span class="muted ref-cell">${escapeHtml(pickRef(item.proposal_id))}</span>
              ${verdictBadge(item.verdict)}
              ${statusBadge(item.status)}
              <span class="muted">${date(item.proposed_at)}</span>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            ${candidateItem ? `<a class="muted candidate-link" href="#/candidates/${encodeURIComponent(candidateItem.candidate_id)}">${t("viewCandidate")}: ${escapeHtml(candidateItem.name)} · ${pct(candidateItem.margin_card?.margin_pct)} · ${escapeHtml(candidateItem.competition_grade)}</a>` : ""}
            <p class="proposal-reason"><span class="muted">${t("reason")}</span> ${escapeHtml(item.reason || "")}</p>
            <label class="note-label" for="brief-${escapeHtml(item.proposal_id)}">${t("briefEditable")}</label>
            <textarea id="brief-${escapeHtml(item.proposal_id)}" class="review-note brief-text" data-brief="${escapeHtml(item.proposal_id)}" ${open ? "" : "readonly"}>${escapeHtml(item.brief || "")}</textarea>
            ${
              open
                ? `
              <label class="note-label" for="note-${escapeHtml(item.proposal_id)}">${t("reviewNote")}</label>
              <textarea id="note-${escapeHtml(item.proposal_id)}" class="review-note note-text" data-note="${escapeHtml(item.proposal_id)}" placeholder="${t("reviewNote")}">${escapeHtml(item.review?.comment || "")}</textarea>
              <div class="action-row">
                <button type="button" class="action primary" data-action="approve" data-kind="proposal" data-id="${escapeHtml(item.proposal_id)}" ${disabled}>${t("approve")}</button>
                <button type="button" class="action" data-action="request_changes" data-kind="proposal" data-id="${escapeHtml(item.proposal_id)}" ${disabled}>${t("requestChanges")}</button>
                <button type="button" class="action" data-action="revise" data-kind="proposal" data-id="${escapeHtml(item.proposal_id)}" ${disabled}>${t("saveBrief")}</button>
                <button type="button" class="action" data-action="block" data-kind="proposal" data-id="${escapeHtml(item.proposal_id)}" ${disabled}>${t("block")}</button>
              </div>
            `
                : `${item.review?.comment || item.verdictNote ? `<p class="muted verdict-note">${escapeHtml(item.review?.comment || item.verdictNote)}</p>` : ""}`
            }
          </div>
        `;
          })
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
  const profile = summary.seller_profile || {};
  const freight = summary.freight || {};
  els.content.innerHTML = `
    ${demoBanner()}
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("sellerProfile")}</h2>
        <dl>
          <dt>${t("storeName")}</dt><dd>${escapeHtml(profile.store_name || "")}</dd>
          <dt>${t("category")}</dt><dd>${(profile.categories || []).map((entry) => escapeHtml(entry)).join(", ") || "—"}</dd>
          <dt>${t("targetPlatforms")}</dt><dd>${(profile.target_platforms || []).map((entry) => escapeHtml(entry)).join(", ") || "—"}</dd>
          <dt>${t("marginFloor")}</dt><dd>${pct(profile.margin_floor_pct)}</dd>
          <dt>${t("maxCogs")}</dt><dd>${money(profile.max_cogs)}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("feeTables")}</h2>
        ${
          (summary.platforms || [])
            .map(
              (platform) => `
          <div class="settings-row">
            <strong>${escapeHtml(platform.name)}</strong>
            <span>${t("referralFee")} ${pct(platform.referral_fee_pct)} · ${t("fulfillmentFlat")} ${money(platform.fulfillment_flat, platform.currency)}</span>
            <span class="muted">${escapeHtml(platform.currency)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("freightRules")}</h2>
        <div class="settings-row">
          <strong>*</strong>
          <span>${money(freight.default_per_unit)} ${t("perUnit")}</span>
          <span></span>
        </div>
        ${(freight.rules || [])
          .map(
            (rule) => `
          <div class="settings-row">
            <strong>${escapeHtml(rule.category)}</strong>
            <span>${money(rule.per_unit)} ${t("perUnit")}</span>
            <span></span>
          </div>
        `,
          )
          .join("")}
      </section>
      <section>
        <h2>${t("sources")}</h2>
        ${
          (summary.sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${sourceBadge(source.kind)}</span>
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
            <span></span>
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

/* ---------- Decisions plumbing ---------- */

function bindDecisionButtons() {
  els.content.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-proposal]");
      const note = card
        ? card.querySelector(`[data-note="${button.dataset.id}"]`)?.value || ""
        : els.content.querySelector("#review-note")?.value || "";
      const brief = card ? card.querySelector(`[data-brief="${button.dataset.id}"]`)?.value : undefined;
      submitDecision({
        kind: button.dataset.kind,
        id: button.dataset.id,
        action: button.dataset.action,
        comment: note,
        brief: button.dataset.kind === "proposal" ? brief : undefined,
      });
    });
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

function stageForCandidateAction(action) {
  if (action === "develop") return "develop";
  if (action === "watch") return "watch";
  if (action === "drop") return "dropped";
  return "reviewing";
}

function statusForProposalAction(action) {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return "needs_review";
}

function applyLocalDecision({ kind, id, action, comment, brief }) {
  const decided_at = new Date().toISOString();
  if (kind === "candidate") {
    const item = candidateById(id);
    if (item)
      Object.assign(item, { stage: stageForCandidateAction(action), verdict: { kind, action, comment, decided_at } });
  } else if (kind === "proposal") {
    const item = proposals().find((entry) => entry.proposal_id === id);
    if (item) {
      item.status = statusForProposalAction(action);
      item.review = { kind, action, comment, decided_at };
      item.verdictNote = comment || item.verdictNote;
      if (typeof brief === "string" && brief) item.brief = brief;
    }
  } else if (kind === "trend") {
    const item = trendItems().find((entry) => entry.trend_id === id);
    if (item) item.promotion = { kind, action, comment, decided_at };
  }
}

function showFeedback(message) {
  const node = els.content.querySelector("#decision-feedback");
  if (node) node.textContent = message;
}
