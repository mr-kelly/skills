import { messages } from "./i18n/messages.js";
import {
  renderCandidateDetail,
  renderCandidates,
  renderDecisions,
  renderSettings,
  renderTrends,
} from "./js/selection-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  trendSource: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-picks-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-picks.sidebarCollapsed";
const REFRESH_INTERVAL_MS = 30000;
const FEATURED_CANDIDATE_ID = "cand-lunchbox";
export const SOURCE_KINDS = ["amazon_bsr", "tiktok", "temu", "aliexpress", "trends", "competitor"];

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
  developCount: document.querySelector("#count-develop"),
  watchCount: document.querySelector("#count-watch"),
  language: document.querySelector("#language"),
};

/* ---------- Shell ---------- */

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

/* ---------- i18n / formatting ---------- */

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
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
}

export function pct(value) {
  return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

export function compactNumber(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/* ---------- Routing / data ---------- */

export function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
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
    scenario === "candidates"
      ? "#/candidates"
      : scenario === "detail"
        ? `#/candidates/${FEATURED_CANDIDATE_ID}`
        : scenario === "trends"
          ? "#/trends"
          : scenario === "decisions"
            ? "#/decisions"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = { auto: activeLang() === "zh" ? "自动" : "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function candidates() {
  return state.snapshot?.candidates || [];
}

export function trendItems() {
  return state.snapshot?.trend_items || [];
}

export function proposals() {
  return state.snapshot?.proposals || [];
}

function sources() {
  return state.snapshot?.sources || [];
}

export function candidateById(id) {
  return candidates().find((item) => item.candidate_id === id);
}

export function proposalForCandidate(candidateId) {
  return proposals().find((item) => item.candidate_id === candidateId);
}

export function pickRef(proposalId) {
  const index = proposals().findIndex((item) => item.proposal_id === proposalId);
  return index >= 0 ? `${t("pick")} #${index + 1}` : "";
}

export function isLocked() {
  return Boolean(state.settings?.lock);
}

function attentionCounts() {
  const review = proposals().filter((item) => item.status === "needs_review").length;
  const toReview = candidates().filter((item) => ["new", "reviewing"].includes(item.stage)).length;
  const develop = candidates().filter((item) => item.stage === "develop").length;
  const watching = candidates().filter((item) => item.stage === "watch").length;
  const awaitingHandoff = proposals().filter((item) => item.status === "approved").length;
  const staleWatches = candidates().filter(
    (item) => item.stage === "watch" && Date.now() - Date.parse(item.last_updated || 0) > 14 * 24 * 3600 * 1000,
  ).length;
  return { review, toReview, develop, watching, awaitingHandoff, staleWatches };
}

function renderShell() {
  applyI18n();
  const counts = attentionCounts();
  const hasData = state.snapshot?.generated_at && state.snapshot.generated_at !== new Date(0).toISOString();
  els.syncStatus.textContent = hasData
    ? `${candidates().length} ${t("candidates").toLowerCase()} · ${trendItems().length} ${t("trends").toLowerCase()}`
    : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = counts.review;
  if (els.developCount) els.developCount.textContent = counts.develop;
  if (els.watchCount) els.watchCount.textContent = counts.watching;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = counts.review
      ? `${counts.review} ${t("proposalsToReview")}`
      : `${candidates().length} ${t("candidates").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "candidates") return t("candidates");
  if (view === "trends") return t("trends");
  if (view === "decisions") return t("decisions");
  if (view === "settings") return t("settings");
  return t("overview");
}

/* ---------- Shared fragments ---------- */

export function sourceBadge(kind) {
  return `<span class="badge source ${escapeHtml(kind)}">${escapeHtml(enumLabel(kind, "source"))}</span>`;
}

export function stageBadge(stage) {
  return `<span class="badge stage-badge ${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

export function statusBadge(status) {
  return `<span class="badge status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function gradeBadge(grade) {
  return `<span class="badge grade grade-${escapeHtml(grade)}" title="${t("grade")}">${escapeHtml(grade)}</span>`;
}

export function verdictBadge(verdict) {
  return `<span class="badge verdict-badge ${escapeHtml(verdict)}">${escapeHtml(enumLabel(verdict, "verdict"))}</span>`;
}

export function deltaArrow(delta) {
  const value = Number(delta || 0);
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "→";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(value)}%</span>`;
}

export function sparkline(momentum = []) {
  if (!momentum.length) return "";
  const width = 96;
  const height = 26;
  const max = Math.max(...momentum);
  const min = Math.min(...momentum);
  const span = max - min || 1;
  const step = width / Math.max(momentum.length - 1, 1);
  const points = momentum
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - 3 - ((value - min) / span) * (height - 6)).toFixed(1)}`,
    )
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function reviewBars(counts = []) {
  if (!counts.length) return "";
  const width = 320;
  const height = 96;
  const gap = 5;
  const barWidth = (width - gap * (counts.length - 1)) / counts.length;
  const max = Math.max(...counts) || 1;
  const bars = counts
    .map((value, index) => {
      const barHeight = Math.max((value / max) * (height - 18), 2);
      const x = index * (barWidth + gap);
      const y = height - 14 - barHeight;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2" class="${index === 0 ? "head" : ""}"><title>#${index + 1}: ${value.toLocaleString()}</title></rect>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 3}" text-anchor="middle">${compactNumber(value)}</text>`;
    })
    .join("");
  return `<svg class="review-bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("topReviewCounts")}">${bars}</svg>`;
}

