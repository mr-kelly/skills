import { messages } from "./i18n/messages.js";

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
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-revshare-simulator.sidebarCollapsed";

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
  countUndecided: document.querySelector("#count-undecided"),
  countApproved: document.querySelector("#count-approved"),
  countRejected: document.querySelector("#count-rejected"),
  language: document.querySelector("#language"),
  newScenarioBtn: document.querySelector("#newScenarioBtn"),
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
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.batch = data.batch;
  state.settings = data;
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
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.newScenarioBtn) els.newScenarioBtn.textContent = t("newScenario");
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
  if (els.mobileViewMeta) els.mobileViewMeta.textContent = `${list.length} ${t("scenarios")}`;
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

function renderOverview() {
  els.title.textContent = t("overview");
  const list = scenarios();
  els.subtitle.textContent = `${list.length} ${t("scenarios")}`;
  if (!list.length) {
    els.content.innerHTML = `<div class="empty">${t("empty")}</div>`;
    return;
  }
  const avgCost = list.reduce((sum, s) => sum + Number(s.result.effective_annual_cost_pct || 0), 0) / list.length;
  const flagged = list.filter((s) => s.result.risk_flags.length > 0).length;
  const capReached = list.filter((s) => s.result.months_to_cap !== null).length;
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric"><span>${t("scenarios")}</span><strong>${list.length}</strong></div>
      <div class="metric"><span>${t("effectiveAnnualCost")}</span><strong>${pct(avgCost)}</strong></div>
      <div class="metric"><span>${t("riskFlags")}</span><strong class="${flagged ? "negative" : ""}">${flagged}</strong></div>
      <div class="metric"><span>${t("monthsToCap")}</span><strong>${capReached}/${list.length}</strong></div>
    </div>
    <div class="overview-panel wide">
      <h2>${t("humanWorkTitle")}</h2>
      ${scenarioTable(filteredScenarios("undecided"))}
    </div>
  `;
}

// ---- Scenarios list ----

function scenarioTable(list) {
  if (!list.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("name")}</th>
            <th>${t("businessType")}</th>
            <th class="num">${t("principal")}</th>
            <th class="num">${t("cashFlowPayoutMultiple")}</th>
            <th class="num">${t("effectiveAnnualCost")}</th>
            <th>${t("riskFlags")}</th>
            <th>${t("decision")}</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (s) => `
            <tr>
              <td><a href="#/scenarios/${encodeURIComponent(s.id)}"><span class="strong">${escapeHtml(s.name)}</span></a></td>
              <td>${escapeHtml(s.input.business_type)}</td>
              <td class="num">${money(s.input.principal)}</td>
              <td class="num">${s.result.cash_flow_payout_multiple != null ? `${num(s.result.cash_flow_payout_multiple)}x` : "—"}</td>
              <td class="num">${s.result.effective_annual_cost_pct != null ? pct(s.result.effective_annual_cost_pct) : "—"}</td>
              <td>${s.result.risk_flags.length ? `<span class="badge sev-high">${s.result.risk_flags.length}</span>` : `<span class="badge sev-info">${t("noRiskFlags")}</span>`}</td>
              <td><span class="badge ${decisionBadgeClass(s.decision.action)}">${decisionLabel(s.decision.action)}</span></td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderScenarios() {
  els.title.textContent = t("scenariosTitle");
  const filter = state.route.params.get("filter") || "all";
  const list = filteredScenarios(filter);
  els.subtitle.textContent = `${list.length} ${t("scenarios")}`;
  const filters = ["all", "undecided", "approved", "needs_revision", "rejected"];
  const filterLabel = {
    all: t("all"),
    undecided: t("undecided"),
    approved: t("approved"),
    needs_revision: t("needsRevision"),
    rejected: t("rejected"),
  };
  els.content.innerHTML = `
    <div class="filter-row">
      ${filters
        .map(
          (f) =>
            `<a href="#/scenarios?filter=${f}" class="filter-chip ${f === filter ? "active" : ""}">${filterLabel[f]}</a>`,
        )
        .join("")}
    </div>
    ${scenarioTable(list)}
  `;
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
  return `
    <form id="scenarioForm" class="scenario-form">
      <label>${t("name")}<input name="name" required value="${escapeHtml(name)}"></label>
      <label>${t("businessType")}<input name="business_type" required value="${escapeHtml(f.business_type)}"></label>
      <label>${t("avgMonthlyRevenue")}<input name="avg_monthly_revenue" type="number" min="0" step="1000" required value="${f.avg_monthly_revenue}"></label>
      <label>${t("revenueVolatility")}<input name="revenue_volatility_pct" type="number" min="0" max="100" step="1" required value="${f.revenue_volatility_pct}"></label>
      <label>${t("principal")}<input name="principal" type="number" min="0" step="1000" required value="${f.principal}"></label>
      <label>${t("initialShareRate")}<input name="initial_share_rate_pct" type="number" min="0" max="100" step="0.1" required value="${f.initial_share_rate_pct}"></label>
      <label>${t("stepDownRate")}<input name="step_down_share_rate_pct" type="number" min="0" max="100" step="0.1" required value="${f.step_down_share_rate_pct}"></label>
      <label>${t("capMultiple")}<input name="repayment_cap_multiple" type="number" min="1" step="0.1" required value="${f.repayment_cap_multiple}"></label>
      <label>${t("termMonths")}<input name="term_months" type="number" min="1" step="1" required value="${f.term_months}"></label>
      <div class="form-actions">
        <button type="submit">${name ? t("update") : t("save")}</button>
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
  els.title.textContent = t("newScenario");
  els.subtitle.textContent = "";
  els.content.innerHTML = `
    <div class="overview-panel">
      ${scenarioFormHtml()}
    </div>
  `;
  document.querySelector("#scenarioForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = readScenarioForm(event.target);
    const res = await fetch("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    const { scenario } = await res.json();
    await loadState();
    location.hash = `#/scenarios/${scenario.id}`;
  });
}

