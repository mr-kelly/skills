import { messages } from "./i18n/messages.js";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const state = {
  info: null, // last provider.getState() payload
  run: null, // info.run
  decisions: {}, // info.decisions, keyed by segment_id
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-behavior-predict-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-behavior-predict.sidebarCollapsed";

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
  summaryAccuracy: document.querySelector("#summary-accuracy"),
  accuracyFigure: document.querySelector("#accuracy-figure"),
  countNeedsDecision: document.querySelector("#count-needs-decision"),
  countSegments: document.querySelector("#count-segments"),
  language: document.querySelector("#language"),
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

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  render();
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
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
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

function renderOverview() {
  els.title.textContent = t("overview");
  if (!isConnected()) {
    els.subtitle.textContent = t("empty");
    els.content.innerHTML = `<div class="empty">${t("needsConnection")}</div>`;
    return;
  }
  const run = state.run;
  const totalSessions = run.segments.reduce((sum, s) => sum + s.session_count, 0);
  els.subtitle.textContent = `${totalSessions} sessions · ${run.segments.length} ${t("segments")}`;
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric"><span>${t("totalSessions")}</span><strong>${totalSessions}</strong></div>
      <div class="metric"><span>${t("segmentCount")}</span><strong>${run.segments.length}</strong></div>
      <div class="metric"><span>${t("overallAccuracy")}</span><strong>${pct01(run.overall_backtest.accuracy)}</strong></div>
      <div class="metric"><span>${t("needsDecision")}</span><strong>${needsDecisionCount()}</strong></div>
    </div>
    <div class="panel wide">
      <h2>${t("funnelTitle")}</h2>
      <div class="funnel-list">${funnelRows(run.overall_funnel)}</div>
    </div>
    <div class="rule-note">${escapeHtml(t("ruleNote"))}</div>
  `;
}

function decisionBadge(decision) {
  if (!decision) return `<span class="badge no_decision">${escapeHtml(t("noDecisionYet"))}</span>`;
  return `<span class="badge ${decision.status}">${escapeHtml(t(decision.status === "trusted" ? "trusted" : "needsRecalibration"))}</span>`;
}

function actionBadge(action) {
  return `<span class="badge action-badge" data-action="${escapeHtml(action)}">${escapeHtml(enumLabel(action, "action"))}</span>`;
}

function renderSegments() {
  els.title.textContent = t("segmentsTitle");
  if (!isConnected()) {
    els.subtitle.textContent = t("empty");
    els.content.innerHTML = `<div class="empty">${t("needsConnection")}</div>`;
    return;
  }
  const query = state.query.trim().toLowerCase();
  const segments = state.run.segments.filter(
    (s) =>
      !query ||
      s.segment_id.toLowerCase().includes(query) ||
      enumLabel(s.segment_id, "segment").toLowerCase().includes(query),
  );
  els.subtitle.textContent = `${segments.length} ${t("segments")}`;
  els.content.innerHTML = segments.length
    ? `<div class="segment-grid">${segments
        .map(
          (segment) => `
      <a class="segment-card" href="#/segments/${encodeURIComponent(segment.segment_id)}">
        <div class="row between">
          <strong class="segment-card-title">${escapeHtml(enumLabel(segment.segment_id, "segment"))}</strong>
          ${decisionBadge(state.decisions[segment.segment_id])}
        </div>
        <div class="muted segment-card-count">${segment.session_count} sessions</div>
        <div class="row between segment-card-action">
          <span class="eyebrow">${escapeHtml(t("dominantAction"))}</span>
          ${actionBadge(segment.prediction_summary.dominant_action)}
        </div>
        <div class="row stats segment-card-stats">
          <span><span class="stat-value">${pct01(segment.backtest.accuracy)}</span> ${t("accuracy").toLowerCase()}</span>
          <span><span class="stat-value">${pct01(segment.backtest.macro_f1)}</span> ${t("macroF1").toLowerCase()}</span>
        </div>
      </a>
    `,
        )
        .join("")}</div>`
    : `<div class="empty">${t("empty")}</div>`;
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
  const note = document.querySelector("#decisionNote")?.value || "";
  const provider = await getProvider();
  await provider.decideSegment({ segment_id: segmentId, status, note });
  await loadState();
  location.hash = `#/segments/${encodeURIComponent(segmentId)}`;
}

function renderSegmentDetail(id) {
  const entry = (state.run?.segments || []).find((s) => s.segment_id === id);
  if (!entry) {
    location.hash = "#/segments";
    return;
  }
  els.title.textContent = enumLabel(entry.segment_id, "segment");
  els.subtitle.textContent = `${entry.session_count} sessions`;
  const decision = state.decisions[entry.segment_id];
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/segments">← ${t("back")}</a>
        <div class="metrics">
          <div class="metric"><span>${t("accuracy")}</span><strong>${pct01(entry.backtest.accuracy)}</strong></div>
          <div class="metric"><span>${t("macroPrecision")}</span><strong>${pct01(entry.backtest.macro_precision)}</strong></div>
          <div class="metric"><span>${t("macroRecall")}</span><strong>${pct01(entry.backtest.macro_recall)}</strong></div>
          <div class="metric"><span>${t("macroF1")}</span><strong>${pct01(entry.backtest.macro_f1)}</strong></div>
        </div>
        <div class="panel">
          <h2>${t("funnelTitle")}</h2>
          <div class="funnel-list">${funnelRows(entry.funnel)}</div>
        </div>
        <div class="panel">
          <h2>${t("actionDistribution")}</h2>
          <div class="driver-list">${actionDistributionRows(entry.prediction_summary)}</div>
        </div>
        <div class="panel">
          <h2>${t("sampleSessions")}</h2>
          ${sampleSessionsTable(entry.sessions.slice(0, 12))}
        </div>
        <div class="rule-note">${escapeHtml(t("ruleNote"))}</div>
      </div>
      <aside class="detail-side">
        <h2>${t("signals")}</h2>
        <div class="driver-list">${triggerRows(entry.prediction_summary.sample_triggers)}</div>
        <div class="decision-panel">
          <h2>${t("reviewNote")}</h2>
          <div class="decision-current">${t("lastDecision")}: ${decision ? `${escapeHtml(t(decision.status === "trusted" ? "trusted" : "needsRecalibration"))} — ${escapeHtml(decision.note || "")} (${new Date(decision.decided_at).toLocaleString()})` : escapeHtml(t("noDecisionYet"))}</div>
          <textarea id="decisionNote" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}">${escapeHtml(decision?.note || "")}</textarea>
          <div class="decision-actions">
            <button type="button" class="trusted" id="markTrusted">${escapeHtml(t("markTrusted"))}</button>
            <button type="button" class="needs_recalibration" id="markRecalibrate">${escapeHtml(t("markRecalibrate"))}</button>
          </div>
        </div>
      </aside>
    </section>
  `;
  document
    .querySelector("#markTrusted")
    ?.addEventListener("click", () =>
      submitDecision(entry.segment_id, "trusted").catch((error) => alert(error.message)),
    );
  document
    .querySelector("#markRecalibrate")
    ?.addEventListener("click", () =>
      submitDecision(entry.segment_id, "needs_recalibration").catch((error) => alert(error.message)),
    );
}

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
  els.title.textContent = t("backtestTitle");
  if (!isConnected()) {
    els.subtitle.textContent = t("empty");
    els.content.innerHTML = `<div class="empty">${t("needsConnection")}</div>`;
    return;
  }
  const backtest = state.run.overall_backtest;
  els.subtitle.textContent = `${backtest.total} sessions`;
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric"><span>${t("accuracy")}</span><strong>${pct01(backtest.accuracy)}</strong></div>
      <div class="metric"><span>${t("macroPrecision")}</span><strong>${pct01(backtest.macro_precision)}</strong></div>
      <div class="metric"><span>${t("macroRecall")}</span><strong>${pct01(backtest.macro_recall)}</strong></div>
      <div class="metric"><span>${t("macroF1")}</span><strong>${pct01(backtest.macro_f1)}</strong></div>
    </div>
    <div class="panel wide">
      <h2>${t("perAction")} — overall</h2>
      ${confusionTable(backtest)}
    </div>
    ${state.run.segments
      .map(
        (entry) => `
      <div class="panel wide">
        <h2>${escapeHtml(enumLabel(entry.segment_id, "segment"))} — ${pct01(entry.backtest.accuracy)}</h2>
        ${confusionTable(entry.backtest)}
      </div>
    `,
      )
      .join("")}
    <div class="rule-note">${escapeHtml(t("ruleNote"))}</div>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.info?.config_summary || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
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
      <section>
        <h2>${t("ruleNote")}</h2>
        <p class="muted">app/app/js/behavior-model.js — every number on this dashboard is reproducible from that file and the fixed seed shown above.</p>
      </section>
      <section id="settingsContent"></section>
    </div>
  `;
}

function render() {
  renderShell();
  const view = state.route.view;
  if (view === "segments" && state.route.id) renderSegmentDetail(state.route.id);
  else if (view === "segments") renderSegments();
  else if (view === "backtest") renderBacktest();
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

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState().catch((error) => alert(error.message)));
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
    els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

syncResponsiveShell();
boot();
