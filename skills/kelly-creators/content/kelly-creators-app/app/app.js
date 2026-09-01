import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { renderCreatorDetail, renderCreators, renderOutreach, renderRoi, renderSettings } from "./js/creator-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

export const state = {
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
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
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("kelly-creators:state", { detail: data }));
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

export function effectiveStatus(creator) {
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
    els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

syncResponsiveShell();

const PAGE_BINDINGS = {
  creators: { key: "creators", path: "snapshot.creators" },
  outreach: { key: "creators", path: "snapshot.creators" },
  roi: { key: "creators", path: "snapshot.creators" },
};

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 100;
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

document.querySelector("#content")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-goto-page]");
  if (!button) return;
  const [key, page] = button.dataset.gotoPage.split(":");
  goToPage(key, Number(page));
});

boot();
