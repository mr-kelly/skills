import { messages } from "./i18n/messages.js";

const state = {
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
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
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

function parseRoute() {
  const raw = (location.hash || "#/overview").slice(1);
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.replace(/^\//, "").split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart || "");
  return {
    view: parts[0] || "overview",
    id: parts[1] ? decodeURIComponent(parts[1]) : "",
    statusFilter: params.get("status") || "",
  };
}

function setRoute() {
  state.route = parseRoute();
  render();
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.batch = data.batch;
  state.settings = data;
  render();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function isConnected() {
  return Boolean(state.batch?.items?.length);
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

function viewLabel(view) {
  if (view === "candidates") return t("candidatesTitle");
  if (view === "settings") return t("settings");
  return t("overview");
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

function metricCards() {
  const metrics = state.batch?.metrics || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("filterNeedsReview")}</span><strong>${metrics.needs_review || 0}</strong></div>
      <div class="metric"><span>${t("filterApproved")}</span><strong>${metrics.approved || 0}</strong></div>
      <div class="metric"><span>${t("filterDone")}</span><strong>${metrics.done || 0}</strong></div>
      <div class="metric"><span>${t("filterBlocked")}</span><strong>${metrics.blocked || 0}</strong></div>
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

function candidateRow(item) {
  const tier = scoreTier(item.score.composite_score);
  return `
    <a class="candidate-row" href="#/candidates/${encodeURIComponent(item.id)}">
      <span>
        <strong>${escapeHtml(item.business_name)}</strong>
        <small>${escapeHtml(categoryLabel(item.category))} · ${escapeHtml(item.city)}</small>
      </span>
      <span class="num">${money(item.requested_principal)}</span>
      <span class="badge">${escapeHtml(statusLabel(item.status))}</span>
      <span class="score-pill tier-${tier}">${num(item.score.composite_score)}</span>
    </a>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.batch?.generated_at
    ? `${t("generated")} ${new Date(state.batch.generated_at).toLocaleString()}`
    : t("empty");
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("needsConnection")}</div>`;
    return;
  }
  const items = [...(state.batch.items || [])].sort((a, b) => b.score.composite_score - a.score.composite_score);
  els.content.innerHTML = `
    ${metricCards()}
    ${distributionPanel()}
    <div class="overview-panel wide">
      <h2>${t("candidatesTitle")}</h2>
      <div>${items.map(candidateRow).join("")}</div>
    </div>
  `;
}

function renderCandidates() {
  els.title.textContent = t("candidatesTitle");
  const statusFilter = state.route.statusFilter;
  const items = filteredItems(statusFilter);
  els.subtitle.textContent = `${items.length} ${t("candidates")}`;
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("needsConnection")}</div>`;
    return;
  }
  const sorted = [...items].sort((a, b) => b.score.composite_score - a.score.composite_score);
  els.content.innerHTML = sorted.length
    ? `<div class="overview-panel wide"><div>${sorted.map(candidateRow).join("")}</div></div>`
    : `<div class="empty">${t("empty")}</div>`;
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

function factorTable(factors) {
  return `
    <div class="factor-table">
      ${factors
        .map(
          (factor) => `
        <div class="factor-row">
          <span class="factor-label">${escapeHtml(factorLabel(factor.key))}</span>
          <span class="num">${num(factor.raw_score)}</span>
          <span class="num">${Math.round(factor.weight * 100)}%</span>
          <span class="num strong">${num(factor.contribution)}</span>
          <span class="factor-bar-track"><span class="factor-bar-fill" style="width:${factor.raw_score}%"></span></span>
          <span class="factor-detail">${escapeHtml(factor.detail)}</span>
        </div>
      `,
        )
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

function renderCandidateDetail() {
  const item = (state.batch?.items || []).find((candidate) => candidate.id === state.route.id);
  if (!item) {
    renderCandidates();
    return;
  }
  els.title.textContent = item.business_name;
  els.subtitle.textContent = `${categoryLabel(item.category)} · ${item.city}`;
  const tier = scoreTier(item.score.composite_score);
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/candidates">← ${t("back")}</a>
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

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const rubric = summary.rubric || {};
  const weights = rubric.weights || {};
  const thresholds = rubric.decision_thresholds || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
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
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action, comment }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    await loadState();
  } catch (error) {
    els.content.insertAdjacentHTML("afterbegin", `<div class="warnings"><div>${escapeHtml(error.message)}</div></div>`);
  } finally {
    state.saving = false;
  }
}

function render() {
  renderShell();
  if (state.route.view === "candidates" && state.route.id) renderCandidateDetail();
  else if (state.route.view === "candidates") renderCandidates();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
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
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-decision-action]");
  if (!button) return;
  const panel = button.closest("[data-decision-panel]");
  const id = panel?.dataset.id;
  const note = panel?.querySelector("[data-decision-note]")?.value || "";
  if (id && !state.saving) submitDecision(id, button.dataset.decisionAction, note);
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-deal-scorer-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
