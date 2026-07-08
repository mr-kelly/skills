import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  sort: { key: "market_value", dir: "desc" },
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-invest-webull-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-invest-webull.sidebarCollapsed";

const ASSET_COLORS = {
  STOCK: "#334155",
  ETF: "#19715c",
  CRYPTO: "#9a6700",
  OPTION: "#7c3aed",
  OTHER: "#6b7280",
};

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
  summaryPnl: document.querySelector("#summary-pnl"),
  pnlArrow: document.querySelector("#pnl-arrow"),
  positionCount: document.querySelector("#count-positions"),
  accountCount: document.querySelector("#count-accounts"),
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

function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function signedMoney(value, currency) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${money(n, currency)}`;
}

function pct(value) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function num(value, digits = 4) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function pnlClass(value) {
  const n = Number(value || 0);
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "";
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
    scenario === "positions"
      ? "#/positions"
      : scenario === "accounts"
        ? "#/accounts"
        : scenario === "detail"
          ? "#/positions/AAPL"
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
  return Boolean(state.snapshot?.positions?.length) || Boolean(state.settings?.demo);
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const totals = snapshot?.totals || {};
  const positionCount = snapshot?.positions?.length || 0;
  const accountCount = snapshot?.accounts?.length || 0;
  const connected = isConnected();
  els.syncStatus.textContent = connected
    ? snapshot?.generated_at
      ? `${t("generated")} ${new Date(snapshot.generated_at).toLocaleString()}`
      : t("synced")
    : t("needsConnection");
  if (els.summaryPnl)
    els.summaryPnl.textContent = connected
      ? `${signedMoney(totals.unrealized_pnl)} (${pct(totals.unrealized_pnl_pct)})`
      : "—";
  if (els.summaryPnl) els.summaryPnl.className = `human-work-figure ${pnlClass(totals.unrealized_pnl)}`;
  if (els.pnlArrow) {
    els.pnlArrow.textContent = Number(totals.unrealized_pnl || 0) < 0 ? "↓" : "↑";
    els.pnlArrow.className = pnlClass(totals.unrealized_pnl);
  }
  if (els.positionCount) els.positionCount.textContent = positionCount;
  if (els.accountCount) els.accountCount.textContent = accountCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = connected
      ? `${signedMoney(totals.unrealized_pnl)} · ${positionCount} ${t("positions")}`
      : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "positions") return t("positionsTitle");
  if (view === "accounts") return t("accountsTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function totalsMetricCards() {
  const totals = state.snapshot?.totals || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("marketValue")}</span><strong>${money(totals.market_value)}</strong></div>
      <div class="metric"><span>${t("unrealizedPnl")}</span><strong class="${pnlClass(totals.unrealized_pnl)}">${signedMoney(totals.unrealized_pnl)} <small>${pct(totals.unrealized_pnl_pct)}</small></strong></div>
      <div class="metric"><span>${t("dayChange")}</span><strong class="${pnlClass(totals.day_change)}">${signedMoney(totals.day_change)} <small>${pct(totals.day_change_pct)}</small></strong></div>
      <div class="metric"><span>${t("cash")}</span><strong>${money(totals.total_cash)}</strong></div>
    </div>
  `;
}

function allocationPanel() {
  const allocation = state.snapshot?.allocation || [];
  if (!allocation.length) return "";
  let acc = 0;
  const gradientStops = allocation
    .map((item) => {
      const start = acc;
      acc += Number(item.weight_pct || 0);
      const color = ASSET_COLORS[item.asset_type] || ASSET_COLORS.OTHER;
      return `${color} ${start.toFixed(2)}% ${acc.toFixed(2)}%`;
    })
    .join(", ");
  const legend = allocation
    .map(
      (item) => `
      <div class="alloc-legend-row">
        <span class="alloc-swatch" style="background:${ASSET_COLORS[item.asset_type] || ASSET_COLORS.OTHER}"></span>
        <span class="alloc-name">${escapeHtml(enumLabel(item.asset_type, "asset_type"))}</span>
        <span class="alloc-weight">${Number(item.weight_pct || 0).toFixed(1)}%</span>
        <span class="alloc-value num">${money(item.market_value)}</span>
      </div>
    `,
    )
    .join("");
  return `
    <div class="overview-panel">
      <h2>${t("allocation")}</h2>
      <div class="alloc-body">
        <div class="alloc-donut" style="background:conic-gradient(${gradientStops})" aria-hidden="true"><span class="alloc-donut-hole"></span></div>
        <div class="alloc-legend">${legend}</div>
      </div>
    </div>
  `;
}

