import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  decisions: {},
  route: parseRoute(),
  query: "",
  sort: { key: "lag_pp", dir: "desc" },
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-portfolio-health-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-portfolio-health.sidebarCollapsed";

const CATEGORY_COLORS = ["#334155", "#19715c", "#9a6700", "#7c3aed", "#0369a1", "#b45309", "#be123c", "#4d7c0f"];

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
  watchlistCount: document.querySelector("#watchlist-count"),
  atRiskCount: document.querySelector("#count-atrisk"),
  contractCount: document.querySelector("#count-contracts"),
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
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function money(value, currency = state.snapshot?.base_currency || "USD") {
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

function severityLabel(severity) {
  if (severity === "high") return t("severityHigh");
  if (severity === "watch") return t("severityWatch");
  return t("severityOk");
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
  state.decisions = data.decisions || {};
  render();
}

async function saveDecision(id, patch) {
  const res = await fetch(`/api/contracts/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return;
  const body = await res.json();
  state.decisions[id] = body.decision;
  render();
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
  return Boolean(state.snapshot?.contracts?.length);
}

function watchlistRows() {
  return state.snapshot?.insights?.watchlist || [];
}

function renderShell() {
  applyI18n();
  const insights = state.snapshot?.insights;
  const contractCount = state.snapshot?.contracts?.length || 0;
  const connected = isConnected();
  els.syncStatus.textContent = connected
    ? state.snapshot?.generated_at
      ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
      : t("synced")
    : t("needsConnection");
  if (els.watchlistCount) els.watchlistCount.textContent = watchlistRows().length;
  if (els.atRiskCount) els.atRiskCount.textContent = insights?.totals?.at_risk_count ?? 0;
  if (els.contractCount) els.contractCount.textContent = contractCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = connected
      ? `${money(insights?.totals?.total_aum)} ${t("totalAum").toLowerCase()}`
      : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "contracts") return t("contractsTitle");
  if (view === "concentration") return t("concentrationTitle");
  if (view === "watchlist") return t("watchlistTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function totalsMetricCards() {
  const totals = state.snapshot?.insights?.totals || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("totalAum")}</span><strong>${money(totals.total_aum)}</strong></div>
      <div class="metric"><span>${t("totalCollected")}</span><strong>${money(totals.total_collected)}</strong></div>
      <div class="metric"><span>${t("weightedAvgProgress")}</span><strong>${Number(totals.weighted_avg_progress_pct || 0).toFixed(1)}%</strong></div>
      <div class="metric"><span>${t("atRiskCount")}</span><strong class="${totals.at_risk_count ? "negative" : ""}">${totals.at_risk_count ?? 0}</strong></div>
    </div>
  `;
}

function laggingPanel() {
  const rows = [...(state.snapshot?.insights?.progress || [])]
    .filter((row) => row.severity !== "ok")
    .sort((a, b) => b.lag_pp - a.lag_pp)
    .slice(0, 8);
  if (!rows.length)
    return `<div class="overview-panel"><h2>${t("laggingContracts")}</h2><div class="empty">${t("watchlistEmpty")}</div></div>`;
  return `
    <div class="overview-panel wide">
      <h2>${t("laggingContracts")}</h2>
      <div class="insight-list">
        ${rows
          .map(
            (row) => `
          <div class="insight-row">
            <span class="badge sev-${row.severity}">${escapeHtml(severityLabel(row.severity))}</span>
            <a class="insight-text" href="#/contracts/${encodeURIComponent(row.id)}">${escapeHtml(row.business_name)}<small> · ${escapeHtml(row.category)} · ${t("expectedProgress")} ${row.expected_pct.toFixed(0)}% / ${t("actualProgress")} ${row.actual_pct.toFixed(0)}% (${t("lag")} ${row.lag_pp.toFixed(0)}pp)</small></a>
          </div>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function allocationPanel() {
  const allocation = state.snapshot?.insights?.concentration_by_category || [];
  if (!allocation.length) return "";
  // Thin transparent gaps between slices read as a cleaner, more refined
  // donut than solid abutting wedges. gapPct is expressed in the same
  // percentage-of-circle units as the weights themselves.
  const gapPct = 0.6;
  let acc = 0;
  const gradientStops = allocation
    .map((item, index) => {
      const start = acc;
      const width = Math.max(0, Number(item.weight_pct || 0) - gapPct);
      acc += Number(item.weight_pct || 0);
      const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
      return `${color} ${start.toFixed(2)}% ${(start + width).toFixed(2)}%, transparent ${(start + width).toFixed(2)}% ${acc.toFixed(2)}%`;
    })
    .join(", ");
  const legend = allocation
    .map(
      (item, index) => `
      <div class="alloc-legend-row">
        <span class="alloc-swatch" style="background:${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}"></span>
        <span class="alloc-name">${escapeHtml(item.key)}</span>
        <span class="alloc-weight">${Number(item.weight_pct || 0).toFixed(1)}%</span>
        <span class="alloc-value num">${money(item.funding_amount)}</span>
      </div>
    `,
    )
    .join("");
  const top = allocation[0];
  const centerLabel = top
    ? `<span class="alloc-donut-figure">${Number(top.weight_pct || 0).toFixed(0)}%</span><span class="alloc-donut-caption">${escapeHtml(truncate(top.key, 12))}</span>`
    : "";
  return `
    <div class="overview-panel">
      <h2>${t("concentrationByCategory")}</h2>
      <div class="alloc-body">
        <div class="alloc-donut" style="background:conic-gradient(${gradientStops})" aria-hidden="true"><span class="alloc-donut-hole">${centerLabel}</span></div>
        <div class="alloc-legend">${legend}</div>
      </div>
    </div>
  `;
}

function truncate(value, max) {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
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
    <section class="overview-grid">
      ${allocationPanel()}
      ${laggingPanel()}
    </section>
  `;
}

function sortedContracts(list) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

function contractRows() {
  const progressById = new Map((state.snapshot?.insights?.progress || []).map((row) => [row.id, row]));
  const query = state.query.trim().toLowerCase();
  return (state.snapshot?.contracts || [])
    .map((c) => ({ ...c, ...progressById.get(c.id) }))
    .filter((c) => {
      if (!query) return true;
      return [c.business_name, c.category, c.city, c.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(query));
    });
}

function sortHeader(key, label, cls = "") {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${cls} ${active ? "active" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
}

function contractsTable(rows) {
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  const sorted = sortedContracts(rows);
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortHeader("business_name", t("business"))}
            ${sortHeader("category", t("category"))}
            ${sortHeader("city", t("city"))}
            ${sortHeader("funding_amount", t("fundingAmount"), "num")}
            ${sortHeader("actual_pct", t("actualProgress"), "num")}
            ${sortHeader("lag_pp", t("lag"), "num")}
            ${sortHeader("status", t("status"))}
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((c) => {
              const flagged = state.decisions[c.id]?.flagged;
              return `
            <tr>
              <td><a href="#/contracts/${encodeURIComponent(c.id)}"><span class="strong">${escapeHtml(c.business_name)}</span></a>${flagged ? `<div class="muted"><span class="badge sev-high">${escapeHtml(t("flagged"))}</span></div>` : ""}</td>
              <td>${escapeHtml(c.category)}</td>
              <td>${escapeHtml(c.city)}</td>
              <td class="num">${money(c.funding_amount, c.currency)}</td>
              <td class="num">${(c.actual_pct ?? 0).toFixed(1)}%</td>
              <td class="num ${(c.lag_pp ?? 0) > 0 ? "negative" : ""}">${(c.lag_pp ?? 0).toFixed(1)}pp</td>
              <td><span class="badge">${escapeHtml(c.status)}</span></td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderContracts() {
  els.title.textContent = t("contractsTitle");
  const rows = contractRows();
  els.subtitle.textContent = `${rows.length} ${t("contracts")}`;
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `${totalsMetricCards()}${contractsTable(rows)}`;
}

function concentrationTable(rows, labelKey) {
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>${escapeHtml(t(labelKey))}</th><th class="num">${t("fundingAmount")}</th><th class="num">${t("weight")}</th><th class="num">${t("contracts")}</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <td>${escapeHtml(row.key)}</td>
              <td class="num">${money(row.funding_amount)}</td>
              <td class="num">${row.weight_pct.toFixed(1)}%</td>
              <td class="num">${row.contract_count}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderConcentration() {
  els.title.textContent = t("concentrationTitle");
  els.subtitle.textContent = t("localFilesOnly");
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  const insights = state.snapshot?.insights || {};
  els.content.innerHTML = `
    <section class="overview-grid">
      <div class="overview-panel wide"><h2>${t("concentrationByCategory")}</h2>${concentrationTable(insights.concentration_by_category || [], "category")}</div>
      <div class="overview-panel wide"><h2>${t("concentrationByCity")}</h2>${concentrationTable(insights.concentration_by_city || [], "city")}</div>
    </section>
  `;
}

function sparkline(values) {
  if (!values.length) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * 100;
    const y = 28 - ((v - min) / span) * 24 - 2;
    return [x, y];
  });
  // Catmull-Rom -> cubic Bezier smoothing so the trend reads as a gentle
  // curve rather than a jagged polyline.
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1][0].toFixed(2)},30 L ${points[0][0].toFixed(2)},30 Z`;
  const gradientId = `spark-fill-${Math.random().toString(36).slice(2, 9)}`;
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.22" />
        <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#${gradientId})" stroke="none"></path>
    <path d="${linePath}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>`;
}

function smoothPath(points) {
  if (points.length < 3) {
    return `M ${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L ")}`;
  }
  let d = `M ${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

function renderWatchlist() {
  els.title.textContent = t("watchlistTitle");
  const rows = watchlistRows();
  els.subtitle.textContent = `${rows.length} ${t("contracts")}`;
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  if (!rows.length) {
    els.content.innerHTML = `<div class="empty">${t("watchlistEmpty")}</div>`;
    return;
  }
  els.content.innerHTML = `
    <div class="watchlist-grid">
      ${rows
        .map((row) => {
          const decision = state.decisions[row.id] || {};
          return `
        <div class="watchlist-card">
          <div class="row between">
            <a href="#/contracts/${encodeURIComponent(row.id)}"><strong>${escapeHtml(row.business_name)}</strong></a>
            <span class="badge sev-high">${pct(row.decline_pct)}</span>
          </div>
          <div class="muted">${escapeHtml(row.category)} · ${escapeHtml(row.city)}</div>
          <div class="spark-wrap negative">${sparkline(row.monthly_revenue)}</div>
          <div class="muted">${t("recentRevenue")}: ${money(row.recent_revenue)}</div>
          <div class="row watchlist-actions">
            <button type="button" data-action="toggle-flag" data-id="${escapeHtml(row.id)}" class="${decision.flagged ? "primary" : ""}">${decision.flagged ? escapeHtml(t("clearFlag")) : escapeHtml(t("flagForReview"))}</button>
          </div>
        </div>
      `;
        })
        .join("")}
    </div>
  `;
}

function renderContractDetail() {
  const contract = (state.snapshot?.contracts || []).find((item) => item.id === state.route.id);
  if (!contract) {
    renderContracts();
    return;
  }
  const progress = (state.snapshot?.insights?.progress || []).find((row) => row.id === contract.id) || {};
  const decision = state.decisions[contract.id] || { flagged: false, note: "" };
  els.title.textContent = contract.business_name;
  els.subtitle.textContent = `${contract.category} · ${contract.city}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/contracts">← ${t("back")}</a>
        <div class="metrics">
          <div class="metric"><span>${t("fundingAmount")}</span><strong>${money(contract.funding_amount, contract.currency)}</strong></div>
          <div class="metric"><span>${t("capAmount")}</span><strong>${money(contract.cap_amount, contract.currency)}</strong></div>
          <div class="metric"><span>${t("cumulativeRepayment")}</span><strong>${money(contract.cumulative_repayment, contract.currency)}</strong></div>
          <div class="metric"><span>${t("lag")}</span><strong class="${(progress.lag_pp ?? 0) > 0 ? "negative" : ""}">${(progress.lag_pp ?? 0).toFixed(1)}pp</strong></div>
        </div>
        <div class="overview-panel">
          <h2>${t("revenueTrend")}</h2>
          <div class="spark-wrap">${sparkline(contract.monthly_revenue)}</div>
        </div>
        <div class="overview-panel review-panel">
          <h2>${t("reviewNote")}</h2>
          <textarea id="reviewNote" rows="3" placeholder="${escapeHtml(t("reviewNote"))}">${escapeHtml(decision.note || "")}</textarea>
          <div class="row watchlist-actions">
            <button type="button" data-action="toggle-flag" data-id="${escapeHtml(contract.id)}" class="${decision.flagged ? "primary" : ""}">${decision.flagged ? escapeHtml(t("clearFlag")) : escapeHtml(t("flagForReview"))}</button>
            <button type="button" data-action="save-note" data-id="${escapeHtml(contract.id)}">${escapeHtml(t("saveNote"))}</button>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("contractDetail")}</h2>
        <dl>
          <dt>${t("originationDate")}</dt><dd>${escapeHtml(contract.origination_date)}</dd>
          <dt>${t("monthsSince")}</dt><dd>${contract.months_since_origination}</dd>
          <dt>${t("term")}</dt><dd>${contract.expected_term_months}</dd>
          <dt>${t("capMultiple")}</dt><dd>${contract.cap_multiple.toFixed(2)}×</dd>
          <dt>${t("status")}</dt><dd>${escapeHtml(contract.status)}</dd>
          <dt>${t("expectedProgress")}</dt><dd>${(progress.expected_pct ?? 0).toFixed(1)}%</dd>
          <dt>${t("actualProgress")}</dt><dd>${(progress.actual_pct ?? 0).toFixed(1)}%</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const policy = summary.risk_policy || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("fundName")}</dt><dd>${escapeHtml(summary.fund_name || "")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("riskPolicy")}</h2>
        <dl>
          <dt>${t("lagWatch")}</dt><dd>${policy.lag_watch_pp ?? "—"}</dd>
          <dt>${t("lagHigh")}</dt><dd>${policy.lag_high_pp ?? "—"}</dd>
          <dt>${t("revenueDeclineThreshold")}</dt><dd>${policy.revenue_decline_pct ?? "—"}</dd>
        </dl>
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "contracts" && state.route.id) renderContractDetail();
  else if (state.route.view === "contracts") renderContracts();
  else if (state.route.view === "concentration") renderConcentration();
  else if (state.route.view === "watchlist") renderWatchlist();
  else if (state.route.view === "settings") renderSettings();
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
els.content.addEventListener("click", (event) => {
  const header = event.target.closest("[data-sort]");
  if (header) {
    const key = header.dataset.sort;
    if (state.sort.key === key) {
      state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    } else {
      state.sort = { key, dir: key === "business_name" || key === "category" || key === "city" ? "asc" : "desc" };
    }
    render();
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const id = actionButton.dataset.id;
  if (actionButton.dataset.action === "toggle-flag") {
    const flagged = !state.decisions[id]?.flagged;
    saveDecision(id, { flagged });
  } else if (actionButton.dataset.action === "save-note") {
    const note = document.querySelector("#reviewNote")?.value || "";
    saveDecision(id, { note });
  }
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-portfolio-health-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
