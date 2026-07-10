import { messages } from "./i18n/messages.js";

const state = {
  info: null, // /api/state
  overview: null,
  segments: null,
  segmentDetail: null,
  backtest: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-behavior-predict-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  pendingNote: "",
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

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json();
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  state.info = await fetchJson(`/api/state?${params}`);
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
  const segmentIds = state.info?.segment_ids || [];
  const decisions = state.info?.decisions || {};
  return segmentIds.filter((id) => !decisions[id]).length;
}

function viewLabel(view) {
  if (view === "segments") return t("segmentsTitle");
  if (view === "backtest") return t("backtestTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function renderShell() {
  applyI18n();
  const accuracy = state.overview?.overall_backtest?.accuracy;
  els.syncStatus.textContent = state.info?.seed ? `${t("generated")}: ${state.info.seed}` : t("needsConnection");
  if (els.summaryAccuracy) els.summaryAccuracy.textContent = accuracy != null ? pct01(accuracy) : "—";
  if (els.accuracyFigure) els.accuracyFigure.textContent = accuracy != null ? Math.round(accuracy * 100) : "—";
  if (els.countNeedsDecision) els.countNeedsDecision.textContent = needsDecisionCount();
  if (els.countSegments) els.countSegments.textContent = (state.info?.segment_ids || []).length;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent =
      accuracy != null ? `${pct01(accuracy)} · ${(state.info?.segment_ids || []).length} ${t("segments")}` : t("empty");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function funnelRows(funnel) {
  const stages = ["browse", "search", "compare", "booking_attempt", "complete"];
  const maxCount = Math.max(1, ...stages.map((s) => funnel.stage_counts[s] || 0));
  return stages
    .map((stage) => {
      const count = funnel.stage_counts[stage] || 0;
      const width = (count / maxCount) * 100;
      const drop = funnel.drop_off_pct?.[stage];
      return `
        <div class="funnel-row">
          <span class="funnel-stage-label">${escapeHtml(enumLabel(stage, "stage"))}</span>
          <span class="funnel-bar-track"><span class="funnel-bar-fill" style="width:${width}%"></span></span>
          <span class="funnel-count">${count}</span>
          <span class="funnel-drop">${drop != null ? `-${pct(drop)}` : ""}</span>
        </div>
      `;
    })
    .join("");
}

async function renderOverview() {
  els.title.textContent = t("overview");
  if (!state.overview) state.overview = await fetchJson("/api/overview");
  const overview = state.overview;
  els.subtitle.textContent = `${overview.total_sessions} sessions · ${overview.segment_count} ${t("segments")}`;
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric"><span>${t("totalSessions")}</span><strong>${overview.total_sessions}</strong></div>
      <div class="metric"><span>${t("segmentCount")}</span><strong>${overview.segment_count}</strong></div>
      <div class="metric"><span>${t("overallAccuracy")}</span><strong>${pct01(overview.overall_backtest.accuracy)}</strong></div>
      <div class="metric"><span>${t("needsDecision")}</span><strong>${needsDecisionCount()}</strong></div>
    </div>
    <div class="panel wide">
      <h2>${t("funnelTitle")}</h2>
      <div class="funnel-list">${funnelRows(overview.overall_funnel)}</div>
    </div>
    <div class="rule-note">${escapeHtml(t("ruleNote"))}</div>
  `;
}

function decisionBadge(decision) {
  if (!decision) return `<span class="badge no_decision">${escapeHtml(t("noDecisionYet"))}</span>`;
  return `<span class="badge ${decision.status}">${escapeHtml(t(decision.status === "trusted" ? "trusted" : "needsRecalibration"))}</span>`;
}

async function renderSegments() {
  els.title.textContent = t("segmentsTitle");
  if (!state.segments) state.segments = await fetchJson("/api/segments");
  const query = state.query.trim().toLowerCase();
  const segments = state.segments.segments.filter(
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
        <div class="row between"><strong>${escapeHtml(enumLabel(segment.segment_id, "segment"))}</strong>${decisionBadge(segment.decision)}</div>
        <div class="muted">${segment.session_count} sessions</div>
        <div class="row between">
          <span class="muted">${escapeHtml(t("dominantAction"))}</span>
          <span class="badge">${escapeHtml(enumLabel(segment.prediction_summary.dominant_action, "action"))}</span>
        </div>
        <div class="row stats">
          <span>${t("accuracy")} ${pct01(segment.backtest.accuracy)}</span>
          <span>${t("macroF1")} ${pct01(segment.backtest.macro_f1)}</span>
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
      <div class="driver-row">
        <span>
          <strong>${trigger.matched ? "✓" : "✕"}</strong> ${escapeHtml(trigger.code.replaceAll("_", " "))}
          <div class="muted">${escapeHtml(trigger.description)}</div>
        </span>
        <span></span>
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
  await fetch(`/api/segments/${encodeURIComponent(segmentId)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  state.segmentDetail = null;
  state.segments = null;
  state.info = null;
  await loadState();
  location.hash = `#/segments/${encodeURIComponent(segmentId)}`;
}

async function renderSegmentDetail(id) {
  state.segmentDetail = await fetchJson(`/api/segments/${encodeURIComponent(id)}`).catch(() => null);
  if (!state.segmentDetail) {
    location.hash = "#/segments";
    return;
  }
  const entry = state.segmentDetail;
  els.title.textContent = enumLabel(entry.segment_id, "segment");
  els.subtitle.textContent = `${entry.session_count} sessions`;
  const decision = entry.decision;
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
          ${sampleSessionsTable(entry.sample_sessions)}
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
  document.querySelector("#markTrusted")?.addEventListener("click", () => submitDecision(entry.segment_id, "trusted"));
  document
    .querySelector("#markRecalibrate")
    ?.addEventListener("click", () => submitDecision(entry.segment_id, "needs_recalibration"));
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

async function renderBacktest() {
  els.title.textContent = t("backtestTitle");
  if (!state.backtest) state.backtest = await fetchJson("/api/backtest");
  const backtest = state.backtest;
  els.subtitle.textContent = `${backtest.overall.total} sessions`;
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric"><span>${t("accuracy")}</span><strong>${pct01(backtest.overall.accuracy)}</strong></div>
      <div class="metric"><span>${t("macroPrecision")}</span><strong>${pct01(backtest.overall.macro_precision)}</strong></div>
      <div class="metric"><span>${t("macroRecall")}</span><strong>${pct01(backtest.overall.macro_recall)}</strong></div>
      <div class="metric"><span>${t("macroF1")}</span><strong>${pct01(backtest.overall.macro_f1)}</strong></div>
    </div>
    <div class="panel wide">
      <h2>${t("perAction")} — overall</h2>
      ${confusionTable(backtest.overall)}
    </div>
    ${backtest.per_segment
      .map(
        (summary) => `
      <div class="panel wide">
        <h2>${escapeHtml(enumLabel(summary.segment_id, "segment"))} — ${pct01(summary.accuracy)}</h2>
        ${confusionTable(summary)}
      </div>
    `,
      )
      .join("")}
    <div class="rule-note">${escapeHtml(t("ruleNote"))}</div>
  `;
}

async function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.info?.config_summary || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(summary.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("productName")}</dt><dd>${escapeHtml(summary.product_name || "")}</dd>
          <dt>${t("vertical")}</dt><dd>${escapeHtml(summary.vertical || "")}</dd>
          <dt>${t("targetPrecision")}</dt><dd>${pct01(summary.target_precision || 0)}</dd>
          <dt>${t("generated")}</dt><dd>${escapeHtml(state.info?.seed || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("ruleNote")}</h2>
        <p class="muted">lib/predict.ts, lib/sessions.ts, lib/backtest.ts — every number on this dashboard is reproducible from those files and the fixed seed shown above.</p>
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  const view = state.route.view;
  const run =
    view === "segments" && state.route.id
      ? renderSegmentDetail(state.route.id)
      : view === "segments"
        ? renderSegments()
        : view === "backtest"
          ? renderBacktest()
          : view === "settings"
            ? renderSettings()
            : renderOverview();
  run
    .then(() => renderShell())
    .catch((error) => {
      els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
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

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => {
  state.overview = null;
  state.segments = null;
  state.segmentDetail = null;
  state.backtest = null;
  loadState();
});
els.mobileRefresh?.addEventListener("click", () => {
  state.overview = null;
  state.segments = null;
  state.segmentDetail = null;
  state.backtest = null;
  loadState();
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-behavior-predict-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
