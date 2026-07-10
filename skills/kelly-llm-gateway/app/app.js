const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  sort: { key: "cost_today", dir: "desc" },
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-llm-gateway-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  messages: { en: {}, zh: {} },
  busy: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-llm-gateway.sidebarCollapsed";

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
  ackCount: document.querySelector("#ack-count"),
  midRolloutCount: document.querySelector("#count-mid-rollout"),
  readyPromoteCount: document.querySelector("#count-ready-promote"),
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

function t(key) {
  return state.messages[activeLang()]?.[key] || state.messages.en[key] || key;
}

function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return (
    state.messages[activeLang()]?.enum?.[group]?.[key] ||
    state.messages.en.enum?.[group]?.[key] ||
    key.replaceAll("_", " ")
  );
}

async function loadMessages() {
  const [en, zh] = await Promise.all([
    fetch("./i18n/en.json").then((res) => res.json()),
    fetch("./i18n/zh-CN.json").then((res) => res.json()),
  ]);
  state.messages = { en, zh };
}

function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function pct(value) {
  const n = Number(value || 0);
  return `${n.toFixed(2)}%`;
}

function signedPct(value) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function num(value, digits = 0) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function errorRatePct(rate) {
  return `${(Number(rate || 0) * 100).toFixed(2)}%`;
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
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
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "spend"
      ? "#/spend"
      : scenario === "rollouts"
        ? "#/rollouts"
        : scenario === "anomalies"
          ? "#/anomalies"
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

function isConnected() {
  return Boolean(state.snapshot?.routes?.length) || Boolean(state.settings?.demo);
}

function openAnomalies() {
  return (state.snapshot?.anomalies || []).filter((a) => a.status === "open");
}

function midRolloutRoutes() {
  return (state.snapshot?.routes || []).filter((r) => r.status === "canary" && r.canary_pct < 90);
}

function readyToPromoteRoutes() {
  return (state.snapshot?.routes || []).filter((r) => r.status === "canary" && r.canary_pct >= 90);
}

function renderShell() {
  applyI18n();
  const connected = isConnected();
  els.syncStatus.textContent = connected
    ? state.snapshot?.generated_at
      ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
      : t("synced")
    : t("needsConnection");
  if (els.ackCount) els.ackCount.textContent = openAnomalies().length;
  if (els.midRolloutCount) els.midRolloutCount.textContent = midRolloutRoutes().length;
  if (els.readyPromoteCount) els.readyPromoteCount.textContent = readyToPromoteRoutes().length;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = connected
      ? `${money(state.snapshot?.totals?.cost_today)} · ${openAnomalies().length} ${t("anomalies").toLowerCase()}`
      : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "spend") return t("spend");
  if (view === "rollouts") return t("rollouts");
  if (view === "anomalies") return t("anomalies");
  if (view === "settings") return t("settings");
  return t("overview");
}

function serviceName(serviceId) {
  return state.snapshot?.services?.find((s) => s.service_id === serviceId)?.display_name || serviceId;
}

function modelInfo(modelId) {
  return (
    state.snapshot?.models?.find((m) => m.model_id === modelId) || {
      display_name: modelId,
      provider: "",
      tier: "external",
    }
  );
}

