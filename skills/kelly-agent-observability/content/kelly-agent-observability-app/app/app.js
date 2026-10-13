import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.2.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Detail mode per Base — declared once in config.js `ui.detail_modes`. Both
// agents and traces are `page`: an agent is a workplace you stay on for a
// minute (metrics, sparkline, recent traces, the handoff form); a trace is
// drilled into from its agent to read one step timeline at a time. Neither
// uses `?peek=` — a page is always addressed by path, `#/<view>/<id>`.
// `handoffs` carries no mode: it is a flat append-only log, every field
// already on the row, so no record ever opens.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = ["agents", "handoffs", "traces"];
// Bases with their own Prev/Next browsed list. `traces` has none (it has no
// standalone list — see DETAIL_MODES above); `records.list` only exposes a
// forward keyset cursor, so only a neighbouring page is ever reachable.
const PAGE_BINDINGS = { agents: { path: "fleet.agents" }, handoffs: { path: "handoffs" } };

export const state = {
  fleet: null,
  summary: null,
  handoffs: [],
  bootstrap: null,
  provider: null,
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  route: parseRoute(),
  query: "",
  sort: { key: "calls_24h", dir: "desc" },
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-agent-observability-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  busy: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-agent-observability.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  overviewSummary: byId("overviewSummary"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewSearch: byId("viewSearch"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  degradedCount: byId("summary-degraded-count"),
  agentCount: byId("count-agents"),
  handoffCount: byId("count-handoffs"),
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

function tNested(group, key) {
  return messages[activeLang()]?.[group]?.[key] || messages.en[group]?.[key] || key;
}

function money(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2,
  }).format(n);
}

function num(value, digits = 0) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function pct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function ms(value) {
  const n = Number(value || 0);
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}

function statusClass(status) {
  return status === "critical" ? "negative" : status === "degraded" ? "warn" : "positive";
}

function capitalize(value) {
  const s = String(value || "");
  return s ? s[0].toUpperCase() + s.slice(1) : s;
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

// ── Routing ──────────────────────────────────────────────────────────────
// `#/<view>[/<record>]`. Both detail modes are `page`, so a record is always
// in the path — there is no `?peek=`, no drawer, no split. `traces` has no
// list of its own (see DETAIL_MODES above), so a bare `#/traces` redirects.
function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  if (view === "traces" && !id) view = "overview";
  const selectedId = DETAIL_MODES[view] ? id : "";
  return { view, id, selectedId };
}

function setRoute() {
  const previousView = state.route.view;
  state.route = parseRoute();
  if (state.route.view !== previousView) state.query = "";
  els.search.value = state.query;
  setMobileSidebarOpen(false);
  render();
}

export function listUrl(view) {
  return `#/${view}`;
}

export function recordUrl(view, id) {
  return `#/${view}/${encodeURIComponent(id)}`;
}

function closeDetail() {
  location.hash = listUrl(state.route.view === "traces" ? "agents" : state.route.view);
}

// ── Data ─────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    if (!PAGE_BINDINGS[key]) continue;
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.fleet = data.fleet;
  state.summary = data.summary;
  state.handoffs = data.handoffs || [];
  state.bootstrap = data;
  window.dispatchEvent(new CustomEvent("kelly-agent-observability:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.bootstrap?.demo || location.hash) return;
  const scenario = state.bootstrap.demo_scenario || "overview";
  const route =
    scenario === "agents"
      ? "#/agents"
      : scenario === "trace"
        ? `#/traces/${encodeURIComponent(state.fleet.traces.find((tr) => tr.status === "error")?.trace_id || "")}`
        : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

// The configured page size for a paginated Base, straight from config.js.
function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — a later page is loaded, or
// one is known to exist. Anything counted from loaded rows must say so.
function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
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

// Replaces the displayed page with a NEIGHBOURING one: one request per click,
// using a cursor already in hand. `records.list` only exposes a forward
// keyset cursor with no offset, so this never jumps — Prev/Next only, never a
// numbered pager that would read every page in between to reach page N.
async function goToPage(key, targetPage) {
  const binding = PAGE_BINDINGS[key];
  const cursors = state.pageCursors[key];
  if (!binding || !cursors || state.pageLoading[key]) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return;
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[targetPage - 1]);
    replacePageRows(binding.path, rows);
    cursors[targetPage] = nextCursor;
    state.currentPage[key] = targetPage;
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  const summary = total == null ? "" : t("pageOf").replace("{current}", current).replace("{total}", total);
  return `
    <nav class="pager" aria-label="${escapeHtml(t("pagination"))}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      ${summary ? `<span class="pager-summary">${escapeHtml(summary)}</span>` : ""}
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>
  `;
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
  byId("overviewTitle").textContent = t("overview");
  byId("settingsTitle").textContent = t("settings");
}

function isConnected() {
  return Boolean(state.fleet?.agents?.length);
}

function agentName(agentId) {
  return state.fleet?.agents?.find((a) => a.agent_id === agentId)?.name || agentId;
}

function agentMetrics(agentId) {
  return state.fleet?.metrics?.find((m) => m.agent_id === agentId) || null;
}

function agents() {
  return state.fleet?.agents || [];
}

function traces() {
  return state.fleet?.traces || [];
}

function renderShell() {
  applyI18n();
  const summary = state.summary || {};
  const connected = isConnected();
  els.syncStatus.textContent = connected
    ? state.fleet?.generated_at
      ? `${t("generated")} ${new Date(state.fleet.generated_at).toLocaleString()}`
      : t("synced")
    : t("needsConnection");
  if (els.degradedCount) els.degradedCount.textContent = num(summary.degraded_agent_count || 0);
  if (els.agentCount) els.agentCount.textContent = num(summary.agent_count || 0);
  if (els.handoffCount) els.handoffCount.textContent = recordCountLabel("handoffs", state.handoffs.length);
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = connected
      ? `${num(summary.total_calls_24h || 0)} ${t("totalCalls").toLowerCase()}`
      : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "agents") return t("agentsTitle");
  if (view === "traces") return t("traceDetail");
  if (view === "handoffs") return t("handoffHistory");
  if (view === "settings") return t("settings");
  return t("overview");
}

function recordCountLabel(key, loadedCount) {
  const total = state.totals?.[key];
  if (total != null) return total;
  return `${loadedCount}${isPartial(key) ? "+" : ""}`;
}

// ── Overview ─────────────────────────────────────────────────────────────
// Three numbers the nav does not already show: the sidebar's attention block
// already names the degraded-agent count, so the band covers the two totals
// and the one agent-health bucket (critical) that is nowhere else on screen.
function metricsBand() {
  const s = state.summary || {};
  return [
    [t("totalCalls"), num(s.total_calls_24h), ""],
    [t("totalCost"), money(s.total_cost_today_usd), ""],
    [t("criticalAgents"), num(s.critical_agent_count), "negative"],
  ]
    .map(([label, value, cls]) => `<div><span>${escapeHtml(label)}</span><strong class="${cls}">${value}</strong></div>`)
    .join("");
}

function sparkline(hourly) {
  const last24 = (hourly || []).slice(-24);
  if (!last24.length) return "";
  const max = Math.max(1, ...last24.map((b) => b.calls));
  const bars = last24
    .map((b) => {
      const heightPct = Math.max(4, Math.round((b.calls / max) * 100));
      const hasErrors = b.errors > 0;
      return `<span class="spark-bar${hasErrors ? " spark-bar-error" : ""}" style="height:${heightPct}%" title="${new Date(b.hour).toLocaleString()}: ${b.calls} calls, ${b.errors} errors"></span>`;
    })
    .join("");
  return `<div class="sparkline">${bars}</div><div class="muted spark-caption">${t("sparklineCaption")}</div>`;
}

function demoBanner() {
  if (!state.bootstrap?.demo) return "";
  return `<div class="warnings"><div class="info"><strong>${t("demoModeTitle")}</strong><span>${t("demoModeBody")}</span></div></div>`;
}

function emptyState(title) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong></div>`;
}

function fleetOverviewGrid() {
  const cards = agents()
    .map((agent) => {
      const metrics = agentMetrics(agent.agent_id) || {};
      return `
      <a class="overview-panel agent-card" href="${recordUrl("agents", agent.agent_id)}">
        <div class="row between">
          <strong>${escapeHtml(agent.name)}</strong>
          <span class="badge status-${metrics.status || "healthy"}"><span class="status-dot"></span>${t(`status${capitalize(metrics.status || "healthy")}`)}</span>
        </div>
        <p class="muted">${escapeHtml(agent.description)}</p>
        ${sparkline(metrics.hourly)}
        <div class="row stats">
          <span>${num(metrics.calls_24h)} ${t("totalCalls").toLowerCase()}</span>
          <span class="${statusClass(metrics.status)}">${pct(metrics.error_rate_pct)} ${t("errorRate").toLowerCase()}</span>
        </div>
      </a>
    `;
    })
    .join("");
  return `<section class="overview-grid agent-overview-grid">${cards}</section>`;
}

function renderOverview() {
  els.overviewSummary.textContent = state.fleet?.generated_at
    ? `${t("generated")} ${new Date(state.fleet.generated_at).toLocaleString()}`
    : t("empty");
  els.overviewMetrics.innerHTML = metricsBand();
  if (!isConnected()) {
    els.overviewBody.innerHTML = emptyState(t("setupNeeded"));
    return;
  }
  els.overviewBody.innerHTML = `${demoBanner()}${fleetOverviewGrid()}`;
}

// ── Record views (agents list/detail, handoffs list, trace detail) ───────
function sortHeader(key, label, cls = "") {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${cls} ${active ? "active" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
}

function sortedAgentRows(rows) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = key === "name" ? a.name : a.metrics?.[key];
    const bv = key === "name" ? b.name : b.metrics?.[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredAgentRows() {
  const query = state.query.trim().toLowerCase();
  const rows = agents().map((agent) => ({ ...agent, metrics: agentMetrics(agent.agent_id) }));
  if (!query) return rows;
  return rows.filter((row) => matches([row.name, row.agent_id, row.description], query));
}

function filteredHandoffRows() {
  const query = state.query.trim().toLowerCase();
  const rows = [...state.handoffs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (!query) return rows;
  return rows.filter((row) =>
    matches([row.created_by, row.target_id, row.agent_id, row.note, tNested("handoffStatus", row.status)], query),
  );
}

function agentsTable(rows) {
  return `
    <table class="ws-table">
      <thead>
        <tr>
          ${sortHeader("name", t("agentsTitle"))}
          ${sortHeader("calls_24h", t("callVolume"), "ws-col-num")}
          ${sortHeader("p50_latency_ms", t("p50Latency"), "ws-col-num")}
          ${sortHeader("p95_latency_ms", t("p95Latency"), "ws-col-num")}
          ${sortHeader("error_rate_pct", t("errorRate"), "ws-col-num")}
          ${sortHeader("cost_today_usd", t("costToday"), "ws-col-num")}
          ${sortHeader("status", t("status"))}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const m = row.metrics || {};
            return `
          <tr data-id="${escapeHtml(row.agent_id)}">
            <td><span class="strong">${escapeHtml(row.name)}</span></td>
            <td class="ws-col-num">${num(m.calls_24h)}</td>
            <td class="ws-col-num">${ms(m.p50_latency_ms)}</td>
            <td class="ws-col-num">${ms(m.p95_latency_ms)}</td>
            <td class="ws-col-num ${statusClass(m.status)}">${pct(m.error_rate_pct)}</td>
            <td class="ws-col-num">${money(m.cost_today_usd)}</td>
            <td><span class="badge status-${m.status || "healthy"}"><span class="status-dot"></span>${t(`status${capitalize(m.status || "healthy")}`)}</span></td>
          </tr>
        `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function handoffsTable(rows) {
  return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("createdBy")}</th>
          <th>${tNested("targetType", "agent") || "Target"}</th>
          <th>${t("status")}</th>
          <th class="ws-col-wide">${t("handoffNote")}</th>
          <th class="ws-col-num">${t("startedAt")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (h) => `
          <tr>
            <td>${escapeHtml(h.created_by)}</td>
            <td>${escapeHtml(tNested("targetType", h.target_type))} · <a href="${recordUrl(h.target_type === "agent" ? "agents" : "traces", h.target_id)}">${escapeHtml(h.target_id)}</a></td>
            <td><span class="badge status-${h.status === "needs_investigation" ? "critical" : "healthy"}">${escapeHtml(tNested("handoffStatus", h.status))}</span></td>
            <td class="ws-col-wide">${escapeHtml(h.note || "")}</td>
            <td class="ws-col-num">${new Date(h.created_at).toLocaleString()}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderList() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewSearch.hidden = false;
  if (view === "agents") {
    const rows = sortedAgentRows(filteredAgentRows());
    els.viewCount.textContent = recordCountLabel("agents", rows.length);
    if (!isConnected()) {
      els.listPanel.innerHTML = emptyState(t("setupNeeded"));
      return;
    }
    els.listPanel.innerHTML = rows.length
      ? `${agentsTable(rows)}${pagerControl("agents")}`
      : emptyState(state.query ? t("noMatches") : t("empty"));
    return;
  }
  // handoffs: a plain append-only log — every field is already on the row, so
  // there is no detail to open and detailPanel never shows for this view.
  const rows = filteredHandoffRows();
  els.viewCount.textContent = recordCountLabel("handoffs", rows.length);
  els.listPanel.innerHTML = rows.length
    ? `${handoffsTable(rows)}${pagerControl("handoffs")}`
    : emptyState(state.query ? t("noMatches") : t("noHandoffs"));
}

function agentMetricTiles(metrics) {
  return `
    <div class="metrics">
      <div class="metric"><span>${t("callVolume")}</span><strong>${num(metrics.calls_24h)}</strong></div>
      <div class="metric"><span>${t("p50Latency")}</span><strong>${ms(metrics.p50_latency_ms)}</strong></div>
      <div class="metric"><span>${t("p95Latency")}</span><strong>${ms(metrics.p95_latency_ms)}</strong></div>
      <div class="metric"><span>${t("errorRate")}</span><strong class="${statusClass(metrics.status)}">${pct(metrics.error_rate_pct)}</strong></div>
      <div class="metric"><span>${t("costToday")}</span><strong>${money(metrics.cost_today_usd)}</strong></div>
      <div class="metric"><span>${t("cost7d")}</span><strong>${money(metrics.cost_7d_usd)}</strong></div>
    </div>
  `;
}

function tracesMiniTable(agentId) {
  const rows = traces()
    .filter((tr) => tr.agent_id === agentId)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
    .slice(0, 30);
  if (!rows.length) return emptyState(t("empty"));
  return `
    <table class="mini-table">
      <thead>
        <tr>
          <th>${t("traceId")}</th>
          <th>${t("startedAt")}</th>
          <th class="num">${t("duration")}</th>
          <th class="num">${t("steps")}</th>
          <th class="num">${t("cost")}</th>
          <th class="num">${t("status")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (tr) => `
          <tr>
            <td><a href="${recordUrl("traces", tr.trace_id)}"><span class="strong">${escapeHtml(tr.trace_id)}</span></a></td>
            <td>${new Date(tr.started_at).toLocaleString()}</td>
            <td class="num">${ms(tr.duration_ms)}</td>
            <td class="num">${num(tr.steps.length)}</td>
            <td class="num">${money(tr.cost_usd)}</td>
            <td class="num ${tr.status === "error" ? "negative" : "positive"}">${tr.status === "error" ? t("error") : t("ok")}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function handoffForm(targetType, targetId, agentId) {
  const disabled = state.busy ? "disabled" : "";
  return `
    <form class="handoff-form" data-handoff-form data-target-type="${escapeHtml(targetType)}" data-target-id="${escapeHtml(targetId)}" data-agent-id="${escapeHtml(agentId)}">
      <label class="handoff-label" for="handoffNote">${t("handoffNote")}</label>
      <textarea id="handoffNote" name="note" rows="3" placeholder="${escapeHtml(t("handoffNotePlaceholder"))}" ${disabled}></textarea>
      <div class="handoff-actions">
        <button type="submit" data-status="acknowledged" class="button" ${disabled}>${t("acknowledge")}</button>
        <button type="submit" data-status="needs_investigation" class="button primary" ${disabled}>${t("needsInvestigation")}</button>
      </div>
      <div class="handoff-form-message" data-handoff-message hidden></div>
    </form>
  `;
}

function agentDetail(agent) {
  const metrics = agentMetrics(agent.agent_id) || {};
  return `
    <header class="detail-head">
      <h2>${escapeHtml(agent.name)}</h2>
      <p class="muted">${escapeHtml(agent.description)}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        ${agentMetricTiles(metrics)}
        ${sparkline(metrics.hourly)}
        <h3>${t("recentTraces")}</h3>
        ${tracesMiniTable(agent.agent_id)}
      </div>
      <aside class="card detail-side">
        <h3>${t("acknowledge")} / ${t("needsInvestigation")}</h3>
        ${handoffForm("agent", agent.agent_id, agent.agent_id)}
      </aside>
    </section>
  `;
}

function traceStepTimeline(trace) {
  const lastIndex = trace.steps.length - 1;
  return `
    <ol class="step-timeline">
      ${trace.steps
        .map((step, index) => {
          const isBreak = step.status === "error" && step.step_id === trace.broke_at_step_id;
          const isLast = index === lastIndex;
          return `
        <li class="step-item ${step.status === "error" ? "step-error" : "step-ok"} ${isBreak ? "step-break" : ""}">
          <div class="step-node">
            <div class="step-index">${step.status === "error" ? "!" : "✓"}</div>
            ${isLast ? "" : `<div class="step-connector"></div>`}
          </div>
          <div class="step-body">
            <div class="row between">
              <strong>${escapeHtml(step.name)}</strong>
              <span class="num step-duration">${ms(step.duration_ms)}</span>
            </div>
            <div class="muted step-status-line">${step.status === "error" ? `⚠ ${escapeHtml(step.detail || t("error"))}` : t("ok")}</div>
            ${isBreak ? `<div class="chain-break-flag">${t("chainBroke")}</div>` : ""}
          </div>
        </li>
      `;
        })
        .join("")}
    </ol>
  `;
}

function traceDetail(trace) {
  return `
    <header class="detail-head">
      <h2>${escapeHtml(trace.trace_id)}</h2>
      <p class="muted">${escapeHtml(agentName(trace.agent_id))} · ${new Date(trace.started_at).toLocaleString()}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <div class="metrics">
          <div class="metric"><span>${t("duration")}</span><strong>${ms(trace.duration_ms)}</strong></div>
          <div class="metric"><span>${t("cost")}</span><strong>${money(trace.cost_usd)}</strong></div>
          <div class="metric"><span>${t("steps")}</span><strong>${num(trace.steps.length)}</strong></div>
          <div class="metric"><span>${t("status")}</span><strong class="${trace.status === "error" ? "negative" : "positive"}">${trace.status === "error" ? t("error") : t("ok")}</strong></div>
        </div>
        <h3>${t("stepTimeline")}</h3>
        ${traceStepTimeline(trace)}
      </div>
      <aside class="card detail-side">
        <h3>${t("acknowledge")} / ${t("needsInvestigation")}</h3>
        ${handoffForm("trace", trace.trace_id, trace.agent_id)}
      </aside>
    </section>
  `;
}

function renderDetail() {
  const { view, selectedId } = state.route;
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = "";
    return;
  }
  if (view === "agents") {
    const agent = agents().find((a) => a.agent_id === selectedId);
    els.detailBody.innerHTML = agent ? agentDetail(agent) : emptyState(t("empty"));
    return;
  }
  if (view === "traces") {
    const trace = traces().find((tr) => tr.trace_id === selectedId);
    els.detailBody.innerHTML = trace ? traceDetail(trace) : emptyState(t("empty"));
  }
}

function renderRecordView() {
  const { view } = state.route;
  if (view === "traces") {
    // Detail-only: no list for this view (see DETAIL_MODES), so skip
    // straight to the record — base-ui's `ws-detail-page` hides `.ws-list`.
    els.viewTitle.textContent = viewLabel(view);
    els.viewSearch.hidden = true;
    els.listPanel.innerHTML = "";
  } else {
    renderList();
  }
}

// ── Help & Settings ───────────────────────────────────────────────────────
function renderSettings() {
  byId("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.bootstrap?.data_provider || "busabase")}</dd>
          <dt>${t("agentCount")}</dt><dd>${num(state.summary?.agent_count || 0)}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("thresholds")}</h2>
        <dl>
          <dt>${t("errorRateDegraded")}</dt><dd>3%</dd>
          <dt>${t("errorRateCritical")}</dt><dd>8%</dd>
          <dt>${t("latencyDegraded")}</dt><dd>4000ms</dd>
          <dt>${t("latencyCritical")}</dt><dd>8000ms</dd>
        </dl>
      </section>
    </div>
  `;
}

// ── Render dispatch ────────────────────────────────────────────────────────
function render() {
  renderShell();
  const { view, selectedId } = state.route;
  const ready = Boolean(state.fleet);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && Boolean(selectedId));
  body.toggle("ws-searching", onRecordView && Boolean(state.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onRecordView) {
    renderRecordView();
    renderDetail();
    // After both the list and the detail panel are in the DOM — a handoff
    // form can live in either (agent/trace page detail).
    bindHandoffForms();
  } else if (view === "settings") renderSettings();
  else renderOverview();
}

// Direct handoff write: acknowledge / needs-investigation, applied straight
// through the active provider (Busabase or demo) — there is no separate
// approval step, since a handoff is always a brand-new row (never an update
// to the agent/trace's own record). Demo mode never writes anywhere; it only
// reflects the note in the in-memory handoff list already rendered.
function bindHandoffForms() {
  document.querySelectorAll("[data-handoff-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const status = submitter?.dataset.status || "acknowledged";
      const note = form.querySelector("textarea[name='note']").value.trim();
      const messageEl = form.querySelector("[data-handoff-message]");
      const payload = {
        target_type: form.dataset.targetType,
        target_id: form.dataset.targetId,
        agent_id: form.dataset.agentId,
        status,
        note,
        created_by: "operator",
      };
      if (state.demo) {
        state.handoffs.push({ handoff_id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload });
        messageEl.hidden = false;
        messageEl.textContent = t("handoffSubmitted");
        messageEl.className = "handoff-form-message positive";
        form.querySelector("textarea[name='note']").value = "";
        if (els.handoffCount) els.handoffCount.textContent = recordCountLabel("handoffs", state.handoffs.length);
        return;
      }
      state.busy = true;
      try {
        const provider = await getProvider();
        const handoff = await provider.submitHandoff(payload);
        state.handoffs.push(handoff);
        if (state.totals.handoffs != null) state.totals.handoffs += 1;
        messageEl.hidden = false;
        messageEl.textContent = t("handoffSubmitted");
        messageEl.className = "handoff-form-message positive";
        form.querySelector("textarea[name='note']").value = "";
        if (els.handoffCount) els.handoffCount.textContent = recordCountLabel("handoffs", state.handoffs.length);
      } catch {
        messageEl.hidden = false;
        messageEl.textContent = t("handoffError");
        messageEl.className = "handoff-form-message negative";
      } finally {
        state.busy = false;
      }
    });
  });
}

// ── Events ───────────────────────────────────────────────────────────────
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
    return;
  }
  const header = event.target.closest("[data-sort]");
  if (header) {
    const key = header.dataset.sort;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    else state.sort = { key, dir: key === "name" ? "asc" : "desc" };
    render();
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  location.hash = recordUrl(state.route.view, row.dataset.id);
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
  }
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-agent-observability-language", state.lang);
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

els.search.value = state.query;
// The phone top bar already names the current view (#mobileViewTitle), so
// hide the record view's own h1 on phones — base-ui.css's
// `body.ws-has-mobile-bar .ws-title h1 { display: none }` (phone-only).
document.body.classList.add("ws-has-mobile-bar");
syncResponsiveShell();
boot();
