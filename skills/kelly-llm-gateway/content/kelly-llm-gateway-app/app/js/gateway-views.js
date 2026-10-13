import {
  DETAIL_MODES,
  anomalies,
  anomalyById,
  detailUrl,
  els,
  enumLabel,
  errorRatePct,
  escapeHtml,
  loadState,
  midRolloutRoutes,
  modelInfo,
  money,
  noticeBanner,
  num,
  openAnomalies,
  pagination,
  readyToPromoteRoutes,
  recordUrl,
  routeById,
  routes,
  serviceName,
  signedPct,
  sortedRoutes,
  state,
  statusBadgeClass,
  t,
  trendDayLabel,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const emptyState = (title, detail = "") =>
  `<div class="empty"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav/sidebar do not already show (the sidebar's attention
// block already carries the anomaly/rollout counts).
function metricsBand() {
  const totals = state.snapshot?.totals || {};
  return [
    [t("costToday"), money(totals.cost_today)],
    [t("callsToday"), num(totals.calls_today)],
    [t("errorRateToday"), errorRatePct(totals.error_rate_today)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
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
    <div class="card overview-panel wide">
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

function rolloutSummaryPanel() {
  const active = routes()
    .filter((r) => r.status !== "stable")
    .slice(0, 6);
  if (!active.length) return "";
  const rows = active
    .map(
      (route) => `
      <a class="mover-row" href="${recordUrl(route.route_id, "rollouts")}">
        <span><strong>${escapeHtml(serviceName(route.service_id))}</strong><small>${escapeHtml(modelInfo(route.model_id).display_name)}</small></span>
        <span class="badge ${statusBadgeClass(route.status)}">${escapeHtml(enumLabel(route.status, "status"))}</span>
        <span class="num">${route.canary_pct}%</span>
      </a>
    `,
    )
    .join("");
  return `
    <div class="card overview-panel">
      <h2>${t("rolloutBoard")}</h2>
      ${rows}
    </div>
  `;
}

function anomalyPreviewPanel() {
  const items = openAnomalies().slice(0, 6);
  return `
    <div class="card overview-panel">
      <h2>${t("anomalyList")}</h2>
      ${
        items.length
          ? `<div class="insight-list">${items.map((a) => anomalyPreviewRow(a)).join("")}</div>`
          : `<div class="insight-empty">${t("anomalyEmpty")}</div>`
      }
    </div>
  `;
}

function anomalyPreviewRow(anomaly) {
  const route = routeById(anomaly.route_id);
  const label = route
    ? `${serviceName(route.service_id)} · ${modelInfo(route.model_id).display_name}`
    : anomaly.route_id;
  const severity = ["watch", "high"].includes(anomaly.severity) ? anomaly.severity : "watch";
  return `
    <a class="insight-row anomaly-row" href="${recordUrl(anomaly.id, "anomalies")}" data-severity="${severity}">
      <span class="badge sev-${severity}">${escapeHtml(enumLabel(anomaly.kind, "kind"))}</span>
      <span class="insight-text"><strong>${escapeHtml(label)}</strong><br>${escapeHtml(anomalyLabel(anomaly))}</span>
    </a>
  `;
}

export function renderOverview() {
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  document.getElementById("overviewSummary").textContent = generated ? `${t("generated")} ${generated}` : t("empty");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    ${spendTrendPanel()}
    <section class="overview-grid">
      ${rolloutSummaryPanel()}
      ${anomalyPreviewPanel()}
    </section>
  `;
}

