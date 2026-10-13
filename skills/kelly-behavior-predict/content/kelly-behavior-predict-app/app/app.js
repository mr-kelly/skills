import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Segments is the only Base with its own browsable list — one narrow review
// surface (trusted / needs recalibration) worked one segment after the next,
// so the list stays beside the record. `?peek=<id>` drives the split
// selection; `/<id>` always opens the full page. Declared once in
// config.js `ui.detail_modes`. On a phone every mode becomes a page
// (base-ui.css handles that).
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

const state = {
  info: null, // last provider.getState() payload
  run: null, // info.run
  decisions: {}, // info.decisions, keyed by segment_id
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-behavior-predict-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-behavior-predict.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  segmentsPage: byId("segmentsPage"),
  backtestPage: byId("backtestPage"),
  settingsPage: byId("settingsPage"),
  segmentsViewTitle: byId("segmentsViewTitle"),
  segmentsCount: byId("segmentsCount"),
  segmentsList: byId("segmentsList"),
  segmentsDetail: byId("segmentsDetail"),
  segmentsDetailBody: byId("segmentsDetailBody"),
  backtestBody: byId("backtestBody"),
  settingsBody: byId("settingsBody"),
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
  summaryAccuracy: byId("summary-accuracy"),
  accuracyFigure: byId("accuracy-figure"),
  countNeedsDecision: byId("count-needs-decision"),
  countSegments: byId("count-segments"),
  language: byId("language"),
};

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
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

