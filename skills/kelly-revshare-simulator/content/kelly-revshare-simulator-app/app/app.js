import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { buildBatch, buildScenario } from "./js/simulator-model.js?v=0.1.0";

// Declared once, per Base. `scenarios` is the only record Base this app has;
// its detail always opens `page`: a scenario is a workplace of its own
// (chart, risk flags, editable inputs, the underwriting decision) that an
// analyst stays on for minutes, not a fact scanned in passing and returned
// from -- so there is no drawer/split peek, only `#/scenarios/<id>`.
const DETAIL_MODES = appConfig.ui?.detail_modes || { scenarios: "page" };

const state = {
  batch: null,
  settings: null,
  route: parseRoute(),
  query: "",
  compareIds: new Set(JSON.parse(localStorage.getItem("kelly-revshare-simulator.compare") || "[]")),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-revshare-simulator-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  busy: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-revshare-simulator.sidebarCollapsed";

const els = {
  loadState: document.querySelector("#loadState"),
  overviewPage: document.querySelector("#overviewPage"),
  overviewSummary: document.querySelector("#overviewSummary"),
  overviewMetrics: document.querySelector("#overviewMetrics"),
  overviewBody: document.querySelector("#overviewBody"),
  scenariosPage: document.querySelector("#scenariosPage"),
  scenariosTitle: document.querySelector("#scenariosTitle"),
  scenariosCount: document.querySelector("#scenariosCount"),
  scenarioFilters: document.querySelector("#scenarioFilters"),
  scenarioFilterSelect: document.querySelector("#scenarioFilterSelect"),
  scenariosList: document.querySelector("#scenariosList"),
  scenarioDetailBody: document.querySelector("#scenarioDetailBody"),
  comparisonPage: document.querySelector("#comparisonPage"),
  comparisonHint: document.querySelector("#comparisonHint"),
  comparisonBody: document.querySelector("#comparisonBody"),
  settingsPage: document.querySelector("#settingsPage"),
  settingsBody: document.querySelector("#settingsBody"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  countUndecided: document.querySelector("#count-undecided"),
  countApproved: document.querySelector("#count-approved"),
  countRejected: document.querySelector("#count-rejected"),
  language: document.querySelector("#language"),
  newScenarioBtn: document.querySelector("#newScenarioBtn"),
};

const pagination = createPagination({
  getProvider,
  pageSizes: Object.fromEntries(appConfig.bases.map((base) => [base.key, base.readLimit])),
  applyPage: (key, rows) => {
    state.batch = buildBatch(rows, { batchId: state.batch?.batch_id, generatedAt: state.batch?.generated_at });
  },
  render: () => render(),
  label: (key) => t(key),
  onError: (error) => {
    state.pageError = error instanceof Error ? error.message : String(error);
  },
});

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

function money(value, currency = state.settings?.config_summary?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function pct(value, digits = 1) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function num(value, digits = 2) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart || "");
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "", params };
}

function setRoute() {
  state.route = parseRoute();
  render();
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  pagination.reset(data.pagination, data.totals);
  closeConnectGate();
  state.batch = data.batch;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("kelly-revshare-simulator:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const first = state.batch?.scenarios?.[0]?.id;
  const route =
    scenario === "detail" && first
      ? `#/scenarios/${first}`
      : scenario === "comparison"
        ? "#/comparison"
        : scenario === "scenarios"
          ? "#/scenarios"
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
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.newScenarioBtn) els.newScenarioBtn.textContent = t("newScenario");
  if (els.scenariosTitle) els.scenariosTitle.title = t("scenariosHint");
}

function scenarios() {
  return state.batch?.scenarios || [];
}

function filteredScenarios(filter) {
  const query = state.query.trim().toLowerCase();
  return scenarios().filter((s) => {
    if (filter && filter !== "all") {
      if (filter === "undecided" && s.decision.action) return false;
      if (filter === "approved" && s.decision.action !== "approve_underwriting") return false;
      if (filter === "needs_revision" && s.decision.action !== "needs_revision") return false;
      if (filter === "rejected" && s.decision.action !== "reject") return false;
    }
    if (!query) return true;
    return [s.name, s.input.business_type].filter(Boolean).some((v) => String(v).toLowerCase().includes(query));
  });
}