// ── Record views ─────────────────────────────────────────────────────────
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function sortHeader(key, label, cls = "") {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${cls} ${active ? "active" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
}

function filteredRoutes(list) {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return list;
  return list.filter((route) => {
    const model = modelInfo(route.model_id);
    return [serviceName(route.service_id), model.display_name, model.provider, route.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function routesTable(items, { columns = "full" } = {}) {
  if (!items.length) return emptyState(state.route.query ? t("noMatches") : t("empty"));
  const rows = sortedRoutes(items);
  const groupByService = state.sort.key === "service_id";
  let lastService = null;
  const head =
    columns === "full"
      ? [
          [t("service")],
          [t("model")],
          [t("calls"), "ws-col-num"],
          [t("cost"), "ws-col-num"],
          [t("errorRate"), "ws-col-num"],
          [t("canaryPct"), "ws-col-narrow ws-col-num"],
          [t("status"), "ws-col-narrow"],
        ]
      : [[t("service")], [t("model")], [t("canaryPct"), "ws-col-narrow ws-col-num"], [t("status"), "ws-col-narrow"]];
  const body = rows
    .map((route, index) => {
      const model = modelInfo(route.model_id);
      const isGroupStart = groupByService && route.service_id !== lastService;
      lastService = route.service_id;
      const full = `
        ${rowOpen(route.route_id)}
          <td class="${isGroupStart && index > 0 ? "group-start" : ""}"><span class="strong">${escapeHtml(serviceName(route.service_id))}</span></td>
          <td class="${isGroupStart && index > 0 ? "group-start" : ""}">
            <span class="model-name">${escapeHtml(model.display_name)}</span>
            <div class="model-provider">${escapeHtml(model.provider)} · <span class="badge">${escapeHtml(enumLabel(model.tier, "tier"))}</span></div>
          </td>
          <td class="ws-col-num">${num(route.calls_today)}</td>
          <td class="ws-col-num">${money(route.cost_today)}</td>
          <td class="ws-col-num">${errorRatePct(route.error_rate_today)}</td>
          <td class="ws-col-narrow ws-col-num">${route.canary_pct}%</td>
          <td class="ws-col-narrow"><span class="badge ${statusBadgeClass(route.status)}">${escapeHtml(enumLabel(route.status, "status"))}</span></td>
        </tr>
      `;
      const compact = `
        ${rowOpen(route.route_id)}
          <td><span class="strong">${escapeHtml(serviceName(route.service_id))}</span></td>
          <td>
            <span class="model-name">${escapeHtml(model.display_name)}</span>
            <div class="model-provider">${escapeHtml(model.provider)}</div>
          </td>
          <td class="ws-col-narrow ws-col-num">${route.canary_pct}%</td>
          <td class="ws-col-narrow"><span class="badge ${statusBadgeClass(route.status)}">${escapeHtml(enumLabel(route.status, "status"))}</span></td>
        </tr>
      `;
      return columns === "full" ? full : compact;
    })
    .join("");
  return `<table class="ws-table">${tableHead(head)}<tbody>${body}</tbody></table>`;
}

export function renderSpend() {
  els.viewTitle.textContent = t("spend");
  els.viewTitle.title = t("spendByServiceModel");
  const items = filteredRoutes(routes());
  els.viewCount.textContent = String(pagination.total("routes", items.length));
  els.listPanel.innerHTML = `${routesTable(items, { columns: "full" })}${pagination.control("routes")}`;
  renderDetail();
}

export function renderRollouts() {
  els.viewTitle.textContent = t("rollouts");
  els.viewTitle.title = t("rolloutBoard");
  const active = filteredRoutes(routes().filter((r) => r.status !== "stable"));
  els.viewCount.textContent = String(active.length);
  els.listPanel.innerHTML = `${routesTable(active, { columns: "compact" })}${pagination.control("routes")}`;
  renderDetail();
}

function anomalyLabel(anomaly) {
  const lang = document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
  const raw =
    state.messages[lang]?.anomalyTemplate?.[anomaly.kind] || state.messages.en?.anomalyTemplate?.[anomaly.kind] || "";
  const fmt = (value) => (anomaly.kind === "error_spike" ? errorRatePct(value) : money(value));
  return raw
    .replace("{actual}", fmt(anomaly.actual))
    .replace("{baseline}", fmt(anomaly.baseline))
    .replace("{delta}", signedPct(anomaly.delta_pct));
}

function anomaliesTable(items) {
  if (!items.length) return emptyState(t("anomalyEmpty"));
  const head = [
    [t("kind"), "ws-col-narrow"],
    [t("service")],
    [t("delta"), "ws-col-num"],
    [t("status"), "ws-col-narrow"],
  ];
  const body = items
    .map((anomaly) => {
      const route = routeById(anomaly.route_id);
      const label = route
        ? `${serviceName(route.service_id)} · ${modelInfo(route.model_id).display_name}`
        : anomaly.route_id;
      const severity = ["watch", "high"].includes(anomaly.severity) ? anomaly.severity : "watch";
      const acknowledged = anomaly.status === "acknowledged";
      return `
        ${rowOpen(anomaly.id)}
          <td class="ws-col-narrow"><span class="badge sev-${severity}">${escapeHtml(enumLabel(anomaly.kind, "kind"))}</span></td>
          <td><span class="strong">${escapeHtml(label)}</span></td>
          <td class="ws-col-num">${escapeHtml(signedPct(anomaly.delta_pct))}</td>
          <td class="ws-col-narrow">${acknowledged ? escapeHtml(t("acknowledged")) : escapeHtml(t("open"))}</td>
        </tr>
      `;
    })
    .join("");
  return `<table class="ws-table">${tableHead(head)}<tbody>${body}</tbody></table>`;
}

export function renderAnomalies() {
  els.viewTitle.textContent = t("anomalies");
  els.viewTitle.title = t("anomalyList");
  const items = anomalies();
  els.viewCount.textContent = String(items.length);
  els.listPanel.innerHTML = anomaliesTable(items);
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectRoute")) : "";
    return;
  }
  if (view === "anomalies") {
    const anomaly = anomalyById(selectedId);
    els.detailBody.innerHTML = anomaly
      ? anomalyDetail(anomaly)
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  const route = routeById(selectedId);
  if (!route) {
    const pending = state.extra.has(selectedId) && state.extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = routeDetail(route);
}

function routeDetail(route) {
  const model = modelInfo(route.model_id);
  const disabled = state.busy ? "disabled" : "";
  return `
    <div class="route-detail" data-status="${escapeHtml(route.status)}">
      <header class="detail-head">
        <h2>${escapeHtml(serviceName(route.service_id))}</h2>
        <p class="muted">${escapeHtml([model.display_name, model.provider, enumLabel(model.tier, "tier")].filter(Boolean).join(" · "))}</p>
      </header>
      ${warnings()}
      <div class="row between">
        <span class="badge ${statusBadgeClass(route.status)}">${escapeHtml(enumLabel(route.status, "status"))}</span>
        <span class="muted">${escapeHtml(t("rollbackReady"))}: ${route.rollback_ready ? escapeHtml(t("ready")) : escapeHtml(t("notReady"))}</span>
      </div>
      <div class="row stats">
        <span>${escapeHtml(t("callsToday"))} ${num(route.calls_today)}</span>
        <span>${escapeHtml(t("costToday"))} ${money(route.cost_today)}</span>
        <span>${escapeHtml(t("errorRate"))} ${errorRatePct(route.error_rate_today)}</span>
      </div>
      <div class="rollout-progress"><div class="rollout-progress-fill" style="width:${route.canary_pct}%"></div></div>
      <div class="rollout-progress-label"><span>${route.canary_pct}% ${escapeHtml(t("canaryPct").toLowerCase())}</span><span>100%</span></div>
      ${route.note ? `<div class="muted rollout-note">${escapeHtml(t("note"))}: ${escapeHtml(route.note)}</div>` : ""}
      ${noticeBanner()}
      <textarea class="decision-note" data-route-id="${escapeHtml(route.route_id)}" placeholder="${escapeHtml(t("decisionNote"))}" rows="2"></textarea>
      <div class="rollout-actions">
        <button type="button" data-action="promote" data-route-id="${escapeHtml(route.route_id)}" ${disabled}>${escapeHtml(t("promote"))}</button>
        <button type="button" data-action="hold" data-route-id="${escapeHtml(route.route_id)}" ${disabled}>${escapeHtml(t("hold"))}</button>
        <button type="button" data-action="rollback" data-route-id="${escapeHtml(route.route_id)}" ${disabled}>${escapeHtml(t("rollback"))}</button>
      </div>
    </div>
  `;
}

function anomalyDetail(anomaly) {
  const route = routeById(anomaly.route_id);
  const label = route
    ? `${serviceName(route.service_id)} · ${modelInfo(route.model_id).display_name}`
    : anomaly.route_id;
  const severity = ["watch", "high"].includes(anomaly.severity) ? anomaly.severity : "watch";
  const acknowledged = anomaly.status === "acknowledged";
  const disabled = state.busy ? "disabled" : "";
  return `
    <header class="detail-head">
      <h2>${escapeHtml(label)}</h2>
      <p class="muted"><span class="badge sev-${severity}">${escapeHtml(enumLabel(anomaly.kind, "kind"))}</span></p>
    </header>
    <p>${escapeHtml(anomalyLabel(anomaly))}</p>
    <div class="row stats">
      <span>${escapeHtml(t("baseline"))} ${anomaly.kind === "error_spike" ? errorRatePct(anomaly.baseline) : money(anomaly.baseline)}</span>
      <span>${escapeHtml(t("actual"))} ${anomaly.kind === "error_spike" ? errorRatePct(anomaly.actual) : money(anomaly.actual)}</span>
      <span>${escapeHtml(t("delta"))} ${escapeHtml(signedPct(anomaly.delta_pct))}</span>
    </div>
    ${noticeBanner()}
    ${
      acknowledged
        ? `<div class="muted">${escapeHtml(t("acknowledged"))}${anomaly.ack_note ? `: ${escapeHtml(anomaly.ack_note)}` : ""}</div>`
        : `<div class="anomaly-ack">
            <textarea class="ack-note" data-anomaly-id="${escapeHtml(anomaly.id)}" placeholder="${escapeHtml(t("ackNote"))}" rows="3"></textarea>
            <button type="button" data-ack-anomaly="${escapeHtml(anomaly.id)}" ${disabled}>${escapeHtml(t("acknowledge"))}</button>
          </div>`
    }
  `;
}

// Direct rollout write: goes straight through the active provider (Busabase
// or demo), the same way kelly-lead-funnel's kanban stage moves work — there
// is no separate approval step, since this is a direct-manipulation control
// panel. Demo mode never writes anywhere; it only reflects the decision in
// the in-memory snapshot already rendered.
export async function submitRolloutDecision(routeId, action) {
  if (state.demo) {
    const route = routeById(routeId);
    if (route) {
      if (action === "promote") Object.assign(route, { status: "stable", canary_pct: 100, rollback_ready: false });
      else if (action === "rollback") Object.assign(route, { status: "rollback", rollback_ready: false });
      else if (action === "hold") Object.assign(route, { status: "hold" });
    }
    renderDetail();
    return;
  }
  const noteEl = document.querySelector(`.decision-note[data-route-id="${CSS.escape(routeId)}"]`);
  state.busy = true;
  renderDetail();
  try {
    const provider = await getProvider();
    await provider.decideRollout(routeId, action, noteEl?.value || "");
    await loadState();
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    renderDetail();
  } finally {
    state.busy = false;
  }
}

export async function submitAnomalyAck(anomalyId) {
  if (state.demo) {
    const anomaly = anomalyById(anomalyId);
    if (anomaly) Object.assign(anomaly, { status: "acknowledged", acknowledged_at: new Date().toISOString() });
    renderDetail();
    return;
  }
  const noteEl = document.querySelector(`.ack-note[data-anomaly-id="${CSS.escape(anomalyId)}"]`);
  state.busy = true;
  renderDetail();
  try {
    const provider = await getProvider();
    await provider.ackAnomaly(anomalyId, noteEl?.value || "");
    await loadState();
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    renderDetail();
  } finally {
    state.busy = false;
  }
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const gateway = summary.gateway || {};
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      <div class="empty boundary-note">${escapeHtml(t("boundary"))}</div>
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
        <h2>${t("gateway")}</h2>
        <dl>
          <dt>${t("region")}</dt><dd>${escapeHtml(gateway.region || "")}</dd>
          <dt>${t("baseUrl")}</dt><dd>${escapeHtml(gateway.base_url || "")}</dd>
          <dt>${t("apiKeyEnv")}</dt><dd>${escapeHtml(gateway.api_key_env || "")}</dd>
        </dl>
      </section>
    </div>
  `;
}