function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function pct(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

function pct01(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&peek=…]`. Search and the peeked record live in
// the URL so refresh, shared links and Back restore the same list context.
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
  if (!RECORD_VIEWS.includes(view) && view !== "overview" && view !== "backtest" && view !== "settings") {
    view = "overview";
  }
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode,
    query: params.get("q") || "",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back
  // to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (els.search) els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
}

// Replace the current entry without a hashchange: search keystrokes should
// not each become a Back step.
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

function isConnected() {
  return Boolean(state.run?.segments?.length);
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.info = data;
  state.run = data.run;
  state.decisions = data.decisions || {};
  window.dispatchEvent(new CustomEvent("kelly-behavior-predict:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.info?.demo || location.hash) return;
  history.replaceState(null, "", `${location.pathname}${location.search}${state.info.demo_route || "#/overview"}`);
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
  if (els.search) els.search.placeholder = t("search");
  if (els.refresh) els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  els.segmentsViewTitle.textContent = t("segmentsTitle");
  els.segmentsViewTitle.title = t("segmentsHint");
  byId("backtestViewTitle").textContent = t("backtestTitle");
  byId("settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

function needsDecisionCount() {
  const segmentIds = (state.run?.segments || []).map((s) => s.segment_id);
  return segmentIds.filter((id) => !state.decisions[id]).length;
}

function viewLabel(view) {
  if (view === "segments") return t("segmentsTitle");
  if (view === "backtest") return t("backtestTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function renderShell() {
  applyI18n();
  const accuracy = state.run?.overall_backtest?.accuracy;
  els.syncStatus.textContent = isConnected()
    ? `${t("generated")}: ${state.info?.config_summary?.seed || ""}`
    : t("needsConnection");
  if (els.summaryAccuracy) els.summaryAccuracy.textContent = accuracy != null ? pct01(accuracy) : "—";
  if (els.accuracyFigure) els.accuracyFigure.textContent = accuracy != null ? Math.round(accuracy * 100) : "—";
  if (els.countNeedsDecision) els.countNeedsDecision.textContent = needsDecisionCount();
  if (els.countSegments) els.countSegments.textContent = (state.run?.segments || []).length;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent =
      accuracy != null ? `${pct01(accuracy)} · ${(state.run?.segments || []).length} ${t("segments")}` : t("empty");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
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

function funnelRows(funnel) {
  const stages = ["browse", "search", "compare", "booking_attempt", "complete"];
  const maxCount = Math.max(1, ...stages.map((s) => funnel.stage_counts[s] || 0));
  return stages
    .map((stage, index) => {
      const count = funnel.stage_counts[stage] || 0;
      const width = Math.max((count / maxCount) * 100, count > 0 ? 4 : 0);
      const drop = funnel.drop_off_pct?.[stage];
      const isFirst = index === 0;
      const isLast = index === stages.length - 1;
      return `
        <div class="funnel-row${isLast ? " funnel-row-complete" : ""}">
          <span class="funnel-stage-label">${escapeHtml(enumLabel(stage, "stage"))}</span>
          <span class="funnel-bar-track">
            <span class="funnel-bar-fill" style="width:${width}%"></span>
          </span>
          <span class="funnel-count">${count}</span>
          <span class="funnel-drop">${!isFirst && drop != null ? `<span class="funnel-drop-value">-${pct(drop)}</span>` : isFirst ? `<span class="funnel-drop-baseline">${escapeHtml(t("baseline"))}</span>` : ""}</span>
        </div>
      `;
    })
    .join("");
}

// ── Overview ─────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it already carries
// overall accuracy, segments needing a decision, and the segment count).
function overviewMetricsBand(run) {
  const totalSessions = run.segments.reduce((sum, s) => sum + s.session_count, 0);
  const completed = run.overall_funnel.stage_counts.complete || 0;
  const macroF1 = run.overall_backtest.macro_f1;
  return [
    [t("totalSessions"), String(totalSessions)],
    [t("completedSessions"), String(completed)],
    [t("macroF1"), pct01(macroF1)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderOverview() {
  const titleEl = byId("overviewTitle");
  const summaryEl = byId("overviewSummary");
  const metricsEl = byId("overviewMetrics");
  const bodyEl = byId("overviewBody");
  if (!isConnected()) {
    summaryEl.textContent = t("empty");
    metricsEl.innerHTML = "";
    bodyEl.innerHTML = `<div class="empty-state"><strong>${escapeHtml(t("needsConnection"))}</strong></div>`;
    return;
  }
  const run = state.run;
  const totalSessions = run.segments.reduce((sum, s) => sum + s.session_count, 0);
  summaryEl.textContent = `${totalSessions} ${t("sessionsLower")} · ${run.segments.length} ${t("segments")}`;
  metricsEl.innerHTML = overviewMetricsBand(run);
  bodyEl.innerHTML = `
    <div class="card overview-panel">
      <h2>${t("funnelTitle")}</h2>
      <div class="funnel-list">${funnelRows(run.overall_funnel)}</div>
    </div>
    <div class="rule-note">${escapeHtml(t("ruleNote"))}</div>
  `;
}

// ── Segments (record view, split detail) ────────────────────────────────
function decisionBadge(decision, { short = false } = {}) {
  if (!decision) {
    return `<span class="badge no_decision">${escapeHtml(short ? t("notDecidedShort") : t("noDecisionYet"))}</span>`;
  }
  return `<span class="badge ${decision.status}">${escapeHtml(t(decision.status === "trusted" ? "trusted" : "needsRecalibration"))}</span>`;
}

function actionBadge(action) {
  return `<span class="badge action-badge" data-action="${escapeHtml(action)}">${escapeHtml(enumLabel(action, "action"))}</span>`;
}

function filteredSegments() {
  const query = state.route.query.trim().toLowerCase();
  const segments = state.run?.segments || [];
  if (!query) return segments;
  return segments.filter(
    (s) => s.segment_id.toLowerCase().includes(query) || enumLabel(s.segment_id, "segment").toLowerCase().includes(query),
  );
}

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function segmentsTable(items) {
  return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("segmentCol")}</th>
          <th class="ws-col-wide">${t("decision")}</th>
          <th class="ws-col-num">${t("sessionsCol")}</th>
          <th>${t("dominantAction")}</th>
          <th class="ws-col-num">${t("accuracy")}</th>
          <th class="ws-col-num">${t("macroF1")}</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map((segment) => {
            const name = enumLabel(segment.segment_id, "segment");
            return `${rowOpen(segment.segment_id)}
              <td title="${escapeHtml(name)}"><span class="strong">${escapeHtml(name)}</span></td>
              <td>${decisionBadge(state.decisions[segment.segment_id], { short: true })}</td>
              <td class="ws-col-num">${segment.session_count}</td>
              <td>${actionBadge(segment.prediction_summary.dominant_action)}</td>
              <td class="ws-col-num">${pct01(segment.backtest.accuracy)}</td>
              <td class="ws-col-num">${pct01(segment.backtest.macro_f1)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSegmentsList() {
  if (!isConnected()) {
    els.segmentsList.innerHTML = `<div class="empty-state"><strong>${escapeHtml(t("needsConnection"))}</strong></div>`;
    els.segmentsCount.textContent = "";
    return;
  }
  const items = filteredSegments();
  els.segmentsCount.textContent = String(items.length);
  els.segmentsList.innerHTML = items.length
    ? segmentsTable(items)
    : `<div class="empty-state"><strong>${escapeHtml(t("noMatches"))}</strong></div>`;
}

function actionDistributionRows(summary) {
  const total = Object.values(summary.action_distribution).reduce((sum, v) => sum + v, 0) || 1;
  return Object.entries(summary.action_distribution)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([action, count]) => `
      <div class="driver-row">
        <span>
          ${escapeHtml(enumLabel(action, "action"))}
          <div class="driver-bar-track"><span class="driver-bar-fill" style="width:${(count / total) * 100}%"></span></div>
        </span>
        <span class="num">${count} (${((count / total) * 100).toFixed(0)}%)</span>
      </div>
    `,
    )
    .join("");
}

function triggerRows(triggers) {
  return triggers
    .map(
      (trigger) => `
      <div class="trigger-row${trigger.matched ? " trigger-row-matched" : ""}">
        <span class="trigger-mark" aria-hidden="true">${trigger.matched ? "✓" : "–"}</span>
        <span class="trigger-body">
          <span class="trigger-code">${escapeHtml(trigger.code.replaceAll("_", " "))}</span>
          <span class="trigger-desc muted">${escapeHtml(trigger.description)}</span>
        </span>
      </div>
    `,
    )
    .join("");
}

function sampleSessionsTable(sessions) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("sessionId")}</th>
            <th>${t("reachedStage")}</th>
            <th>${t("predicted")}</th>
            <th>${t("actual")}</th>
          </tr>
        </thead>
        <tbody>
          ${sessions
            .map(
              (s) => `
            <tr>
              <td>${escapeHtml(s.session_id)}</td>
              <td>${escapeHtml(enumLabel(s.reached_stage, "stage"))}</td>
              <td>${escapeHtml(enumLabel(s.predicted_action, "action"))}</td>
              <td class="${s.predicted_action === s.actual_action ? "positive" : "negative"}">${escapeHtml(enumLabel(s.actual_action, "action"))} <span class="muted">(${s.predicted_action === s.actual_action ? t("match") : t("mismatch")})</span></td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function submitDecision(segmentId, status) {
  const note = byId("decisionNote")?.value || "";
  try {
    const provider = await getProvider();
    await provider.decideSegment({ segment_id: segmentId, status, note });
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
    return;
  }
  await loadState();
}

function segmentDetail(entry) {
  const decision = state.decisions[entry.segment_id];
  return `
    <header class="detail-head">
      <h2>${escapeHtml(enumLabel(entry.segment_id, "segment"))}</h2>
      <p class="muted">${entry.session_count} ${t("sessionsLower")} · ${pct01(entry.backtest.accuracy)} ${t("accuracy").toLowerCase()}</p>
    </header>
    <div class="band-metrics">
      <div><span>${t("accuracy")}</span><strong>${pct01(entry.backtest.accuracy)}</strong></div>
      <div><span>${t("macroPrecision")}</span><strong>${pct01(entry.backtest.macro_precision)}</strong></div>
      <div><span>${t("macroRecall")}</span><strong>${pct01(entry.backtest.macro_recall)}</strong></div>
      <div><span>${t("macroF1")}</span><strong>${pct01(entry.backtest.macro_f1)}</strong></div>
    </div>
    <section class="detail-stack">
      <div class="card overview-panel">
        <h3>${t("funnelTitle")}</h3>
        <div class="funnel-list">${funnelRows(entry.funnel)}</div>
      </div>
      <div class="card overview-panel">
        <h3>${t("actionDistribution")}</h3>
        <div class="driver-list">${actionDistributionRows(entry.prediction_summary)}</div>
      </div>
      <div class="card overview-panel">
        <h3>${t("signals")}</h3>
        <div class="driver-list">${triggerRows(entry.prediction_summary.sample_triggers)}</div>
      </div>
      <div class="card overview-panel">
        <h3>${t("sampleSessions")}</h3>
        ${sampleSessionsTable(entry.sessions.slice(0, 12))}
      </div>
      <div class="decision-panel">
        <h3>${t("reviewNote")}</h3>
        <div class="decision-current">${t("lastDecision")}: ${decision ? `${escapeHtml(t(decision.status === "trusted" ? "trusted" : "needsRecalibration"))} — ${escapeHtml(decision.note || "")} (${new Date(decision.decided_at).toLocaleString()})` : escapeHtml(t("noDecisionYet"))}</div>
        <textarea id="decisionNote" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}">${escapeHtml(decision?.note || "")}</textarea>
        <div class="decision-actions">
          <button type="button" class="trusted" id="markTrusted">${escapeHtml(t("markTrusted"))}</button>
          <button type="button" class="needs_recalibration" id="markRecalibrate">${escapeHtml(t("markRecalibrate"))}</button>
        </div>
      </div>
      <div class="rule-note">${escapeHtml(t("ruleNote"))}</div>
    </section>
  `;
}

function renderSegmentsDetail() {
  const { selectedId, presentation } = state.route;
  const phone = isMobileLayout();
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, "segments");
  els.segmentsDetail.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.segmentsDetailBody.innerHTML = `<div class="ws-detail-empty">${escapeHtml(t("selectSegment"))}</div>`;
    return;
  }
  const entry = (state.run?.segments || []).find((s) => s.segment_id === selectedId);
  if (!entry) {
    if (presentation === "page") {
      location.hash = listUrl({ view: "segments", query: "" });
      return;
    }
    els.segmentsDetailBody.innerHTML = `<div class="empty-state"><strong>${escapeHtml(t("recordMissing"))}</strong><p>${escapeHtml(t("recordMissingDetail"))}</p></div>`;
    return;
  }
  els.segmentsDetailBody.innerHTML = segmentDetail(entry);
  byId("markTrusted")?.addEventListener("click", () => submitDecision(entry.segment_id, "trusted"));
  byId("markRecalibrate")?.addEventListener("click", () => submitDecision(entry.segment_id, "needs_recalibration"));
}

function renderSegmentsView() {
  renderSegmentsList();
  renderSegmentsDetail();
}

// ── Backtest (cross-segment report, not a record list) ─────────────────
function confusionTable(backtestSummary) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("action")}</th>
            <th class="num">${t("precision")}</th>
            <th class="num">${t("recall")}</th>
            <th class="num">${t("f1")}</th>
            <th class="num">${t("support")}</th>
          </tr>
        </thead>
        <tbody>
          ${backtestSummary.per_action
            .map(
              (cell) => `
            <tr>
              <td>${escapeHtml(enumLabel(cell.action, "action"))}</td>
              <td class="num">${pct01(cell.precision)}</td>
              <td class="num">${pct01(cell.recall)}</td>
              <td class="num">${pct01(cell.f1)}</td>
              <td class="num">${cell.support}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBacktest() {
  if (!isConnected()) {
    els.backtestBody.innerHTML = `<div class="empty-state"><strong>${escapeHtml(t("needsConnection"))}</strong></div>`;
    return;
  }
  const backtest = state.run.overall_backtest;
  els.backtestBody.innerHTML = `
    <div class="band-metrics">
      <div><span>${t("accuracy")}</span><strong>${pct01(backtest.accuracy)}</strong></div>
      <div><span>${t("macroPrecision")}</span><strong>${pct01(backtest.macro_precision)}</strong></div>
      <div><span>${t("macroRecall")}</span><strong>${pct01(backtest.macro_recall)}</strong></div>
      <div><span>${t("macroF1")}</span><strong>${pct01(backtest.macro_f1)}</strong></div>
    </div>
    <div class="card overview-panel overview-wide">
      <h2>${t("perAction")} — ${t("overview").toLowerCase()}</h2>
      ${confusionTable(backtest)}
    </div>
    ${state.run.segments
      .map(
        (entry) => `
      <div class="card overview-panel overview-wide">
        <h2>${escapeHtml(enumLabel(entry.segment_id, "segment"))} — ${pct01(entry.backtest.accuracy)}</h2>
        ${confusionTable(entry.backtest)}
      </div>
    `,
      )
      .join("")}
    <div class="rule-note">${escapeHtml(t("ruleNote"))}</div>
  `;
}

// ── Help & Settings ──────────────────────────────────────────────────────
function renderSettings() {
  const summary = state.info?.config_summary || {};
  els.settingsBody.innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(summary.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("productName")}</dt><dd>${escapeHtml(summary.product_name || "")}</dd>
          <dt>${t("vertical")}</dt><dd>${escapeHtml(summary.vertical || "")}</dd>
          <dt>${t("targetPrecision")}</dt><dd>${pct01(summary.target_precision || 0)}</dd>
          <dt>${t("generated")}</dt><dd>${escapeHtml(summary.seed || "")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("ruleNote")}</h2>
        <p class="muted">app/js/behavior-model.js — every number on this dashboard is reproducible from that file and the fixed seed shown above.</p>
      </section>
      <section id="settingsContent"></section>
    </div>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.info);
  const onSegments = ready && view === "segments";
  const body = document.body.classList;
  body.toggle("ws-detail-open", onSegments && Boolean(selectedId));
  body.toggle("ws-detail-page", onSegments && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-layout-split", onSegments && presentation !== "page");
  body.toggle("ws-searching", onSegments && Boolean(state.route.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.segmentsPage.hidden = !onSegments;
  els.backtestPage.hidden = !ready || view !== "backtest";
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onSegments) renderSegmentsView();
  else if (view === "backtest") renderBacktest();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ── Events ───────────────────────────────────────────────────────────────
els.segmentsList.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id, "segments");
  // Switching records while the split panel is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
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
els.search?.addEventListener("input", () => {
  replaceRoute(`#/segments${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.refresh?.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.mobileRefresh?.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-behavior-predict-language", state.lang);
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

if (els.search) els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