function totalsMetricCards() {
  const totals = state.snapshot?.totals || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("costToday")}</span><strong>${money(totals.cost_today)}</strong></div>
      <div class="metric"><span>${t("callsToday")}</span><strong>${num(totals.calls_today)}</strong></div>
      <div class="metric"><span>${t("cost7dAvg")}</span><strong>${money(totals.cost_7d_avg)}</strong></div>
      <div class="metric"><span>${t("errorRateToday")}</span><strong>${errorRatePct(totals.error_rate_today)}</strong></div>
    </div>
  `;
}

function trendDayLabel(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "numeric",
    day: "numeric",
  });
}

function smoothPath(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const mx = (prev.x + cur.x) / 2;
    const my = (prev.y + cur.y) / 2;
    d += ` Q ${prev.x},${prev.y} ${mx},${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

function spendTrendPanel() {
  const trend = state.snapshot?.spend_trend || [];
  if (!trend.length) return "";
  const W = 960;
  const H = 180;
  const padTop = 14;
  const padBottom = 8;
  const max = Math.max(...trend.map((p) => p.cost), 1);
  const points = trend.map((point, i) => {
    const x = trend.length > 1 ? (i / (trend.length - 1)) * W : 0;
    const y = padTop + (1 - point.cost / max) * (H - padTop - padBottom);
    return { x, y, point };
  });
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x},${H} L ${points[0].x},${H} Z`;
  const gridLines = [0, 0.5, 1]
    .map((frac) => {
      const y = padTop + frac * (H - padTop - padBottom);
      return `<line class="trend-grid-line" x1="0" y1="${y}" x2="${W}" y2="${y}" />`;
    })
    .join("");
  const axisLabels = [
    { frac: 0, value: max },
    { frac: 1, value: 0 },
  ]
    .map(
      ({ frac, value }) =>
        `<text class="trend-axis-label" x="4" y="${padTop + frac * (H - padTop - padBottom) - 4}">${escapeHtml(money(value))}</text>`,
    )
    .join("");
  const dots = points
    .map(
      ({ x, y, point }) =>
        `<circle class="trend-dot" cx="${x}" cy="${y}" r="3"><title>${escapeHtml(trendDayLabel(point.date))}: ${escapeHtml(money(point.cost))}</title></circle>`,
    )
    .join("");
  const xLabels = trend
    .map((point) => `<span class="trend-x-label">${escapeHtml(trendDayLabel(point.date))}</span>`)
    .join("");
  return `
    <div class="overview-panel wide">
      <h2>${t("spendTrend")}</h2>
      <div class="trend-chart">
        <svg class="trend-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trendFillGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.22" />
              <stop offset="100%" style="stop-color:var(--accent);stop-opacity:0" />
            </linearGradient>
          </defs>
          ${gridLines}
          <path class="trend-area" d="${areaPath}" />
          <path class="trend-line" d="${linePath}" />
          ${dots}
          ${axisLabels}
        </svg>
        <div class="trend-x-labels">${xLabels}</div>
      </div>
    </div>
  `;
}

function statusBadgeClass(status) {
  if (status === "canary") return "sev-watch";
  if (status === "rollback") return "sev-high";
  if (status === "hold") return "sev-info";
  return "";
}

function rolloutSummaryPanel() {
  const routes = (state.snapshot?.routes || []).filter((r) => r.status !== "stable").slice(0, 6);
  if (!routes.length) return "";
  const rows = routes
    .map(
      (route) => `
      <a class="mover-row" href="#/rollouts">
        <span><strong>${escapeHtml(serviceName(route.service_id))}</strong><small>${escapeHtml(modelInfo(route.model_id).display_name)}</small></span>
        <span class="badge ${statusBadgeClass(route.status)}">${escapeHtml(enumLabel(route.status, "status"))}</span>
        <span class="num">${route.canary_pct}%</span>
      </a>
    `,
    )
    .join("");
  return `
    <div class="overview-panel">
      <h2>${t("rolloutBoard")}</h2>
      ${rows}
    </div>
  `;
}

function anomalyPreviewPanel() {
  const anomalies = openAnomalies().slice(0, 6);
  return `
    <div class="overview-panel">
      <h2>${t("anomalyList")}</h2>
      ${anomalies.length ? anomalies.map((a) => anomalyRowMarkup(a, { compact: true })).join("") : `<div class="empty">${t("anomalyEmpty")}</div>`}
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `
    ${totalsMetricCards()}
    ${warnings()}
    ${spendTrendPanel()}
    <section class="overview-grid">
      ${rolloutSummaryPanel()}
      ${anomalyPreviewPanel()}
    </section>
  `;
}

