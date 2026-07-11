import { messages } from "./i18n/messages.js";
import { renderCreatorDetail, renderCreators, renderOutreach, renderRoi, renderSettings } from "./js/creator-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  outreachFilter: "all",
  creatorSort: "fit_score",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-creators-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-creators.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

export const els = {
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
  reviewCount: document.querySelector("#count-review"),
  approvedCount: document.querySelector("#count-approved"),
  blockedCount: document.querySelector("#count-blocked"),
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

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function compactNumber(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] || "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  render();
}

export async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "creators"
      ? "#/creators"
      : scenario === "outreach"
        ? "#/outreach"
        : scenario === "roi"
          ? "#/roi"
          : scenario === "detail"
            ? "#/creators/cr-lena-glow"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
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

export function decisionFor(creatorId) {
  return state.settings?.decisions?.decisions?.[creatorId] || null;
}

export function effectiveStatus(creator) {
  const decision = decisionFor(creator.creator_id);
  if (!decision) return creator.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return creator.status;
}

export function creators() {
  return state.snapshot?.creators || [];
}

export function engagements() {
  return creators().filter((item) => item.item_type !== "quality_gate");
}

export function creatorById(creatorId) {
  return creators().find((item) => item.creator_id === creatorId) || null;
}

function renderShell() {
  applyI18n();
  const reviewCount = creators().filter((item) => effectiveStatus(item) === "needs_review").length;
  const approvedCount = creators().filter((item) => ["approved", "done"].includes(effectiveStatus(item))).length;
  const blockedCount = creators().filter((item) => effectiveStatus(item) === "blocked").length;
  const reach = state.snapshot?.metrics?.total_reach || 0;
  els.syncStatus.textContent = creators().length ? `${compactNumber(reach)} ${t("reach")}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount;
  if (els.blockedCount) els.blockedCount.textContent = blockedCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needReview")}`
      : `${compactNumber(reach)} ${t("reach")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "creators") return t("creators");
  if (view === "outreach") return t("outreach");
  if (view === "roi") return t("roi");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function phaseBadge(phase) {
  return `<span class="phase-badge phase-${escapeHtml(phase)}">${escapeHtml(enumLabel(phase, "phase"))}</span>`;
}

export function platformBadge(platform) {
  return `<span class="platform-badge platform-${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

export function nicheBadge(niche) {
  return `<span class="badge">${escapeHtml(enumLabel(niche, "niche"))}</span>`;
}

export function riskBadges(risks = []) {
  return risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
}

export function gateBadge(verdict) {
  return `<span class="gate-badge gate-${escapeHtml(verdict)}">${escapeHtml(enumLabel(verdict, "gate"))}</span>`;
}

export function fitBadge(score) {
  const value = Number(score || 0);
  const tier = value >= 80 ? "high" : value >= 60 ? "mid" : "low";
  return `<span class="fit-badge fit-${tier}" title="${t("fitScore")}">${value}</span>`;
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function warnings() {
  const items = state.snapshot?.warnings || [];
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

export function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  const reviewCount = creators().filter((item) => effectiveStatus(item) === "needs_review").length;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("reach")}</span><strong>${compactNumber(metrics.total_reach)}</strong></div>
      <div class="metric"><span>${t("estValue")}</span><strong>${money(metrics.est_value)}</strong></div>
      <div class="metric"><span>${t("budgetAllocated")}</span><strong>${money(metrics.budget_allocated)}</strong></div>
      <div class="metric"><span>${t("toReview")}</span><strong>${reviewCount}</strong></div>
    </div>
  `;
}

function riskFilter(item) {
  return item.item_type !== "quality_gate";
}

export function filteredCreators() {
  const query = state.query.trim().toLowerCase();
  let items = creators().filter(riskFilter);
  if (query) {
    items = items.filter((item) =>
      [item.name, item.handle, item.platform, item.niche, item.stage, item.reason]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }
  const sort = state.creatorSort;
  return items.slice().sort((a, b) => {
    if (sort === "followers") return Number(b.followers || 0) - Number(a.followers || 0);
    if (sort === "engagement_rate") return Number(b.engagement_rate || 0) - Number(a.engagement_rate || 0);
    if (sort === "est_rate") return Number(a.est_rate || 0) - Number(b.est_rate || 0);
    return Number(b.fit_score || 0) - Number(a.fit_score || 0);
  });
}

export function filteredOutreach() {
  const query = state.query.trim().toLowerCase();
  return creators().filter((item) => {
    const status = effectiveStatus(item);
    if (state.outreachFilter !== "all" && status !== state.outreachFilter) return false;
    if (!query) return true;
    return [item.name, item.handle, item.reason, item.suggested_reply, status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const stages = state.snapshot?.pipeline_stages || [];
  const list = engagements();
  const maxStageCount = Math.max(1, ...stages.map((stage) => list.filter((item) => item.stage === stage).length));
  const budgetTotal = Number(metrics.budget_total || 0);
  const budgetAllocated = Number(metrics.budget_allocated || 0);
  const budgetPct = budgetTotal ? Math.min(100, Math.round((budgetAllocated / budgetTotal) * 100)) : 0;
  const top = list
    .slice()
    .sort((a, b) => Number(b.fit_score || 0) - Number(a.fit_score || 0))
    .slice(0, 5);
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("pipelineFunnel")}</h2>
        ${stages
          .map((stage) => {
            const stageItems = list.filter((item) => item.stage === stage);
            const reach = stageItems.reduce((sum, item) => sum + Number(item.followers || 0), 0);
            return `
            <div class="stage-row">
              <span class="stage-row-head">${phaseBadge(phaseForStage(stage))}<strong>${escapeHtml(enumLabel(stage, "stage"))}</strong><small>${stageItems.length}</small></span>
              <span class="stage-bar"><span style="width:${Math.round((stageItems.length / maxStageCount) * 100)}%"></span></span>
              <span class="num">${compactNumber(reach)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("budget")}</h2>
        <div class="budget-head">
          <strong>${money(budgetAllocated)}</strong>
          <span class="muted">/ ${money(budgetTotal)} ${t("budgetTotal")}</span>
        </div>
        <span class="stage-bar budget-bar"><span style="width:${budgetPct}%"></span></span>
        <div class="network-grid">
          <a href="#/creators"><strong>${metrics.creator_count || 0}</strong><span>${t("creatorsLower")}</span></a>
          <a href="#/roi"><strong>${money(metrics.est_value)}</strong><span>${t("estValue")}</span></a>
          <a href="#/outreach"><strong>${metrics.needs_review || 0}</strong><span>${t("toReview")}</span></a>
          <a href="#/creators"><strong>${compactNumber(metrics.total_reach)}</strong><span>${t("reach")}</span></a>
        </div>
      </div>
      <div class="overview-panel span-2">
        <h2>${t("topCreators")}</h2>
        ${
          top
            .map((item) => {
              return `
            <a class="due-row" href="#/creators/${encodeURIComponent(item.creator_id)}">
              <span><strong>${escapeHtml(item.name)} <small class="muted">${escapeHtml(item.handle)}</small></strong><small>${platformBadge(item.platform)} ${nicheBadge(item.niche)}</small></span>
              <span class="due-meta">${fitBadge(item.fit_score)}<small>${statusBadge(effectiveStatus(item))}</small></span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

function phaseForStage(stage) {
  return (
    { discovery: "discover", outreach: "activate", negotiating: "plan", live: "activate", measured: "measure" }[
      stage
    ] || "discover"
  );
}

export function render() {
  renderShell();
  if (state.route.view === "creators" && state.route.id) renderCreatorDetail();
  else if (state.route.view === "creators") renderCreators();
  else if (state.route.view === "outreach") renderOutreach();
  else if (state.route.view === "roi") renderRoi();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

export function escapeHtml(value) {
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
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-creators-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
