import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Detail mode, declared once (see `appConfig.ui.detail_modes`): `candidates`
// is the only Base, and it is a queue worked top to bottom — approve, send
// back or reject, then the next candidate — so its detail opens beside the
// list (`split`), never a drawer or a second full-page implementation.
// `?peek=<id>` drives the split selection; `/<id>` is always a full page
// ("Open full page"), whatever the declared mode. On a phone every mode
// becomes a page (base-ui.css).
const VIEW_MODES = appConfig.ui.detail_modes;

const state = {
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  batch: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-deal-scorer-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-deal-scorer.sidebarCollapsed";

const els = {
  overviewPage: document.querySelector("#overviewPage"),
  overviewSubtitle: document.querySelector("#overviewSubtitle"),
  overviewMetrics: document.querySelector("#overviewMetrics"),
  overviewBody: document.querySelector("#overviewBody"),
  candidatesPage: document.querySelector("#candidatesPage"),
  candidatesCount: document.querySelector("#candidatesCount"),
  candidatesList: document.querySelector("#candidatesList"),
  candidatesDetail: document.querySelector("#candidatesDetail"),
  candidatesDetailBody: document.querySelector("#candidatesDetailBody"),
  detailBack: document.querySelector("#detailBack"),
  detailExpand: document.querySelector("#detailExpand"),
  settingsPage: document.querySelector("#settingsPage"),
  settingsSubtitle: document.querySelector("#settingsSubtitle"),
  settingsContent: document.querySelector("#settingsContent"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  candidatesRefresh: document.querySelector("#candidatesRefresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  reviewCount: document.querySelector("#review-count"),
  summaryReview: document.querySelector("#summary-review"),
  countHigh: document.querySelector("#count-high"),
  countBlocked: document.querySelector("#count-blocked"),
  language: document.querySelector("#language"),
};

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
  } else {
    setMobileSidebarOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function normalizeLang(lang) {
  return String(lang || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : lang || "auto";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function categoryLabel(category) {
  const key = `category_${String(category || "").replace(/[^A-Za-z]/g, "")}`;
  return messages[activeLang()]?.[key] || messages.en[key] || category;
}

function factorLabel(key) {
  return messages[activeLang()]?.factorLabel?.[key] || messages.en.factorLabel?.[key] || key;
}

function statusLabel(status) {
  const map = {
    needs_review: "statusNeedsReview",
    changes_requested: "statusChangesRequested",
    approved: "statusApproved",
    done: "statusDone",
    blocked: "statusBlocked",
  };
  return t(map[status] || "statusNeedsReview");
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function num(value, digits = 1) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function scoreTier(score) {
  const thresholds = state.settings?.config_summary?.rubric?.decision_thresholds || {
    high_confidence_min: 78,
    needs_review_min: 50,
  };
  if (score >= thresholds.high_confidence_min) return "high";
  if (score >= thresholds.needs_review_min) return "review";
  return "low";
}

// `#/overview` (default) · `#/candidates[/<id>][?status=…&peek=…]` ·
// `#/settings`. Search lives in JS state only (as before); the status filter
// and the peeked candidate live in the URL so refresh, shared links and Back
// restore the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").slice(1);
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.replace(/^\//, "").split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart || "");
  const view = parts[0] || "overview";
  const id = parts[1] ? decodeURIComponent(parts[1]) : "";
  return {
    view,
    id,
    statusFilter: params.get("status") || "",
    peek: !id && params.get("peek") ? decodeURIComponent(params.get("peek")) : "",
  };
}

function candidatesQuery(extra = {}) {
  const params = new URLSearchParams();
  if (state.route.statusFilter) params.set("status", state.route.statusFilter);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function openDetail(id) {
  location.hash = `#/candidates${candidatesQuery({ peek: id })}`;
}

function openFullPage(id) {
  location.hash = `#/candidates/${encodeURIComponent(id)}${candidatesQuery()}`;
}

function closeDetail() {
  location.hash = `#/candidates${candidatesQuery()}`;
}

function setRoute() {
  state.route = parseRoute();
  render();
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.batch = data.batch;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("kelly-deal-scorer:state", { detail: data }));
  render();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  if (els.candidatesRefresh) els.candidatesRefresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function isConnected() {
  return Boolean(state.batch?.items?.length);
}

function viewLabel(view) {
  if (view === "candidates") return t("candidatesTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function renderShell() {
  applyI18n();
  const batch = state.batch;
  const distribution = batch?.distribution || {};
  const metrics = batch?.metrics || {};
  const connected = isConnected();
  els.syncStatus.textContent = connected
    ? batch?.generated_at
      ? `${t("generated")} ${new Date(batch.generated_at).toLocaleString()}`
      : t("synced")
    : t("needsConnection");
  const needsDecision = (metrics.needs_review || 0) - 0;
  if (els.reviewCount) els.reviewCount.textContent = needsDecision;
  if (els.summaryReview) els.summaryReview.textContent = connected ? `${needsDecision}` : "—";
  if (els.countHigh) els.countHigh.textContent = distribution.high_confidence || 0;
  if (els.countBlocked) els.countBlocked.textContent = metrics.blocked || 0;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = connected ? `${needsDecision} ${t("needsDecision")}` : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    const routeMatches = link.dataset.route === state.route.view;
    const filterMatches = (link.dataset.filter || "") === (state.route.statusFilter || "");
    link.classList.toggle("active", routeMatches && filterMatches);
  });
}

// Body state for the shared `base-ui.css` record-view layout. `candidates`
// is declared `split`, so the mode class is set for the whole view even with
// nothing selected; `ws-detail-open` only tracks whether a record is shown.
function updateBodyModeClasses() {
  const onCandidates = state.route.view === "candidates";
  const selectedId = state.route.id || state.route.peek;
  const body = document.body.classList;
  body.toggle("ws-detail-open", onCandidates && Boolean(selectedId));
  body.toggle("ws-detail-page", onCandidates && Boolean(state.route.id));
  body.toggle("ws-detail-drawer", false);
  body.toggle("ws-layout-split", onCandidates && VIEW_MODES.candidates === "split");
  body.toggle("ws-searching", onCandidates && Boolean(state.query.trim()));
}

function distributionPanel() {
  const distribution = state.batch?.distribution || {
    high_confidence: 0,
    needs_review: 0,
    low_confidence: 0,
    average_score: 0,
  };
  const total = Math.max(1, (state.batch?.items || []).length);
  const highPct = (distribution.high_confidence / total) * 100;
  const reviewPct = (distribution.needs_review / total) * 100;
  const lowPct = (distribution.low_confidence / total) * 100;
  return `
    <div class="overview-panel wide">
      <h2>${t("queueSummary")}</h2>
      <div class="dist-bar">
        <span class="seg-high" style="width:${highPct}%"></span>
        <span class="seg-review" style="width:${reviewPct}%"></span>
        <span class="seg-low" style="width:${lowPct}%"></span>
      </div>
      <div class="dist-legend">
        <span><span class="dist-swatch" style="background:var(--good,#147a32)"></span>${t("highConfidenceLabel")}: ${distribution.high_confidence}</span>
        <span><span class="dist-swatch" style="background:var(--warn,#9c5a12)"></span>${t("needsReviewLabel")}: ${distribution.needs_review}</span>
        <span><span class="dist-swatch" style="background:var(--bad,#b33434)"></span>${t("lowConfidenceLabel")}: ${distribution.low_confidence}</span>
        <span>${t("averageScore")}: <strong>${num(distribution.average_score)}</strong></span>
      </div>
    </div>
  `;
}

function filteredItems(statusFilter = "") {
  const query = state.query.trim().toLowerCase();
  return (state.batch?.items || []).filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (!query) return true;
    return [item.business_name, item.category, item.city]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function emptyState(message) {
  return `
    <div class="empty">
      <div class="empty-icon" aria-hidden="true"></div>
      <div class="empty-message">${escapeHtml(message)}</div>
    </div>
  `;
}

// ── Overview: hero + at most three numbers, none of them already visible in
// the sidebar's attention block (needs-review/high-confidence/blocked live
// there already) — plus the aggregate score-distribution chart. No per-row
// candidate list here; that is what the Candidates view is for. ───────────
function renderOverviewPage() {
  const connected = isConnected();
  els.overviewSubtitle.textContent = state.batch?.generated_at
    ? `${t("generated")} ${new Date(state.batch.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.batch?.metrics || {};
  const distribution = state.batch?.distribution || {};
  els.overviewMetrics.innerHTML = `
    <div><span>${t("filterApproved")}</span><strong>${metrics.approved || 0}</strong></div>
    <div><span>${t("filterDone")}</span><strong>${metrics.done || 0}</strong></div>
    <div><span>${t("averageScore")}</span><strong>${num(distribution.average_score)}</strong></div>
  `;
  els.overviewBody.innerHTML = connected ? distributionPanel() : emptyState(t("needsConnection"));
}

function candidateDetailMarkup(item) {
  const tier = scoreTier(item.score.composite_score);
  return `
    <section class="detail">
      <div class="detail-main">
        <div class="metrics">
          <div class="metric"><span>${t("compositeScore")}</span><strong class="score-pill tier-${tier}">${num(item.score.composite_score)}</strong></div>
          <div class="metric"><span>${t("requestedPrincipal")}</span><strong>${money(item.requested_principal)}</strong></div>
          <div class="metric"><span>${t("status")}</span><strong>${escapeHtml(statusLabel(item.status))}</strong></div>
          <div class="metric"><span>${t("redFlags")}</span><strong>${item.red_flags.length}</strong></div>
        </div>
        <div class="overview-panel wide">
          <h2>${t("revenueHistory")}</h2>
          ${revenueChart(item.monthly_revenue)}
        </div>
        <div class="overview-panel wide">
          <h2>${t("scoreBreakdown")}</h2>
          ${factorTable(item.score.factors)}
          <div class="revshare-panel">
            <span>${t("suggestedShareRate")}</span>
            <strong>${num(item.score.suggested_share_rate.min_pct)}% – ${num(item.score.suggested_share_rate.max_pct)}%</strong>
          </div>
        </div>
        ${decisionPanel(item)}
      </div>
      <aside class="detail-side">
        <h2>${t("candidateDetail")}</h2>
        <dl>
          <dt>${t("business")}</dt><dd>${escapeHtml(item.business_name)}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(categoryLabel(item.category))}</dd>
          <dt>${t("city")}</dt><dd>${escapeHtml(item.city)}</dd>
          <dt>${t("requestedPrincipal")}</dt><dd>${money(item.requested_principal)}</dd>
        </dl>
        <h2>${t("redFlags")}</h2>
        <div>${redFlagsPanel(item.red_flags)}</div>
      </aside>
    </section>
  `;
}

function revenueChart(revenue) {
  const max = Math.max(...revenue, 1);
  return `
    <div class="revenue-chart">
      ${revenue
        .map(
          (value, index) => `
        <div class="revenue-bar" style="height:${Math.max(4, (value / max) * 100)}%">
          <span>${index === 0 || index === revenue.length - 1 ? money(value) : ""}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function factorBarTier(score) {
  if (score >= 78) return "high";
  if (score >= 50) return "review";
  return "low";
}

function factorTable(factors) {
  return `
    <div class="factor-table">
      <div class="factor-row factor-row-head" aria-hidden="true">
        <span class="factor-label">${escapeHtml(t("factor"))}</span>
        <span class="num">${escapeHtml(t("rawScore"))}</span>
        <span class="num">${escapeHtml(t("weight"))}</span>
        <span class="num">${escapeHtml(t("contribution"))}</span>
      </div>
      ${factors
        .map((factor) => {
          const tier = factorBarTier(factor.raw_score);
          return `
        <div class="factor-row">
          <span class="factor-label">${escapeHtml(factorLabel(factor.key))}</span>
          <span class="num">${num(factor.raw_score)}</span>
          <span class="num">${Math.round(factor.weight * 100)}%</span>
          <span class="num strong">${num(factor.contribution)}</span>
          <span class="factor-bar-track"><span class="factor-bar-fill tier-${tier}" style="width:${factor.raw_score}%"></span></span>
          <span class="factor-detail">${escapeHtml(factor.detail)}</span>
        </div>
      `;
        })
        .join("")}
    </div>
  `;
}

function redFlagsPanel(flags) {
  if (!flags?.length) return `<div class="flag-empty">${t("noRedFlags")}</div>`;
  return flags.map((flag) => `<span class="flag-badge">${escapeHtml(flag.replaceAll("_", " "))}</span>`).join("");
}

function decisionPanel(item) {
  const decided = item.decision;
  return `
    <div class="decision-panel" data-decision-panel data-id="${escapeHtml(item.id)}">
      <h2>${t("decision")}</h2>
      ${
        decided
          ? `<div class="decision-recorded">${escapeHtml(statusLabel(item.status))} — ${escapeHtml(decided.comment || "")} <small class="muted">${new Date(decided.decided_at).toLocaleString()}</small></div>`
          : ""
      }
      <textarea class="decision-note" data-decision-note placeholder="${escapeHtml(t("decisionNotePlaceholder"))}">${escapeHtml(decided?.comment || "")}</textarea>
      <div class="decision-actions">
        <button type="button" class="approve" data-decision-action="approve_term_sheet" title="${escapeHtml(t("approveTermSheet"))}">${escapeHtml(t("approveTermSheet"))}</button>
        <button type="button" class="sendback" data-decision-action="send_back_for_data" title="${escapeHtml(t("sendBackForData"))}">${escapeHtml(t("sendBackForData"))}</button>
        <button type="button" class="reject" data-decision-action="reject" title="${escapeHtml(t("rejectCandidate"))}">${escapeHtml(t("rejectCandidate"))}</button>
      </div>
    </div>
  `;
}

function candidateRow(item, selectedId) {
  const tier = scoreTier(item.score.composite_score);
  const selected = item.id === selectedId ? " ws-selected" : "";
  return `
    <tr data-id="${escapeHtml(item.id)}" class="${selected}">
      <td>${escapeHtml(item.business_name)}</td>
      <td class="ws-col-num"><span class="score-pill tier-${tier}">${num(item.score.composite_score)}</span></td>
      <td>${escapeHtml(categoryLabel(item.category))}</td>
      <td>${escapeHtml(item.city)}</td>
      <td class="ws-col-num">${money(item.requested_principal)}</td>
      <td class="ws-split-keep"><span class="badge">${escapeHtml(statusLabel(item.status))}</span></td>
    </tr>
  `;
}

function candidatesTable(items, selectedId) {
  return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("business"))}</th>
          <th class="ws-col-num">${escapeHtml(t("scoreColumn"))}</th>
          <th>${escapeHtml(t("category"))}</th>
          <th>${escapeHtml(t("city"))}</th>
          <th class="ws-col-num">${escapeHtml(t("requestedPrincipal"))}</th>
          <th class="ws-split-keep">${escapeHtml(t("status"))}</th>
        </tr>
      </thead>
      <tbody>${items.map((item) => candidateRow(item, selectedId)).join("")}</tbody>
    </table>
  `;
}

function renderCandidatesPage() {
  const statusFilter = state.route.statusFilter;
  const items = filteredItems(statusFilter);
  const narrowed = Boolean(state.query.trim());
  els.candidatesCount.textContent = recordCountLabel("candidates", items.length, narrowed);
  const selectedId = state.route.id || state.route.peek;

  if (!isConnected()) {
    els.candidatesList.innerHTML = `${emptyState(t("needsConnection"))}${pagerControl("candidates")}`;
  } else {
    const sorted = [...items].sort((a, b) => b.score.composite_score - a.score.composite_score);
    els.candidatesList.innerHTML = sorted.length
      ? `${candidatesTable(sorted, selectedId)}${pagerControl("candidates")}`
      : `${emptyState(t("empty"))}${pagerControl("candidates")}`;
  }

  const selected = selectedId ? (state.batch?.items || []).find((candidate) => candidate.id === selectedId) : null;
  els.candidatesDetailBody.innerHTML = selected
    ? candidateDetailMarkup(selected)
    : `<div class="ws-detail-empty">${escapeHtml(t("selectCandidate"))}</div>`;

  // "Open full page" is only meaningful from a drawer/split peek, never when
  // already on the `/<id>` full page.
  if (els.detailExpand) {
    els.detailExpand.hidden = !selected || Boolean(state.route.id);
    if (selected) els.detailExpand.dataset.id = selected.id;
  }
}

function renderSettingsPage() {
  els.settingsSubtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const rubric = summary.rubric || {};
  const weights = rubric.weights || {};
  const thresholds = rubric.decision_thresholds || {};
  els.settingsContent.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("rubric")}</h2>
        <dl>
          ${Object.entries(weights)
            .map(
              ([key, value]) => `<dt>${escapeHtml(factorLabel(key))}</dt><dd>${Math.round(Number(value) * 100)}%</dd>`,
            )
            .join("")}
        </dl>
      </section>
      <section>
        <h2>${t("thresholds")}</h2>
        <dl>
          <dt>${t("highConfidenceMin")}</dt><dd>${escapeHtml(String(thresholds.high_confidence_min ?? ""))}</dd>
          <dt>${t("needsReviewMin")}</dt><dd>${escapeHtml(String(thresholds.needs_review_min ?? ""))}</dd>
        </dl>
      </section>
    </div>
  `;
}

async function submitDecision(id, action, comment) {
  if (state.demo) return; // demo mode never writes
  state.saving = true;
  try {
    const provider = await getProvider();
    await provider.submitReview({ id, action, comment });
    await loadState();
  } catch (error) {
    els.candidatesDetailBody.insertAdjacentHTML(
      "afterbegin",
      `<div class="warnings"><div>${escapeHtml(error.message)}</div></div>`,
    );
  } finally {
    state.saving = false;
  }
}

function render() {
  renderShell();
  updateBodyModeClasses();
  const isCandidates = state.route.view === "candidates";
  const isSettings = state.route.view === "settings";
  els.overviewPage.hidden = isCandidates || isSettings;
  els.candidatesPage.hidden = !isCandidates;
  els.settingsPage.hidden = !isSettings;
  if (state.route.view === "candidates") renderCandidatesPage();
  else if (state.route.view === "settings") renderSettingsPage();
  else renderOverviewPage();
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape closes a drawer/split selection; a full `/<id>` page is a real
  // navigation, not an overlay, so Escape leaves it alone.
  if (document.body.classList.contains("ws-detail-open") && !document.body.classList.contains("ws-detail-page")) {
    closeDetail();
  }
});
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.candidatesList.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  openDetail(row.dataset.id);
});
els.detailBack?.addEventListener("click", closeDetail);
els.detailExpand?.addEventListener("click", (event) => {
  event.preventDefault();
  if (els.detailExpand.dataset.id) openFullPage(els.detailExpand.dataset.id);
});
els.candidatesDetailBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-decision-action]");
  if (!button) return;
  const panel = button.closest("[data-decision-panel]");
  const id = panel?.dataset.id;
  const note = panel?.querySelector("[data-decision-note]")?.value || "";
  if (id && !state.saving) submitDecision(id, button.dataset.decisionAction, note);
});
els.refresh.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.candidatesRefresh?.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.mobileRefresh?.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-deal-scorer-language", state.lang);
  if (state.demo) {
    loadState().catch((error) => alert(error.message));
    return;
  }
  render();
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    els.candidatesList.innerHTML = emptyState(error.message);
    els.overviewBody.innerHTML = emptyState(error.message);
  }
}

syncResponsiveShell();

const PAGE_BINDINGS = {
  candidates: { key: "candidates", path: "batch.items" },
};

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

function replacePageRows(path, rows) {
  const parts = path.split(".");
  let target = state;
  for (const part of parts.slice(0, -1)) {
    target = target?.[part];
    if (!target) return;
  }
  target[parts.at(-1)] = rows;
}

async function goToPage(key, targetPage) {
  if (state.pageLoading[key] || !state.pageCursors[key]) return;
  const binding = Object.values(PAGE_BINDINGS).find((entry) => entry.key === key);
  if (!binding) return;
  const totalPages = pageCount(key);
  const page = totalPages == null ? Math.max(1, targetPage) : Math.min(Math.max(1, targetPage), totalPages);
  if (page === state.currentPage[key]) return;
  state.pageLoading[key] = true;
  if (typeof render === "function") render();
  else route();
  try {
    const provider = await getProvider();
    let result;
    for (let next = state.pageCursors[key].length; next <= page; next += 1) {
      const cursor = state.pageCursors[key][next - 1];
      if (next > 1 && !cursor) return;
      result = await provider.fetchPage(key, cursor);
      state.pageCursors[key][next] = result.nextCursor;
    }
    if (!result || state.pageCursors[key].length > page + 1) {
      result = await provider.fetchPage(key, state.pageCursors[key][page - 1]);
      state.pageCursors[key][page] = result.nextCursor;
    }
    replacePageRows(binding.path, result.rows);
    state.currentPage[key] = page;
  } finally {
    state.pageLoading[key] = false;
    if (typeof render === "function") render();
    else route();
  }
}

function pagerMessage(key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

export function recordCountLabel(key, loadedCount, filtered = false) {
  if (filtered) return loadedCount;
  const total = state.totals?.[key];
  if (total != null) return total;
  const current = state.currentPage?.[key] || 1;
  return `${loadedCount}${state.pageCursors?.[key]?.[current] ? "+" : ""}`;
}

export function pagerControl(key) {
  if (!state.pageCursors[key]) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const loading = Boolean(state.pageLoading[key]);
  const hasNext = total == null ? Boolean(state.pageCursors[key][current]) : current < total;
  if ((total === 1 || total == null) && current === 1 && !hasNext) return "";
  const pages =
    total == null
      ? []
      : total <= 7
        ? Array.from({ length: total }, (_, index) => index + 1)
        : [...new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))].sort(
            (a, b) => a - b,
          );
  const items = [];
  let previous = 0;
  for (const page of pages) {
    if (previous && page - previous > 1) items.push('<span class="pager-ellipsis">…</span>');
    items.push(
      `<button type="button" class="pager-page ${page === current ? "active" : ""}" data-goto-page="${key}:${page}" ${loading || page === current ? "disabled" : ""}>${page}</button>`,
    );
    previous = page;
  }
  return `<nav class="pager" aria-label="${pagerMessage("pagination", "Pagination")}">
    <button type="button" class="pager-nav" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${pagerMessage("prevPage", "Prev")}</button>
    ${items.join("")}
    <button type="button" class="pager-nav" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${pagerMessage("nextPage", "Next")}</button>
    ${total == null ? "" : `<span class="pager-summary">${pagerMessage("pageOf", "Page {current} of {total}").replace("{current}", current).replace("{total}", total)}</span>`}
  </nav>`;
}

els.candidatesList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-goto-page]");
  if (!button) return;
  const [key, page] = button.dataset.gotoPage.split(":");
  goToPage(key, Number(page));
});

boot();