function decisionBadgeClass(action) {
  if (action === "approve_underwriting") return "sev-info good";
  if (action === "needs_revision") return "sev-watch";
  if (action === "reject") return "sev-high";
  return "";
}

function decisionLabel(action) {
  if (action === "approve_underwriting") return t("approved");
  if (action === "needs_revision") return t("needsRevision");
  if (action === "reject") return t("rejected");
  return t("undecided");
}

function renderShell() {
  applyI18n();
  const list = scenarios();
  const undecided = list.filter((s) => !s.decision.action).length;
  const approved = list.filter((s) => s.decision.action === "approve_underwriting").length;
  const rejected = list.filter((s) => s.decision.action === "reject").length;
  els.syncStatus.textContent = state.batch?.generated_at
    ? `${t("generated")} ${new Date(state.batch.generated_at).toLocaleString()}`
    : t("empty");
  if (els.countUndecided) els.countUndecided.textContent = undecided;
  if (els.countApproved) els.countApproved.textContent = approved;
  if (els.countRejected) els.countRejected.textContent = rejected;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta)
    els.mobileViewMeta.textContent = `${pagination.total("scenarios", list.length)} ${t("scenarios")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "scenarios") return t("scenariosTitle");
  if (view === "comparison") return t("comparisonTitle");
  if (view === "settings") return t("settings");
  return t("overview");
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

// ---- Overview ----
// The only page with the hero and the metrics band. At most three numbers,
// and none of them repeats what the sidebar's attention block already shows
// (needs-decision / decided / rejected counts) or the record view's own
// count badge.

function renderOverview() {
  const list = scenarios();
  const generated = state.batch?.generated_at ? new Date(state.batch.generated_at).toLocaleString() : "";
  els.overviewSummary.textContent = [
    `${pagination.total("scenarios", list.length)} ${t("scenarios")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (!list.length) {
    els.overviewMetrics.innerHTML = "";
    els.overviewBody.innerHTML = `<div class="empty">${t("empty")}</div>`;
    return;
  }
  const avgCost = list.reduce((sum, s) => sum + Number(s.result.effective_annual_cost_pct || 0), 0) / list.length;
  const flagged = list.filter((s) => s.result.risk_flags.length > 0).length;
  els.overviewMetrics.innerHTML = [
    [t("scenarios"), String(list.length)],
    [t("effectiveAnnualCost"), pct(avgCost)],
    [t("riskFlags"), String(flagged)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  const due = filteredScenarios("undecided").slice(0, 5);
  els.overviewBody.innerHTML = `
    <div class="overview-panel wide">
      <h2>${t("humanWorkTitle")}</h2>
      ${
        due.length
          ? due
              .map(
                (s) => `
        <a class="due-row" href="#/scenarios/${encodeURIComponent(s.id)}">
          <span><strong>${escapeHtml(s.name)}</strong><small>${escapeHtml(s.input.business_type)}</small></span>
          <span class="due-meta">
            <strong>${s.result.cash_flow_payout_multiple != null ? `${num(s.result.cash_flow_payout_multiple)}x` : "—"}</strong>
            <small>${s.result.effective_annual_cost_pct != null ? pct(s.result.effective_annual_cost_pct) : "—"}</small>
          </span>
        </a>
      `,
              )
              .join("")
          : `<div class="empty-inline">${t("empty")}</div>`
      }
    </div>
  `;
}

// ---- Scenarios: record view (one toolbar row over a full-bleed table) ----

function scenarioTable(list) {
  if (!list.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("name")}</th>
          <th>${t("businessType")}</th>
          <th class="ws-col-num">${t("principal")}</th>
          <th class="ws-col-num">${t("cashFlowPayoutMultiple")}</th>
          <th class="ws-col-num">${t("effectiveAnnualCost")}</th>
          <th>${t("riskFlags")}</th>
          <th>${t("decision")}</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .map(
            (s) => `
          <tr data-id="${escapeHtml(s.id)}">
            <td><span class="strong">${escapeHtml(s.name)}</span></td>
            <td>${escapeHtml(s.input.business_type)}</td>
            <td class="ws-col-num">${money(s.input.principal)}</td>
            <td class="ws-col-num">${s.result.cash_flow_payout_multiple != null ? `${num(s.result.cash_flow_payout_multiple)}x` : "—"}</td>
            <td class="ws-col-num">${s.result.effective_annual_cost_pct != null ? pct(s.result.effective_annual_cost_pct) : "—"}</td>
            <td>${s.result.risk_flags.length ? `<span class="badge sev-high">${s.result.risk_flags.length}</span>` : `<span class="badge sev-info">${t("noRiskFlags")}</span>`}</td>
            <td><span class="badge ${decisionBadgeClass(s.decision.action)}">${decisionLabel(s.decision.action)}</span></td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderScenariosList() {
  const filter = state.route.params.get("filter") || "all";
  const list = filteredScenarios(filter);
  els.scenariosCount.textContent = String(list.length);
  const filters = ["all", "undecided", "approved", "needs_revision", "rejected"];
  const filterLabel = {
    all: t("all"),
    undecided: t("undecided"),
    approved: t("approved"),
    needs_revision: t("needsRevision"),
    rejected: t("rejected"),
  };
  els.scenarioFilters.innerHTML = filters
    .map(
      (f) =>
        `<a href="#/scenarios?filter=${f}" class="filter-chip ${f === filter ? "active" : ""}">${filterLabel[f]}</a>`,
    )
    .join("");
  // Chips wrap into several rows at phone widths (base-ui's `.ws-toolbar`
  // only wraps, it does not scroll); a native select covers the same filter
  // in one row there, same pattern as the status filter in busa-crm/
  // busa-lead-funnel's toolbars.
  els.scenarioFilterSelect.innerHTML = filters
    .map((f) => `<option value="${f}" ${f === filter ? "selected" : ""}>${filterLabel[f]}</option>`)
    .join("");
  els.scenariosList.innerHTML = `${scenarioTable(list)}${pagination.control("scenarios")}`;
}

// ---- Scenario form (new / edit) ----

function scenarioFormHtml(input = {}, name = "") {
  const f = {
    business_type: input.business_type || "",
    avg_monthly_revenue: input.avg_monthly_revenue ?? 200000,
    revenue_volatility_pct: input.revenue_volatility_pct ?? 15,
    principal: input.principal ?? 150000,
    initial_share_rate_pct: input.initial_share_rate_pct ?? 8,
    step_down_share_rate_pct: input.step_down_share_rate_pct ?? 4,
    repayment_cap_multiple: input.repayment_cap_multiple ?? 1.5,
    term_months: input.term_months ?? 24,
  };
  const disabled = state.busy ? "disabled" : "";
  return `
    <form id="scenarioForm" class="scenario-form">
      <label>${t("name")}<input name="name" required value="${escapeHtml(name)}" ${disabled}></label>
      <label>${t("businessType")}<input name="business_type" required value="${escapeHtml(f.business_type)}" ${disabled}></label>
      <label>${t("avgMonthlyRevenue")}<input name="avg_monthly_revenue" type="number" min="0" step="1000" required value="${f.avg_monthly_revenue}" ${disabled}></label>
      <label>${t("revenueVolatility")}<input name="revenue_volatility_pct" type="number" min="0" max="100" step="1" required value="${f.revenue_volatility_pct}" ${disabled}></label>
      <label>${t("principal")}<input name="principal" type="number" min="0" step="1000" required value="${f.principal}" ${disabled}></label>
      <label>${t("initialShareRate")}<input name="initial_share_rate_pct" type="number" min="0" max="100" step="0.1" required value="${f.initial_share_rate_pct}" ${disabled}></label>
      <label>${t("stepDownRate")}<input name="step_down_share_rate_pct" type="number" min="0" max="100" step="0.1" required value="${f.step_down_share_rate_pct}" ${disabled}></label>
      <label>${t("capMultiple")}<input name="repayment_cap_multiple" type="number" min="1" step="0.1" required value="${f.repayment_cap_multiple}" ${disabled}></label>
      <label>${t("termMonths")}<input name="term_months" type="number" min="1" step="1" required value="${f.term_months}" ${disabled}></label>
      <div class="form-actions">
        <button type="submit" ${disabled}>${name ? t("update") : t("save")}</button>
      </div>
    </form>
  `;
}

function readScenarioForm(form) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || ""),
    input: {
      business_type: String(data.get("business_type") || ""),
      avg_monthly_revenue: Number(data.get("avg_monthly_revenue")),
      revenue_volatility_pct: Number(data.get("revenue_volatility_pct")),
      principal: Number(data.get("principal")),
      initial_share_rate_pct: Number(data.get("initial_share_rate_pct")),
      step_down_share_rate_pct: Number(data.get("step_down_share_rate_pct")),
      repayment_cap_multiple: Number(data.get("repayment_cap_multiple")),
      term_months: Number(data.get("term_months")),
    },
  };
}

function renderNewScenario() {
  els.scenarioDetailBody.innerHTML = `
    <header><h2>${t("newScenario")}</h2></header>
    <div class="overview-panel">
      ${scenarioFormHtml()}
    </div>
  `;
  document.querySelector("#scenarioForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = readScenarioForm(event.target);
    const scenario = await submitCreateScenario(payload.name, payload.input);
    if (scenario) location.hash = `#/scenarios/${scenario.id}`;
  });
}

// ---- Scenario detail (full page: chart, metrics, risk flags, decision,
// editable inputs, delete) ----

function smoothPath(pts) {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function projectionChart(monthly, capAmount) {
  if (!monthly.length) return "";
  const width = 640;
  const height = 220;
  const padLeft = 44;
  const padBottom = 22;
  const padTop = 10;
  const plotWidth = width - padLeft;
  const plotHeight = height - padBottom - padTop;
  const maxY = Math.max(capAmount, ...monthly.map((m) => m.cumulative_repayment)) || 1;
  const stepX = plotWidth / Math.max(monthly.length - 1, 1);
  const toXY = (i, value) => [padLeft + i * stepX, padTop + (plotHeight - (value / maxY) * plotHeight)];
  const linePts = monthly.map((m, i) => toXY(i, m.cumulative_repayment));
  const linePath = smoothPath(linePts);
  const areaPath =
    linePts.length > 1
      ? `${linePath} L${linePts[linePts.length - 1][0].toFixed(1)},${(padTop + plotHeight).toFixed(1)} ` +
        `L${linePts[0][0].toFixed(1)},${(padTop + plotHeight).toFixed(1)} Z`
      : "";
  const capY = (padTop + (plotHeight - (capAmount / maxY) * plotHeight)).toFixed(1);
  const bars = monthly
    .map((m, i) => {
      const barHeight = (m.payment / maxY) * plotHeight;
      const [x] = toXY(i, 0);
      return `<rect x="${(x - stepX * 0.3).toFixed(1)}" y="${(padTop + plotHeight - barHeight).toFixed(1)}" width="${Math.max(stepX * 0.6, 2).toFixed(1)}" height="${barHeight.toFixed(1)}" class="chart-bar ${m.breakeven_reached ? "post-breakeven" : "pre-breakeven"}"></rect>`;
    })
    .join("");
  const gridLineCount = 4;
  const gridLines = Array.from({ length: gridLineCount + 1 }, (_, idx) => {
    const y = padTop + (plotHeight / gridLineCount) * idx;
    const value = maxY * (1 - idx / gridLineCount);
    return `
      <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width}" y2="${y.toFixed(1)}" class="chart-grid-line"></line>
      <text x="${(padLeft - 8).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="chart-axis-label chart-axis-label-y">${money(value)}</text>
    `;
  }).join("");
  const monthTickEvery = Math.max(Math.ceil(monthly.length / 6), 1);
  const monthTicks = monthly
    .map((m, i) => {
      if (i % monthTickEvery !== 0 && i !== monthly.length - 1) return "";
      const [x] = toXY(i, 0);
      return `<text x="${x.toFixed(1)}" y="${height - 4}" class="chart-axis-label chart-axis-label-x">${m.month}</text>`;
    })
    .join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" class="projection-chart" role="img" aria-label="${t("projectionChart")}">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.16"></stop>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${gridLines}
      <line x1="${padLeft}" y1="${capY}" x2="${width}" y2="${capY}" class="chart-cap-line"></line>
      ${bars}
      <path d="${areaPath}" class="chart-area"></path>
      <path d="${linePath}" class="chart-line"></path>
      ${monthTicks}
    </svg>
  `;
}

function riskFlagsHtml(flags) {
  if (!flags.length) return `<div class="empty">${t("noRiskFlags")}</div>`;
  return `<div class="insight-list">${flags
    .map(
      (flag) => `
      <div class="insight-row">
        <span class="badge sev-${flag.severity}">${escapeHtml(flag.code.replaceAll("_", " "))}</span>
        <span class="insight-text">${escapeHtml(flag.message)}</span>
      </div>`,
    )
    .join("")}</div>`;
}

function decisionPanel(scenario) {
  const disabled = state.busy ? "disabled" : "";
  return `
    <div class="overview-panel">
      <h2>${t("decision")}</h2>
      <form id="decisionForm" class="decision-form">
        <div class="decision-buttons">
          <label class="radio"><input type="radio" name="action" value="approve_underwriting" ${scenario.decision.action === "approve_underwriting" ? "checked" : ""} ${disabled}> ${t("approveUnderwriting")}</label>
          <label class="radio"><input type="radio" name="action" value="needs_revision" ${scenario.decision.action === "needs_revision" ? "checked" : ""} ${disabled}> ${t("needsRevisionAction")}</label>
          <label class="radio"><input type="radio" name="action" value="reject" ${scenario.decision.action === "reject" ? "checked" : ""} ${disabled}> ${t("rejectAction")}</label>
        </div>
        <label>${t("decisionNote")}<textarea name="note" rows="3" ${disabled}>${escapeHtml(scenario.decision.note || "")}</textarea></label>
        <div class="form-actions">
          <button type="submit" ${disabled}>${t("saveDecision")}</button>
        </div>
      </form>
    </div>
  `;
}

function renderScenarioDetail() {
  const scenario = scenarios().find((s) => s.id === state.route.id);
  if (!scenario) {
    location.hash = "#/scenarios";
    return;
  }
  const r = scenario.result;
  const disabled = state.busy ? "disabled" : "";
  els.scenarioDetailBody.innerHTML = `
    <header>
      <h2>${escapeHtml(scenario.name)}</h2>
      <p class="muted">${escapeHtml(scenario.input.business_type)}</p>
    </header>
    <div class="detail">
      <div class="detail-main">
        <div class="metrics">
          <div class="metric"><span>${t("totalRepayment")}</span><strong>${money(r.total_repayment)}</strong></div>
          <div class="metric"><span>${t("cashFlowPayoutMultiple")}</span><strong>${r.cash_flow_payout_multiple != null ? `${num(r.cash_flow_payout_multiple)}x` : "—"}</strong></div>
          <div class="metric"><span>${t("effectiveAnnualCost")}</span><strong class="${r.effective_annual_cost_pct > 40 ? "negative" : ""}">${r.effective_annual_cost_pct != null ? pct(r.effective_annual_cost_pct) : "—"}</strong></div>
          <div class="metric"><span>${t("monthsToCap")}</span><strong>${r.months_to_cap ?? "—"}</strong></div>
        </div>
        <div class="overview-panel wide">
          <h2>${t("projectionChart")}</h2>
          ${projectionChart(r.monthly, r.cap_amount)}
        </div>
        <div class="overview-panel wide">
          <h2>${t("riskFlags")}</h2>
          ${riskFlagsHtml(r.risk_flags)}
        </div>
        ${decisionPanel(scenario)}
      </div>
      <aside class="detail-side">
        <h2>${t("scenariosTitle")}</h2>
        ${scenarioFormHtml(scenario.input, scenario.name)}
        <div class="form-actions">
          <button type="button" id="deleteScenarioBtn" class="danger" ${disabled}>${t("delete")}</button>
        </div>
      </aside>
    </div>
  `;

  document.querySelector("#decisionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    await submitDecision(scenario.id, data.get("action") || null, String(data.get("note") || ""));
  });

  document.querySelector("#scenarioForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = readScenarioForm(event.target);
    await submitUpdateScenario(scenario.id, payload.name, payload.input);
  });

  document.querySelector("#deleteScenarioBtn")?.addEventListener("click", async () => {
    if (!window.confirm(`${t("delete")}: ${scenario.name}?`)) return;
    await submitDeleteScenario(scenario.id);
  });
}

// ---- Comparison ----

function renderComparison() {
  els.comparisonHint.textContent = t("compareHint");
  const list = scenarios();
  if (!list.length) {
    els.comparisonBody.innerHTML = `<div class="empty">${t("empty")}</div>`;
    return;
  }
  const selected = list.filter((s) => state.compareIds.has(s.id));
  const rows = [
    { key: "businessType", get: (s) => s.input.business_type },
    { key: "principal", get: (s) => money(s.input.principal) },
    { key: "initialShareRate", get: (s) => `${s.input.initial_share_rate_pct}%` },
    { key: "stepDownRate", get: (s) => `${s.input.step_down_share_rate_pct}%` },
    { key: "capMultiple", get: (s) => `${s.input.repayment_cap_multiple}x` },
    { key: "termMonths", get: (s) => s.input.term_months },
    { key: "totalRepayment", get: (s) => money(s.result.total_repayment) },
    {
      key: "cashFlowPayoutMultiple",
      get: (s) => (s.result.cash_flow_payout_multiple != null ? `${num(s.result.cash_flow_payout_multiple)}x` : "—"),
    },
    {
      key: "effectiveAnnualCost",
      get: (s) => (s.result.effective_annual_cost_pct != null ? pct(s.result.effective_annual_cost_pct) : "—"),
    },
    { key: "monthsToCap", get: (s) => s.result.months_to_cap ?? "—" },
    { key: "riskFlags", get: (s) => (s.result.risk_flags.length ? s.result.risk_flags.length : t("noRiskFlags")) },
    { key: "decision", get: (s) => decisionLabel(s.decision.action) },
  ];
  els.comparisonBody.innerHTML = `
    <div class="overview-panel wide">
      <h2>${t("scenariosTitle")}</h2>
      <div class="compare-picker">
        ${list
          .map(
            (s) => `
          <label class="checkbox"><input type="checkbox" data-compare-id="${escapeHtml(s.id)}" ${state.compareIds.has(s.id) ? "checked" : ""}> ${escapeHtml(s.name)}</label>
        `,
          )
          .join("")}
      </div>
    </div>
    ${
      selected.length
        ? `<div class="table-wrap">
      <table>
        <thead><tr><th></th>${selected.map((s) => `<th>${escapeHtml(s.name)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr><td class="strong">${t(row.key)}</td>${selected.map((s) => `<td class="num">${row.get(s)}</td>`).join("")}</tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>`
        : `<div class="empty">${t("noSelection")}</div>`
    }
  `;
  document.querySelectorAll("[data-compare-id]").forEach((box) => {
    box.addEventListener("change", () => {
      const id = box.dataset.compareId;
      if (box.checked) state.compareIds.add(id);
      else state.compareIds.delete(id);
      localStorage.setItem("kelly-revshare-simulator.compare", JSON.stringify([...state.compareIds]));
      render();
    });
  });
}

// ---- Settings ----

function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const policy = summary.underwriting_policy || {};
  els.settingsBody.innerHTML = `
    <p class="muted">${t("localFilesOnly")}</p>
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
        <h2>${t("policy")}</h2>
        <dl>
          <dt>${t("maxCost")}</dt><dd>${policy.max_effective_annual_cost_pct ?? "—"}%</dd>
          <dt>${t("capRange")}</dt><dd>${policy.min_cap_multiple ?? "—"}x – ${policy.max_cap_multiple ?? "—"}x</dd>
          <dt>${t("maxTerm")}</dt><dd>${policy.max_term_months ?? "—"}</dd>
        </dl>
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  const ready = Boolean(state.batch);
  const { view, id } = state.route;
  const onScenarios = ready && view === "scenarios";
  // Only `page` is declared for `scenarios`, so a selection always shows as
  // ws-detail-page (the record replaces the list); drawer/split never apply.
  const detailOpen = onScenarios && Boolean(id);
  const body = document.body.classList;
  body.toggle("ws-detail-open", detailOpen);
  body.toggle("ws-detail-page", detailOpen && DETAIL_MODES.scenarios !== "split" && DETAIL_MODES.scenarios !== "drawer");
  body.toggle("ws-searching", onScenarios && !id && Boolean(state.query.trim()));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.scenariosPage.hidden = !onScenarios;
  els.comparisonPage.hidden = !ready || view !== "comparison";
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onScenarios) {
    if (id === "new") renderNewScenario();
    else if (id) renderScenarioDetail();
    else renderScenariosList();
  } else if (view === "comparison") renderComparison();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ---- Direct writes: create/edit/delete a scenario and record an
// underwriting decision, applied straight through the active provider
// (Busabase or demo) -- this is a direct-manipulation control panel, not a
// review/approval queue, the same way kelly-lead-funnel's stage moves and
// kelly-portfolio-health's flag/note writes work. Demo mode never reaches
// Busabase; it mutates the in-memory snapshot already rendered so the demo
// stays fully interactive for screenshots/docs. ----

async function submitCreateScenario(name, input) {
  if (state.demo) {
    const scenario = buildScenario(name, input);
    state.batch.scenarios.push(scenario);
    render();
    return scenario;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    const scenario = await provider.createScenario(name, input);
    await loadState();
    return scenario;
  } catch (error) {
    els.scenarioDetailBody.insertAdjacentHTML("afterbegin", `<div class="empty">${escapeHtml(error.message)}</div>`);
    return null;
  } finally {
    state.busy = false;
  }
}

async function submitUpdateScenario(id, name, input) {
  if (state.demo) {
    const index = state.batch.scenarios.findIndex((s) => s.id === id);
    if (index !== -1) {
      const existing = state.batch.scenarios[index];
      const next = buildScenario(name || existing.name, input, id);
      next.created_at = existing.created_at;
      next.decision = existing.decision;
      state.batch.scenarios[index] = next;
    }
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.updateScenario(id, name, input);
    await loadState();
  } catch (error) {
    els.scenarioDetailBody.insertAdjacentHTML("afterbegin", `<div class="empty">${escapeHtml(error.message)}</div>`);
  } finally {
    state.busy = false;
  }
}

async function submitDecision(id, action, note) {
  if (state.demo) {
    const scenario = state.batch.scenarios.find((s) => s.id === id);
    if (scenario) {
      scenario.decision = { action: action || null, note: note || "", decided_at: new Date().toISOString() };
    }
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.saveDecision(id, action, note);
    await loadState();
  } catch (error) {
    els.scenarioDetailBody.insertAdjacentHTML("afterbegin", `<div class="empty">${escapeHtml(error.message)}</div>`);
  } finally {
    state.busy = false;
  }
}

async function submitDeleteScenario(id) {
  if (state.demo) {
    state.batch.scenarios = state.batch.scenarios.filter((s) => s.id !== id);
    location.hash = "#/scenarios";
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.deleteScenario(id);
    location.hash = "#/scenarios";
    await loadState();
  } catch (error) {
    els.scenarioDetailBody.insertAdjacentHTML("afterbegin", `<div class="empty">${escapeHtml(error.message)}</div>`);
  } finally {
    state.busy = false;
  }
}

pagination.bind(document.body);

els.scenariosList.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  location.hash = `#/scenarios/${encodeURIComponent(row.dataset.id)}`;
});

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.scenarioFilterSelect?.addEventListener("change", () => {
  location.hash = `#/scenarios?filter=${els.scenarioFilterSelect.value}`;
});
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.newScenarioBtn?.addEventListener("click", () => {
  location.hash = "#/scenarios/new";
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-revshare-simulator-language", state.lang);
  render();
});

syncResponsiveShell();

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
    els.loadState.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

boot();