export function lockBanner() {
  if (!isLocked()) return "";
  const lock = state.settings.lock;
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")} · ${escapeHtml(lock.message || "")}</span></div></div>`;
}

export function demoBanner() {
  return state.settings?.demo ? `<div class="demo-note">${t("demoNote")}</div>` : "";
}

/* ---------- Overview ---------- */

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const counts = attentionCounts();
  const newThisWeek = candidates().filter(
    (item) => Date.now() - Date.parse(item.first_seen || 0) <= 7 * 24 * 3600 * 1000,
  );
  const bySource = SOURCE_KINDS.map((kind) => ({
    kind,
    count: newThisWeek.filter((item) => item.source === kind).length,
  })).filter((entry) => entry.count > 0);
  const movers = [...trendItems()].sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct)).slice(0, 5);
  els.content.innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    <div class="metrics">
      <a class="metric" href="#/candidates">
        <span>${t("candidatesThisWeek")}</span>
        <strong>${newThisWeek.length}</strong>
        <div class="metric-badges">${bySource.map((entry) => `<span class="badge source ${entry.kind}">${escapeHtml(enumLabel(entry.kind, "source"))} ${entry.count}</span>`).join("")}</div>
      </a>
      <a class="metric" href="#/candidates"><span>${t("inDevelopment")}</span><strong>${counts.develop}</strong></a>
      <a class="metric" href="#/candidates"><span>${t("watching")}</span><strong>${counts.watching}</strong></a>
      <a class="metric" href="#/decisions"><span>${t("avgMarginApproved")}</span><strong>${pct(metrics.avg_margin_approved_pct)}</strong></a>
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("humanWorkTitle")}</h2>
        <a class="attention-row" href="#/decisions">
          <span class="attention-count">${counts.review}</span>
          <span>${t("proposalsToReview")}</span>
        </a>
        <a class="attention-row" href="#/candidates">
          <span class="attention-count">${counts.toReview}</span>
          <span>${t("candidatesToReview")}</span>
        </a>
        <a class="attention-row" href="#/decisions">
          <span class="attention-count">${counts.awaitingHandoff}</span>
          <span>${t("awaitingHandoff")}</span>
        </a>
        <a class="attention-row" href="#/candidates">
          <span class="attention-count">${counts.staleWatches}</span>
          <span>${t("staleWatches")}</span>
        </a>
      </div>
      <div class="overview-panel">
        <h2>${t("topMovers")}</h2>
        ${
          movers
            .map(
              (item) => `
          <a class="mover-row" href="${item.candidate_id ? `#/candidates/${encodeURIComponent(item.candidate_id)}` : "#/trends"}">
            <span class="row-main">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(enumLabel(item.source, "source"))} · ${escapeHtml(item.metric_label)} ${compactNumber(item.metric_value)}</small>
            </span>
            ${sparkline(item.momentum)}
            ${deltaArrow(item.delta_pct)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="overview-panel wide">
        <h2>${t("sourceFreshness")}</h2>
        ${
          sources()
            .map(
              (item) => `
          <div class="freshness-row">
            <span class="row-main">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(enumLabel(item.method, "method"))} · ${item.items_7d} ${t("itemsWeek")}</small>
            </span>
            ${sourceBadge(item.kind)}
            <span class="muted">${t("lastSweep")} ${dateTime(item.last_sweep_at)}</span>
            ${statusBadge(item.status)}
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

/* ---------- Candidates ---------- */

export function filteredCandidates() {
  const query = state.query.trim().toLowerCase();
  if (!query) return candidates();
  return candidates().filter((item) =>
    [item.name, item.category, item.source, item.stage, item.competition_grade]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

/* ---------- Render ---------- */

export function render() {
  renderShell();
  if (state.route.view === "candidates" && state.route.id) renderCandidateDetail();
  else if (state.route.view === "candidates") renderCandidates();
  else if (state.route.view === "trends") renderTrends();
  else if (state.route.view === "decisions") renderDecisions();
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

function isEditing() {
  const active = document.activeElement;
  return active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type !== "search"));
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
  localStorage.setItem("kelly-picks-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
  } else {
    render();
  }
});

setInterval(() => {
  if (state.demo || state.saving || isEditing()) return;
  loadState().catch(() => {});
}, REFRESH_INTERVAL_MS);

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