function filteredRoutes() {
  const query = state.query.trim().toLowerCase();
  return (state.snapshot?.routes || []).filter((route) => {
    if (!query) return true;
    const model = modelInfo(route.model_id);
    return [serviceName(route.service_id), model.display_name, model.provider, route.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function sortedRoutes(list) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

function sortHeader(key, label, cls = "") {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${cls} ${active ? "active" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
}

function spendTable(routes) {
  if (!routes.length) return `<div class="empty">${t("empty")}</div>`;
  const rows = sortedRoutes(routes);
  const groupByService = state.sort.key === "service_id";
  let lastService = null;
  const bodyRows = rows
    .map((route, index) => {
      const model = modelInfo(route.model_id);
      const isGroupStart = groupByService && route.service_id !== lastService;
      lastService = route.service_id;
      return `
            <tr class="${isGroupStart && index > 0 ? "group-start" : ""}">
              <td><span class="strong">${escapeHtml(serviceName(route.service_id))}</span></td>
              <td>
                <span class="model-name">${escapeHtml(model.display_name)}</span>
                <div class="model-provider">${escapeHtml(model.provider)} · <span class="badge">${escapeHtml(enumLabel(model.tier, "tier"))}</span></div>
              </td>
              <td class="num">${num(route.calls_today)}</td>
              <td class="num">${money(route.cost_today)}</td>
              <td class="num">${errorRatePct(route.error_rate_today)}</td>
              <td class="num">${route.canary_pct}%</td>
              <td><span class="badge ${statusBadgeClass(route.status)}">${escapeHtml(enumLabel(route.status, "status"))}</span></td>
            </tr>
          `;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortHeader("service_id", t("service"))}
            ${sortHeader("model_id", t("model"))}
            ${sortHeader("calls_today", t("calls"), "num")}
            ${sortHeader("cost_today", t("cost"), "num")}
            ${sortHeader("error_rate_today", t("errorRate"), "num")}
            ${sortHeader("canary_pct", t("canaryPct"), "num")}
            ${sortHeader("status", t("status"))}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;
}

function renderSpend() {
  els.title.textContent = t("spend");
  const routes = filteredRoutes();
  els.subtitle.textContent = `${routes.length} ${t("service").toLowerCase()} × ${t("model").toLowerCase()}`;
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `
    ${totalsMetricCards()}
    ${warnings()}
    <h2 class="section-heading">${t("spendByServiceModel")}</h2>
    ${spendTable(routes)}
  `;
}

function rolloutActionButtons(route) {
  const disabled = state.busy ? "disabled" : "";
  return `
    <div class="rollout-actions">
      <button type="button" data-action="promote" data-route-id="${escapeHtml(route.route_id)}" ${disabled}>${t("promote")}</button>
      <button type="button" data-action="hold" data-route-id="${escapeHtml(route.route_id)}" ${disabled}>${t("hold")}</button>
      <button type="button" data-action="rollback" data-route-id="${escapeHtml(route.route_id)}" ${disabled}>${t("rollback")}</button>
    </div>
  `;
}

function rolloutCard(route) {
  const model = modelInfo(route.model_id);
  return `
    <div class="account-card rollout-card" data-status="${escapeHtml(route.status)}">
      <div class="row between">
        <strong>${escapeHtml(serviceName(route.service_id))}</strong>
        <span class="badge ${statusBadgeClass(route.status)}">${escapeHtml(enumLabel(route.status, "status"))}</span>
      </div>
      <div class="muted">${escapeHtml(model.display_name)} · ${escapeHtml(enumLabel(model.tier, "tier"))}</div>
      <div class="rollout-progress"><div class="rollout-progress-fill" style="width:${route.canary_pct}%"></div></div>
      <div class="rollout-progress-label"><span>${route.canary_pct}% ${t("canaryPct").toLowerCase()}</span><span>100%</span></div>
      <div class="row stats">
        <span>${t("callsToday")} ${num(route.calls_today)}</span>
        <span>${t("costToday")} ${money(route.cost_today)}</span>
        <span>${t("errorRate")} ${errorRatePct(route.error_rate_today)}</span>
      </div>
      <div class="row stats">
        <span>${t("rollbackReady")}: ${route.rollback_ready ? t("ready") : t("notReady")}</span>
      </div>
      ${route.note ? `<div class="muted rollout-note">${escapeHtml(t("note"))}: ${escapeHtml(route.note)}</div>` : ""}
      <textarea class="decision-note" data-route-id="${escapeHtml(route.route_id)}" placeholder="${escapeHtml(t("decisionNote"))}" rows="2"></textarea>
      ${rolloutActionButtons(route)}
    </div>
  `;
}

function renderRollouts() {
  els.title.textContent = t("rollouts");
  const routes = state.snapshot?.routes || [];
  const canaryRoutes = routes.filter((r) => r.status !== "stable");
  const stableRoutes = routes.filter((r) => r.status === "stable");
  els.subtitle.textContent = `${canaryRoutes.length} ${t("rollouts").toLowerCase()}`;
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `
    ${warnings()}
    <h2 class="section-heading">${t("rolloutBoard")}</h2>
    <div class="account-grid">
      ${canaryRoutes.length ? canaryRoutes.map(rolloutCard).join("") : `<div class="empty">${t("empty")}</div>`}
    </div>
    ${
      stableRoutes.length
        ? `<h2 class="section-heading">${enumLabel("stable", "status")}</h2>${spendTable(stableRoutes)}`
        : ""
    }
  `;
}

function anomalyLabel(anomaly) {
  const template =
    state.messages[activeLang()]?.anomalyTemplate?.[anomaly.kind] ||
    state.messages.en.anomalyTemplate?.[anomaly.kind] ||
    "";
  const isRate = anomaly.kind === "error_spike";
  const fmt = (value) => (isRate ? errorRatePct(value) : money(value));
  return template
    .replace("{actual}", fmt(anomaly.actual))
    .replace("{baseline}", fmt(anomaly.baseline))
    .replace("{delta}", signedPct(anomaly.delta_pct));
}

function anomalyRowMarkup(anomaly, { compact = false } = {}) {
  const route = (state.snapshot?.routes || []).find((r) => r.route_id === anomaly.route_id);
  const label = route
    ? `${serviceName(route.service_id)} · ${modelInfo(route.model_id).display_name}`
    : anomaly.route_id;
  const severity = ["watch", "high"].includes(anomaly.severity) ? anomaly.severity : "watch";
  const acknowledged = anomaly.status === "acknowledged";
  return `
    <div class="insight-row anomaly-row" data-severity="${severity}">
      <span class="badge sev-${severity}">${escapeHtml(enumLabel(anomaly.kind, "kind"))}</span>
      <span class="insight-text">
        <strong>${escapeHtml(label)}</strong><br>
        ${escapeHtml(anomalyLabel(anomaly))}
        ${
          compact
            ? ""
            : acknowledged
              ? `<div class="muted">${escapeHtml(t("acknowledged"))}${anomaly.ack_note ? `: ${escapeHtml(anomaly.ack_note)}` : ""}</div>`
              : `<div class="anomaly-ack">
                  <textarea class="ack-note" data-anomaly-id="${escapeHtml(anomaly.id)}" placeholder="${escapeHtml(t("ackNote"))}" rows="1"></textarea>
                  <button type="button" data-ack-anomaly="${escapeHtml(anomaly.id)}" ${state.busy ? "disabled" : ""}>${escapeHtml(t("acknowledge"))}</button>
                </div>`
        }
      </span>
    </div>
  `;
}

function renderAnomalies() {
  els.title.textContent = t("anomalies");
  const anomalies = state.snapshot?.anomalies || [];
  els.subtitle.textContent = `${openAnomalies().length} ${t("open").toLowerCase()}`;
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `
    ${warnings()}
    <div class="overview-panel wide">
      <h2>${t("anomalyList")}</h2>
      <div class="insight-list">
        ${anomalies.length ? anomalies.map((a) => anomalyRowMarkup(a)).join("") : `<div class="empty">${t("anomalyEmpty")}</div>`}
      </div>
    </div>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const gateway = summary.gateway || {};
  els.content.innerHTML = `
    <div class="settings">
      <div class="empty boundary-note">${escapeHtml(t("boundary"))}</div>
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
        <h2>${t("gateway")}</h2>
        <dl>
          <dt>${t("region")}</dt><dd>${escapeHtml(gateway.region || "")}</dd>
          <dt>${t("baseUrl")}</dt><dd>${escapeHtml(gateway.base_url || "")}</dd>
          <dt>${t("secretsReady")}</dt><dd>${gateway.secrets_ready ? t("secretsReady") : t("missingSecrets")}</dd>
        </dl>
        <div class="settings-account">
          <strong>${escapeHtml((gateway.secret_envs || []).join(", ") || t("missingSecrets"))}</strong>
          <span>${gateway.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
        </div>
      </section>
    </div>
  `;
}

function warnings() {
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

function render() {
  renderShell();
  if (state.route.view === "spend") renderSpend();
  else if (state.route.view === "rollouts") renderRollouts();
  else if (state.route.view === "anomalies") renderAnomalies();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function submitRolloutDecision(routeId, action) {
  if (state.demo) {
    // Demo mode never writes local files; just reflect the decision in-memory.
    const route = state.snapshot.routes.find((r) => r.route_id === routeId);
    if (route) {
      if (action === "promote") Object.assign(route, { status: "stable", canary_pct: 100, rollback_ready: false });
      else if (action === "rollback") Object.assign(route, { status: "rollback", rollback_ready: false });
      else if (action === "hold") Object.assign(route, { status: "hold" });
    }
    render();
    return;
  }
  const noteEl = document.querySelector(`.decision-note[data-route-id="${CSS.escape(routeId)}"]`);
  state.busy = true;
  render();
  try {
    await postJson(`/api/rollouts/${encodeURIComponent(routeId)}/decision`, { action, note: noteEl?.value || "" });
    await loadState();
  } catch (error) {
    els.content.insertAdjacentHTML("afterbegin", `<div class="empty">${escapeHtml(error.message)}</div>`);
  } finally {
    state.busy = false;
  }
}

async function submitAnomalyAck(anomalyId) {
  if (state.demo) {
    const anomaly = state.snapshot.anomalies.find((a) => a.id === anomalyId);
    if (anomaly) Object.assign(anomaly, { status: "acknowledged", acknowledged_at: new Date().toISOString() });
    render();
    return;
  }
  const noteEl = document.querySelector(`.ack-note[data-anomaly-id="${CSS.escape(anomalyId)}"]`);
  state.busy = true;
  render();
  try {
    await postJson(`/api/anomalies/${encodeURIComponent(anomalyId)}/ack`, { note: noteEl?.value || "" });
    await loadState();
  } catch (error) {
    els.content.insertAdjacentHTML("afterbegin", `<div class="empty">${escapeHtml(error.message)}</div>`);
  } finally {
    state.busy = false;
  }
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
els.content.addEventListener("click", (event) => {
  const header = event.target.closest("[data-sort]");
  if (header) {
    const key = header.dataset.sort;
    if (state.sort.key === key) {
      state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    } else {
      state.sort = { key, dir: key === "service_id" || key === "model_id" || key === "status" ? "asc" : "desc" };
    }
    render();
    return;
  }
  const actionButton = event.target.closest("[data-action][data-route-id]");
  if (actionButton) {
    submitRolloutDecision(actionButton.dataset.routeId, actionButton.dataset.action);
    return;
  }
  const ackButton = event.target.closest("[data-ack-anomaly]");
  if (ackButton) {
    submitAnomalyAck(ackButton.dataset.ackAnomaly);
  }
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-llm-gateway-language", state.lang);
  render();
});

syncResponsiveShell();
loadMessages()
  .then(() => loadState())
  .catch((error) => {
    els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  });