function insightLabel(code, params) {
  const lang = activeLang();
  const template = messages[lang]?.insightTemplate?.[code] || messages.en.insightTemplate?.[code] || "";
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_, key) => insightParam(code, key, params?.[key]));
}

function insightParam(code, key, value) {
  if (value == null) return "";
  if (key === "asset_type") return enumLabel(value, "asset_type");
  if (key === "amount") return money(value);
  if (key === "delta") {
    const n = Number(value || 0);
    return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
  }
  // top_gainer / top_laggard carry a signed unrealized P/L percent.
  if (key === "pct" && (code === "top_gainer" || code === "top_laggard")) return pct(value);
  if (key === "pct" || key === "actual" || key === "target") return Number(value || 0).toFixed(1);
  return String(value);
}

function insightsPanel() {
  const insights = state.snapshot?.insights || [];
  if (!insights.length) return "";
  const rows = insights
    .map((insight) => {
      const severity = ["info", "watch", "high"].includes(insight.severity) ? insight.severity : "info";
      const category = messages[activeLang()]?.insightCategory?.[insight.category];
      const text = insightLabel(insight.code, insight.params);
      return `
      <div class="insight-row">
        <span class="badge sev-${severity}">${escapeHtml(category || insight.severity)}</span>
        <span class="insight-text">${escapeHtml(text)}</span>
      </div>`;
    })
    .join("");
  return `
    <div class="overview-panel wide">
      <h2>${t("insights")}</h2>
      <div class="insight-list">${rows}</div>
    </div>
  `;
}

