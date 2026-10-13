import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Both views read the same `cases` Base —
// the choice is about the task, not the data:
//   regressions → split: the review queue is worked top to bottom, one
//                         draft after the next, so the queue stays beside
//                         the record.
//   cases       → page:  the full suite is browsed and dived into — the
//                         rubric bars + side-by-side transcript diff are
//                         long enough content that a reader stays a while.
// A `/record` path always opens the full page; `?peek=` drives the split.
// On a phone every mode is a page (base-ui.css handles that).
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const RUBRIC_KEYS = ["helpfulness", "correctness", "safety", "tone"];
const STATUS_VALUES = ["all", "needs_review", "blocking", "acceptable"];

export const state = {
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  run: null,
  release: null,
  settings: null,
  provider: null,
  // Cases opened by URL that are not on the loaded page (records.get).
  extraCases: new Map(),
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-agent-eval-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-agent-eval.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  lockBanner: byId("lockBanner"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewFilters: byId("viewFilters"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  pendingReviewFigure: byId("pending-review-figure"),
  countBlocking: byId("count-blocking"),
  countRelease: byId("count-release"),
  language: byId("language"),
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

function num1(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", { maximumFractionDigits: 1 }).format(
    Number(value || 0),
  );
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&category=…&status=…&peek=…]`. Search and the
// regression status filter live in the URL so refresh, shared links and Back
// restore the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  const status = params.get("status") || "all";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    category: params.get("category") || "",
    status: STATUS_VALUES.includes(status) ? status : "all",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.view === "cases" && route.category) params.set("category", route.category);
  if (route.view === "regressions" && route.status && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: state.route.query, status: "all", category: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: state.route.query, status: "all", category: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (els.search) els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
}

// Replace the current entry without a hashchange: search keystrokes and
// filter clicks should not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
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
  state.run = data.run;
  state.release = data.release_decision;
  state.settings = data;
  state.extraCases = new Map();
  window.dispatchEvent(new CustomEvent("kelly-agent-eval:state", { detail: data }));
  render();
  ensureSelectedRecord();
}

async function submitReview(id, action, note) {
  const provider = await getProvider();
  await provider.decideCase({ case_id: id, action, note });
  await loadState();
}

async function submitReleaseDecision(decision, note) {
  const provider = await getProvider();
  await provider.decideRelease({ decision, note });
  await loadState();
}

// The configured page size for the paginated `cases` Base, straight from config.js.
function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

function isPartial(key) {
  const total = state.totals?.[key];
  if (total == null) return false;
  return (state.run?.cases || []).length < total;
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
  const totalPages = pageCount(key);
  const page = totalPages == null ? Math.max(1, targetPage) : Math.min(Math.max(1, targetPage), totalPages);
  if (page === state.currentPage[key]) return;
  state.pageLoading[key] = true;
  render();
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
    replacePageRows("run.cases", result.rows);
    state.currentPage[key] = page;
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

// A case named by the URL (`?peek=` or a `/record` path) but not on the
// loaded page is read on its own (records.get) instead of loading more pages.
async function ensureSelectedRecord() {
  const { selectedId } = state.route;
  if (!state.run || !selectedId) return;
  if ((state.run.cases || []).some((item) => item.id === selectedId) || state.extraCases.has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extraCases.set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extraCases.set(selectedId, undefined);
  try {
    const row = await provider.getRecord(selectedId);
    state.extraCases.set(selectedId, row || null);
  } catch {
    state.extraCases.set(selectedId, null);
  }
  if (serial === routeSerial) render();
}

function caseById(id) {
  if (!id) return null;
  return (state.run?.cases || []).find((item) => item.id === id) || state.extraCases.get(id) || null;
}

// ── Shell / shared helpers ───────────────────────────────────────────────
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
  if (els.search) els.search.placeholder = t("search");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.detailExpand) els.detailExpand.textContent = t("openFullPage");
}

function isConnected() {
  return Boolean(state.run?.cases?.length);
}

function caseStatus(item) {
  if (item.decision?.action === "mark_blocking") return "blocking";
  if (item.decision?.action === "mark_acceptable") return "acceptable";
  if (item.regression) return "needs_review";
  return "pass";
}

function statusBadge(item) {
  const status = caseStatus(item);
  const label =
    status === "blocking"
      ? t("statusBlocking")
      : status === "acceptable"
        ? t("statusAcceptable")
        : status === "needs_review"
          ? t("statusNeedsReview")
          : t("statusPass");
  return `<span class="badge badge-dot ${status}"><span class="badge-dot-mark" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

function scoreDelta(item) {
  const delta = item.candidate.overall - item.baseline.overall;
  const sign = delta > 0 ? "+" : "";
  const cls = delta < -0.5 ? "negative" : delta > 0.5 ? "positive" : "";
  return `<span class="score-delta ${cls}">${sign}${num1(delta)}</span>`;
}

function viewLabel(view) {
  if (view === "regressions") return t("regressionsTitle");
  if (view === "cases") return t("casesTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function pendingReviewCount() {
  return state.run?.metrics?.pending_review ?? 0;
}

function renderShell() {
  applyI18n();
  const run = state.run;
  const metrics = run?.metrics || {};
  const connected = isConnected();
  if (els.syncStatus) {
    els.syncStatus.textContent = !state.settings
      ? t("loading")
      : !connected
        ? t("needsRun")
        : state.settings?.demo
          ? t("demoData")
          : t("liveData");
  }
  if (els.pendingReviewFigure) els.pendingReviewFigure.textContent = pendingReviewCount();
  if (els.countBlocking) els.countBlocking.textContent = metrics.blocking ?? 0;
  if (els.countRelease) {
    els.countRelease.textContent = state.release?.decision ? (state.release.decision === "approve" ? "✓" : "✕") : "—";
  }
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = !state.settings
      ? t("loading")
      : connected
        ? `${pendingReviewCount()} ${t("needDecision")}`
        : t("needsRun");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    const route = link.getAttribute("href").replace(/^#\//, "").split("?")[0].split("/")[0];
    link.classList.toggle("active", route === state.route.view);
  });
  if (els.lockBanner) {
    const owner = state.settings?.lock?.owner;
    els.lockBanner.hidden = !owner;
    if (owner) {
      els.lockBanner.innerHTML = `<strong>${escapeHtml(t("locked"))}</strong>`;
    }
  }
}

function emptyState(title, detail = "") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar and metrics band do not already show elsewhere
// on screen (pending review / blocking / release live in the sidebar;
// baseline/candidate pass rate is its own chart below).
function metricsBand() {
  const metrics = state.run?.metrics || {};
  return [
    [t("totalCases"), metrics.total_cases ?? 0],
    [t("improvementsCount"), metrics.improvements ?? 0],
    [t("acceptableCount"), metrics.acceptable ?? 0],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

function passRatePanel() {
  const metrics = state.run?.metrics || {};
  const run = state.run;
  const baseRate = metrics.baseline_pass_rate ?? 0;
  const candRate = metrics.candidate_pass_rate ?? 0;
  const delta = candRate - baseRate;
  const deltaCls = delta < -0.05 ? "negative" : delta > 0.05 ? "positive" : "";
  const deltaSign = delta > 0 ? "+" : "";
  return `
    <div class="compare-panel">
      <div class="compare-panel-head">
        <h2>${t("candidatePassRate")} <span class="muted">vs</span> ${t("baselinePassRate")}</h2>
        <span class="compare-delta ${deltaCls}">${deltaSign}${num1(delta)}pts</span>
      </div>
      <div class="compare-rows">
        <div class="compare-row">
          <div class="compare-row-label">${t("baselinePassRate")} <span class="muted">· ${escapeHtml(run.baseline_version)}</span></div>
          <div class="compare-bar-track">
            <span class="compare-bar baseline-bar" style="width:${baseRate}%"></span>
          </div>
          <div class="compare-row-value">${num1(baseRate)}%</div>
        </div>
        <div class="compare-row">
          <div class="compare-row-label">${t("candidatePassRate")} <span class="muted">· ${escapeHtml(run.candidate_version)}</span></div>
          <div class="compare-bar-track">
            <span class="compare-bar candidate-bar ${delta < 0 ? "regressed" : ""}" style="width:${candRate}%"></span>
          </div>
          <div class="compare-row-value">${num1(candRate)}%</div>
        </div>
      </div>
    </div>
  `;
}

function releasePanel() {
  const release = state.release;
  const locked = Boolean(state.settings?.lock?.owner);
  const statusText = release
    ? `${release.decision === "approve" ? t("approvedBy") : t("blockedBy")}${release.note ? ` — ${escapeHtml(release.note)}` : ""} · ${new Date(release.decided_at).toLocaleString()}`
    : t("releaseNotDecided");
  return `
    <div class="release-panel">
      <h2>${t("releaseDecision")}</h2>
      <div class="release-status ${release ? `badge ${release.decision === "approve" ? "acceptable" : "blocking"}` : "muted"}">${statusText}</div>
      <div class="release-actions">
        <textarea id="releaseNote" class="decision-note" placeholder="${escapeHtml(t("releaseNotePlaceholder"))}" ${locked ? "disabled" : ""}>${release ? escapeHtml(release.note || "") : ""}</textarea>
        <button class="approve" id="approveReleaseBtn" ${locked ? "disabled" : ""} title="${escapeHtml(t("approveRelease"))}">${t("approveRelease")}</button>
        <button class="block" id="blockReleaseBtn" ${locked ? "disabled" : ""} title="${escapeHtml(t("blockRelease"))}">${t("blockRelease")}</button>
      </div>
      <p class="muted" style="margin-top:10px">${escapeHtml(t("exportHint"))}</p>
    </div>
  `;
}

function bindReleasePanel() {
  document.querySelector("#approveReleaseBtn")?.addEventListener("click", () => {
    const note = document.querySelector("#releaseNote")?.value || "";
    submitReleaseDecision("approve", note).catch((error) => alert(error.message));
  });
  document.querySelector("#blockReleaseBtn")?.addEventListener("click", () => {
    const note = document.querySelector("#releaseNote")?.value || "";
    submitReleaseDecision("block", note).catch((error) => alert(error.message));
  });
}

// An overview preview row — always jumps into the review queue (split) with
// that case selected, since that is the task the number on the card points at.
function dueRow(item) {
  return `
    <a class="case-row" href="${recordUrl(item.id, "regressions")}">
      <span class="case-title"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(item.baseline.overall.toFixed(1))} → ${escapeHtml(item.candidate.overall.toFixed(1))}</span></span>
      ${scoreDelta(item)}
      <span class="badge ${item.regression ? "regression" : item.improvement ? "improvement" : ""}">${item.regression ? t("regressionsCount") : item.improvement ? t("improvementsCount") : t("statusPass")}</span>
      ${statusBadge(item)}
    </a>
  `;
}

function renderOverview() {
  const run = state.run;
  byId("overviewSummary").textContent = run?.generated_at
    ? `${t("generated")} ${new Date(run.generated_at).toLocaleString()}`
    : isConnected()
      ? ""
      : t("needsRun");
  byId("overviewMetrics").innerHTML = metricsBand();
  if (!isConnected()) {
    byId("overviewBody").innerHTML = emptyState(t("needsRun"));
    return;
  }
  const topRegressions = (run.cases || []).filter((c) => c.regression).slice(0, 6);
  byId("overviewBody").innerHTML = `
    ${passRatePanel()}
    ${releasePanel()}
    <section class="overview-panel wide">
      <h2>${t("regressionsTitle")}</h2>
      <div class="regression-list" style="margin-top:12px">
        ${topRegressions.length ? topRegressions.map(dueRow).join("") : emptyState(t("regressionsEmpty"))}
      </div>
    </section>
  `;
  bindReleasePanel();
}

// ── Record views (regressions / cases) ──────────────────────────────────────
function filteredCases(onlyRegressions) {
  const query = state.route.query.trim().toLowerCase();
  return (state.run?.cases || []).filter((item) => {
    if (onlyRegressions && !item.regression) return false;
    if (!onlyRegressions && state.route.category && item.category !== state.route.category) return false;
    if (onlyRegressions && state.route.status !== "all" && caseStatus(item) !== state.route.status) return false;
    if (!query) return true;
    return [item.title, item.category, item.prompt].filter(Boolean).some((v) => String(v).toLowerCase().includes(query));
  });
}

function categoryFilterChips() {
  const categories = [...new Set((state.run?.cases || []).map((c) => c.category))];
  const chip = (value, label) =>
    `<button type="button" class="category-chip ${state.route.category === value ? "active" : ""}" data-category="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
  return `<div class="category-legend">${chip("", t("allCategories"))}${categories.map((cat) => chip(cat, cat)).join("")}</div>`;
}

function statusFilterChips() {
  const options = [
    ["all", t("filterAll")],
    ["needs_review", t("filterNeedsReview")],
    ["blocking", t("filterBlocking")],
    ["acceptable", t("filterAcceptable")],
  ];
  return `<div class="category-legend">${options
    .map(
      ([value, label]) =>
        `<button type="button" class="category-chip ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)}</button>`,
    )
    .join("")}</div>`;
}

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, cls = ""]) => `<th${cls ? ` class="${cls}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const cell = (html, title = "", cls = "") =>
  `<td${cls ? ` class="${cls}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

// Column 2 is the status — the one fact the review queue's narrow split list
// needs beside the title (base-ui shows columns 1-2 in split by default, so
// this needs no `.ws-split-keep`). Category/scores stay for the full cases
// page and simply drop out of the narrow split queue.
function casesTable(items) {
  return `
    <table class="ws-table eval-table">
      ${tableHead([
        [t("caseLabel")],
        [t("status")],
        [t("category")],
        [`${t("baseline")} → ${t("candidate")}`, "ws-col-num"],
        ["Δ", "ws-col-num"],
      ])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(statusBadge(item))}
              ${cell(escapeHtml(item.category), item.category)}
              ${cell(`${item.baseline.overall.toFixed(1)} → ${item.candidate.overall.toFixed(1)}`, "", "ws-col-num")}
              ${cell(scoreDelta(item), "", "ws-col-num")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Page-jump pager: a click fetches exactly the one neighbouring/target page
// needed, using a cursor already learned — never an automatic loop.
function pagerControl(key) {
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
  return `<nav class="pager" aria-label="${t("pagination")}">
    <button type="button" class="pager-nav" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
    ${items.join("")}
    <button type="button" class="pager-nav" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    ${total == null ? "" : `<span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", total)}</span>`}
  </nav>`;
}

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(view === "cases" ? "casesHint" : "regressionsHint");
  if (!isConnected()) {
    els.viewCount.textContent = "";
    els.viewFilters.hidden = true;
    els.listPanel.innerHTML = emptyState(t("needsRun"));
    renderDetail();
    return;
  }
  const onlyRegressions = view === "regressions";
  const items = filteredCases(onlyRegressions);
  els.viewCount.textContent = String(items.length);
  els.viewFilters.hidden = false;
  els.viewFilters.innerHTML = view === "cases" ? categoryFilterChips() : statusFilterChips();
  const empty = onlyRegressions
    ? emptyState(t("regressionsEmpty"))
    : emptyState(state.route.query || state.route.category ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? casesTable(items) : empty}${isPartial("cases") || pageCount("cases") > 1 ? pagerControl("cases") : ""}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = isMobileLayout();
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, "cases");
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectRegression")) : "";
    return;
  }
  const item = caseById(selectedId);
  if (!item) {
    const pending = state.extraCases.has(selectedId) && state.extraCases.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending ? `<div class="empty-inline">${t("loading")}</div>` : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = caseDetailMarkup(item);
  bindDetailActions(item);
}

function rubricRow(key, baselineScores, candidateScores) {
  const delta = candidateScores[key] - baselineScores[key];
  const deltaCls = delta < 0 ? "negative" : delta > 0 ? "positive" : "muted";
  const deltaSign = delta > 0 ? "+" : "";
  return `
    <div class="rubric-group">
      <div class="rubric-row">
        <span class="rubric-key">${t(key)}</span>
        <span class="rubric-track">
          <span class="rubric-fill baseline-bar" style="width:${baselineScores[key]}%"></span>
        </span>
        <span class="num muted">${baselineScores[key]}</span>
      </div>
      <div class="rubric-row">
        <span class="rubric-key"></span>
        <span class="rubric-track">
          <span class="rubric-fill candidate-bar" style="width:${candidateScores[key]}%"></span>
        </span>
        <span class="num">${candidateScores[key]}</span>
      </div>
      <div class="rubric-delta ${deltaCls}">${deltaSign}${delta}</div>
    </div>
  `;
}

function caseDetailMarkup(item) {
  const locked = Boolean(state.settings?.lock?.owner);
  const decidedNote = item.decision?.note || "";
  return `
    <header class="detail-head">
      <h2>${escapeHtml(item.title)}</h2>
      <p class="muted">${escapeHtml(item.category)} · ${t("baseline")} ${item.baseline.overall.toFixed(1)} → ${t("candidate")} ${item.candidate.overall.toFixed(1)}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <div class="overview-panel">
          <h2>${t("prompt")}</h2>
          <p style="margin:10px 0 0; white-space:pre-wrap">${escapeHtml(item.prompt)}</p>
        </div>
        <div class="overview-panel" style="margin-top:14px">
          <h2>${t("score")}</h2>
          <div class="rubric-bars">
            ${RUBRIC_KEYS.map((key) => rubricRow(key, item.baseline.scores, item.candidate.scores)).join("")}
          </div>
        </div>
        <div class="overview-panel" style="margin-top:14px">
          <h2>${t("transcriptDiff")}</h2>
          <div class="transcript-diff">
            <div class="transcript-col transcript-baseline">
              <h3><span class="transcript-tag">${t("baseline")}</span><span class="badge ${item.baseline.pass ? "acceptable" : "blocking"}">${item.baseline.pass ? t("pass") : t("fail")}</span></h3>
              <p>${escapeHtml(item.baseline.transcript)}</p>
            </div>
            <div class="transcript-col transcript-candidate ${item.baseline.transcript !== item.candidate.transcript ? "diff-changed" : ""}">
              <h3><span class="transcript-tag">${t("candidate")}</span><span class="badge ${item.candidate.pass ? "acceptable" : "blocking"}">${item.candidate.pass ? t("pass") : t("fail")}</span></h3>
              <p>${escapeHtml(item.candidate.transcript)}</p>
            </div>
          </div>
        </div>
        ${
          item.regression
            ? `
        <div class="decision-panel">
          <h2>${t("reviewNote")}</h2>
          <textarea id="decisionNote" class="decision-note" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${locked ? "disabled" : ""}>${escapeHtml(decidedNote)}</textarea>
          <div class="decision-actions">
            <button class="blocking-btn" id="markBlockingBtn" ${locked ? "disabled" : ""}>${t("markBlocking")}</button>
            <button class="acceptable-btn" id="markAcceptableBtn" ${locked ? "disabled" : ""}>${t("markAcceptable")}</button>
          </div>
        </div>`
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("caseDetail")}</h2>
        <dl>
          <dt>${t("category")}</dt><dd>${escapeHtml(item.category)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(item)}</dd>
          <dt>${t("overallScore")}</dt><dd>${item.baseline.overall.toFixed(1)} → ${item.candidate.overall.toFixed(1)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function bindDetailActions(item) {
  document.querySelector("#markBlockingBtn")?.addEventListener("click", () => {
    const note = document.querySelector("#decisionNote")?.value.trim() || "";
    if (!note) {
      alert(t("noteRequired"));
      return;
    }
    submitReview(item.id, "mark_blocking", note).catch((error) => alert(error.message));
  });
  document.querySelector("#markAcceptableBtn")?.addEventListener("click", () => {
    const note = document.querySelector("#decisionNote")?.value.trim() || "";
    if (!note) {
      alert(t("noteRequired"));
      return;
    }
    submitReview(item.id, "mark_acceptable", note).catch((error) => alert(error.message));
  });
}

// ── Settings ─────────────────────────────────────────────────────────────
function renderSettings() {
  const summary = state.settings?.config_summary || {};
  byId("settingsContent").innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("teamName")}</dt><dd>${escapeHtml(summary.team_name || "")}</dd>
          <dt>${t("baselineVersion")}</dt><dd>${escapeHtml(summary.baseline_version || "")}</dd>
          <dt>${t("candidateVersion")}</dt><dd>${escapeHtml(summary.candidate_version || "")}</dd>
          <dt>${t("minPassRate")}</dt><dd>${escapeHtml(String(summary.release_policy?.min_candidate_pass_rate ?? ""))}%</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
    </div>
  `;
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.settings);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onRecordView) renderRecordView();
  else if (view === "settings") renderSettings();
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

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while the split is open replaces the entry, so Close
  // still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.viewFilters.addEventListener("click", (event) => {
  const catBtn = event.target.closest("[data-category]");
  if (catBtn) {
    replaceRoute(`#/cases${routeQuery({}, { ...state.route, category: catBtn.dataset.category })}`);
    return;
  }
  const statusBtn = event.target.closest("[data-status]");
  if (!statusBtn) return;
  replaceRoute(
    `#/regressions${routeQuery({ peek: state.route.peek }, { ...state.route, status: statusBtn.dataset.status })}`,
  );
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a draft only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.refresh.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.mobileRefresh?.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-agent-eval-language", state.lang);
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
    els.loadState.hidden = false;
    els.loadState.classList.add("error");
    els.loadState.textContent = error instanceof Error ? error.message : String(error);
  }
}

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