// ---- Scenario detail ----

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
  return `
    <div class="overview-panel">
      <h2>${t("decision")}</h2>
      <form id="decisionForm" class="decision-form">
        <div class="decision-buttons">
          <label class="radio"><input type="radio" name="action" value="approve_underwriting" ${scenario.decision.action === "approve_underwriting" ? "checked" : ""}> ${t("approveUnderwriting")}</label>
          <label class="radio"><input type="radio" name="action" value="needs_revision" ${scenario.decision.action === "needs_revision" ? "checked" : ""}> ${t("needsRevisionAction")}</label>
          <label class="radio"><input type="radio" name="action" value="reject" ${scenario.decision.action === "reject" ? "checked" : ""}> ${t("rejectAction")}</label>
        </div>
        <label>${t("decisionNote")}<textarea name="note" rows="3">${escapeHtml(scenario.decision.note || "")}</textarea></label>
        <div class="form-actions">
          <button type="submit">${t("saveDecision")}</button>
        </div>
      </form>
    </div>
  `;
}

function renderScenarioDetail() {
  const scenario = scenarios().find((s) => s.id === state.route.id);
  if (!scenario) {
    renderScenarios();
    return;
  }
  els.title.textContent = scenario.name;
  els.subtitle.textContent = scenario.input.business_type;
  const r = scenario.result;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/scenarios">← ${t("back")}</a>
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
      </aside>
    </section>
  `;

  document.querySelector("#decisionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    await fetch(`/api/scenarios/${encodeURIComponent(scenario.id)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: data.get("action") || null, note: String(data.get("note") || "") }),
    });
    await loadState();
    render();
  });

  document.querySelector("#scenarioForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = readScenarioForm(event.target);
    await fetch(`/api/scenarios/${encodeURIComponent(scenario.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    await loadState();
    render();
  });
}

// ---- Comparison ----

function renderComparison() {
  els.title.textContent = t("comparisonTitle");
  const list = scenarios();
  els.subtitle.textContent = t("compareHint");
  if (!list.length) {
    els.content.innerHTML = `<div class="empty">${t("empty")}</div>`;
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
  els.content.innerHTML = `
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
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const policy = summary.underwriting_policy || {};
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
  if (state.route.view === "scenarios" && state.route.id === "new") renderNewScenario();
  else if (state.route.view === "scenarios" && state.route.id) renderScenarioDetail();
  else if (state.route.view === "scenarios") renderScenarios();
  else if (state.route.view === "comparison") renderComparison();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
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
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