function topMoversPanel() {
  const positions = [...(state.snapshot?.positions || [])]
    .sort((a, b) => Math.abs(Number(b.day_change_pct || 0)) - Math.abs(Number(a.day_change_pct || 0)))
    .slice(0, 6);
  return `
    <div class="overview-panel">
      <h2>${t("topMovers")}</h2>
      ${positions
        .map(
          (position) => `
        <a class="mover-row" href="#/positions/${encodeURIComponent(position.symbol)}">
          <span><strong>${escapeHtml(position.symbol)}</strong><small>${escapeHtml(position.name || "")}</small></span>
          <span class="num">${money(position.last_price, position.currency)}</span>
          <span class="num ${pnlClass(position.day_change_pct)}">${pct(position.day_change_pct)}</span>
        </a>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  if (!isConnected()) {
    els.content.innerHTML = `${warnings()}<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `
    ${totalsMetricCards()}
    ${warnings()}
    <section class="overview-grid">
      ${allocationPanel()}
      ${topMoversPanel()}
      ${insightsPanel()}
    </section>
  `;
}

function sortedPositions(list) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

function filteredPositions(accountId = "") {
  const query = state.query.trim().toLowerCase();
  return (state.snapshot?.positions || []).filter((position) => {
    if (accountId && position.account_id !== accountId) return false;
    if (!query) return true;
    return [position.symbol, position.name, position.asset_type, position.account_id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function sortHeader(key, label, cls = "") {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${cls} ${active ? "active" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
}

function positionsTable(positions) {
  if (!positions.length) return `<div class="empty">${t("empty")}</div>`;
  const rows = sortedPositions(positions);
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortHeader("symbol", t("symbol"))}
            ${sortHeader("name", t("name"))}
            ${sortHeader("quantity", t("qty"), "num")}
            ${sortHeader("avg_cost", t("avgCost"), "num")}
            ${sortHeader("last_price", t("last"), "num")}
            ${sortHeader("market_value", t("marketValue"), "num")}
            ${sortHeader("unrealized_pnl_pct", t("unrealizedPnl"), "num")}
            ${sortHeader("weight_pct", t("weight"), "num")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (position) => `
            <tr>
              <td><a href="#/positions/${encodeURIComponent(position.symbol)}"><span class="strong">${escapeHtml(position.symbol)}</span></a><div class="muted"><span class="badge">${escapeHtml(enumLabel(position.asset_type, "asset_type"))}</span></div></td>
              <td>${escapeHtml(position.name || "")}<div class="muted">${escapeHtml(accountName(position.account_id))}</div></td>
              <td class="num">${num(position.quantity)}</td>
              <td class="num">${money(position.avg_cost, position.currency)}</td>
              <td class="num">${money(position.last_price, position.currency)}</td>
              <td class="num">${money(position.market_value, position.currency)}</td>
              <td class="num ${pnlClass(position.unrealized_pnl)}">${signedMoney(position.unrealized_pnl, position.currency)}<div class="muted ${pnlClass(position.unrealized_pnl_pct)}">${pct(position.unrealized_pnl_pct)}</div></td>
              <td class="num">${Number(position.weight_pct || 0).toFixed(1)}%</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPositions() {
  els.title.textContent = t("positionsTitle");
  const positions = filteredPositions();
  els.subtitle.textContent = `${positions.length} ${t("positions")}`;
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  els.content.innerHTML = `${totalsMetricCards()}${warnings()}${positionsTable(positions)}`;
}

function accountName(accountId) {
  return state.snapshot?.accounts?.find((account) => account.account_id === accountId)?.display_name || accountId;
}

function renderAccounts() {
  els.title.textContent = t("accountsTitle");
  const accounts = state.snapshot?.accounts || [];
  els.subtitle.textContent = `${accounts.length} ${t("accounts")}`;
  els.content.innerHTML = accounts.length
    ? `
    <div class="account-grid">
      ${accounts
        .map((account) => {
          const owned = (state.snapshot?.positions || []).filter((p) => p.account_id === account.account_id);
          const marketValue = owned.reduce((sum, p) => sum + Number(p.market_value || 0), 0);
          return `
        <a class="account-card" href="#/accounts/${encodeURIComponent(account.account_id)}">
          <div class="row between"><strong>${escapeHtml(account.display_name)}</strong><span class="badge">${escapeHtml(enumLabel(account.account_type, "account_type"))}</span></div>
          <div class="muted">${escapeHtml(account.account_id)} · ${escapeHtml(account.currency)}</div>
          <div class="balance">${money(account.net_liquidation, account.currency)}</div>
          <div class="row stats">
            <span>${t("marketValue")} ${money(marketValue, account.currency)}</span>
            <span>${t("cash")} ${money(account.total_cash, account.currency)}</span>
            <span>${t("buyingPower")} ${money(account.buying_power, account.currency)}</span>
          </div>
          <div class="muted">${owned.length} ${t("positions")}</div>
        </a>
      `;
        })
        .join("")}
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

function accountMetricCards(account, positions) {
  const marketValue = positions.reduce((sum, p) => sum + Number(p.market_value || 0), 0);
  const costBasis = positions.reduce((sum, p) => sum + Number(p.cost_basis || 0), 0);
  const pnl = marketValue - costBasis;
  const pnlPct = costBasis ? (pnl / costBasis) * 100 : 0;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("netLiquidation")}</span><strong>${money(account.net_liquidation, account.currency)}</strong></div>
      <div class="metric"><span>${t("marketValue")}</span><strong>${money(marketValue, account.currency)}</strong></div>
      <div class="metric"><span>${t("unrealizedPnl")}</span><strong class="${pnlClass(pnl)}">${signedMoney(pnl, account.currency)} <small>${pct(pnlPct)}</small></strong></div>
      <div class="metric"><span>${t("buyingPower")}</span><strong>${money(account.buying_power, account.currency)}</strong></div>
    </div>
  `;
}

function renderAccountDetail() {
  const account = state.snapshot?.accounts?.find((item) => item.account_id === state.route.id);
  if (!account) {
    renderAccounts();
    return;
  }
  const positions = filteredPositions(account.account_id);
  els.title.textContent = account.display_name;
  els.subtitle.textContent = `${enumLabel(account.account_type, "account_type")} · ${account.currency}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/accounts">← ${t("back")}</a>
        ${warnings(account.account_id)}
        ${accountMetricCards(account, positions)}
        ${positions.length ? positionsTable(positions) : `<div class="empty">${t("noPositions")}</div>`}
      </div>
      <aside class="detail-side">
        <h2>${t("accountDetail")}</h2>
        <dl>
          <dt>${t("accountType")}</dt><dd>${escapeHtml(enumLabel(account.account_type, "account_type"))}</dd>
          <dt>${t("accountId")}</dt><dd>${escapeHtml(account.account_id)}</dd>
          <dt>${t("currency")}</dt><dd>${escapeHtml(account.currency)}</dd>
          <dt>${t("netLiquidation")}</dt><dd>${money(account.net_liquidation, account.currency)}</dd>
          <dt>${t("cash")}</dt><dd>${money(account.total_cash, account.currency)}</dd>
          <dt>${t("buyingPower")}</dt><dd>${money(account.buying_power, account.currency)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderPositionDetail() {
  const position = (state.snapshot?.positions || []).find((item) => item.symbol === state.route.id);
  if (!position) {
    renderPositions();
    return;
  }
  els.title.textContent = position.symbol;
  els.subtitle.textContent = `${position.name || ""} · ${enumLabel(position.asset_type, "asset_type")}`;
  els.content.innerHTML = `
    <section class="detail position-detail">
      <div class="detail-main">
        <a class="back-link" href="#/positions">← ${t("back")}</a>
        <div class="metrics">
          <div class="metric"><span>${t("marketValue")}</span><strong>${money(position.market_value, position.currency)}</strong></div>
          <div class="metric"><span>${t("unrealizedPnl")}</span><strong class="${pnlClass(position.unrealized_pnl)}">${signedMoney(position.unrealized_pnl, position.currency)} <small>${pct(position.unrealized_pnl_pct)}</small></strong></div>
          <div class="metric"><span>${t("dayChange")}</span><strong class="${pnlClass(position.day_change)}">${signedMoney(position.day_change, position.currency)} <small>${pct(position.day_change_pct)}</small></strong></div>
          <div class="metric"><span>${t("weight")}</span><strong>${Number(position.weight_pct || 0).toFixed(1)}% <small>${t("ofPortfolio")}</small></strong></div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("positionDetail")}</h2>
        <dl>
          <dt>${t("name")}</dt><dd>${escapeHtml(position.name || "")}</dd>
          <dt>${t("accounts")}</dt><dd><a href="#/accounts/${encodeURIComponent(position.account_id)}">${escapeHtml(accountName(position.account_id))}</a></dd>
          <dt>${t("qty")}</dt><dd>${num(position.quantity)}</dd>
          <dt>${t("avgCost")}</dt><dd>${money(position.avg_cost, position.currency)}</dd>
          <dt>${t("last")}</dt><dd>${money(position.last_price, position.currency)}</dd>
          <dt>${t("costBasis")}</dt><dd>${money(position.cost_basis, position.currency)}</dd>
          <dt>${t("currency")}</dt><dd>${escapeHtml(position.currency)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const webull = summary.webull || {};
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
        <h2>Webull</h2>
        <dl>
          <dt>${t("region")}</dt><dd>${escapeHtml(webull.region || "")}</dd>
          <dt>${t("baseUrl")}</dt><dd>${escapeHtml(webull.base_url || "")}</dd>
          <dt>${t("secretsReady")}</dt><dd>${webull.secrets_ready ? t("secretsReady") : t("missingSecrets")}</dd>
        </dl>
        <div class="settings-account">
          <strong>${escapeHtml((webull.secret_envs || []).join(", ") || t("missingSecrets"))}</strong>
          <span>${webull.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
        </div>
      </section>
    </div>
  `;
}

function warnings(accountId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !accountId || !item.account_id || item.account_id === accountId,
  );
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
  if (state.route.view === "accounts" && state.route.id) renderAccountDetail();
  else if (state.route.view === "accounts") renderAccounts();
  else if (state.route.view === "positions" && state.route.id) renderPositionDetail();
  else if (state.route.view === "positions") renderPositions();
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
  if (!header) return;
  const key = header.dataset.sort;
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort = { key, dir: key === "symbol" || key === "name" ? "asc" : "desc" };
  }
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-invest-webull-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
