import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-family-office-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-family-office.sidebarCollapsed";

const DONUT_COLORS = ["#334155", "#0d9488", "#2563eb", "#9333ea", "#d97706", "#dc2626", "#65a30d", "#0891b2"];

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
  aumCount: document.querySelector("#count-aum"),
  entityCount: document.querySelector("#count-entities"),
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

function enumLabel(value, group = "type") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function baseCurrency() {
  return state.snapshot?.base_currency || "USD";
}

function money(value, currency = baseCurrency()) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function moneyPrecise(value, currency = baseCurrency()) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function pct(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function quantity(value) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    maximumFractionDigits: 4,
  }).format(Number(value || 0));
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] || "" };
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
  const map = {
    entities: "#/entities",
    detail: "#/entities/family-trust",
    assets: "#/assets",
    institutions: "#/institutions",
    performance: "#/performance",
    overview: "#/overview",
  };
  const route = map[scenario] || "#/overview";
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

function entities() {
  return state.snapshot?.entities || [];
}

function accounts() {
  return state.snapshot?.accounts || [];
}

function holdings() {
  return state.snapshot?.holdings || [];
}

function totals() {
  return state.snapshot?.totals || {};
}

function hasData() {
  return holdings().length > 0;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const entityCount = entities().length;
  const accountCount = accounts().length;
  const aum = totals().aum_base || 0;
  els.syncStatus.textContent = hasData()
    ? `${holdings().length} ${t("holdingCount")}`
    : t("needsImport");
  if (els.aumCount) els.aumCount.textContent = money(aum);
  if (els.entityCount) els.entityCount.textContent = entityCount;
  if (els.accountCount) els.accountCount.textContent = accountCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = hasData()
      ? `${money(aum)} · ${entityCount} ${t("entityCount")}`
      : t("needsImport");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "entities") return t("entities");
  if (view === "assets") return t("assets");
  if (view === "institutions") return t("institutions");
  if (view === "performance") return t("performance");
  if (view === "settings") return t("settings");
  return t("overview");
}

function consolidatedSubtitle() {
  const snapshot = state.snapshot;
  if (!hasData()) return t("needsImport");
  const asOf = snapshot?.generated_at ? date(snapshot.generated_at) : "";
  return `${t("consolidatedAs")} ${asOf} · ${entities().length} ${t("entityCount")} · ${accounts().length} ${t("accountCount")}`;
}

function totalsCards() {
  const total = totals();
  const pnl = total.unrealized_pnl_base || 0;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("aum")}</span><strong>${money(total.aum_base)}</strong></div>
      <div class="metric"><span>${t("costBasis")}</span><strong>${money(total.cost_basis_base)}</strong></div>
      <div class="metric"><span>${t("unrealizedPnl")}</span><strong class="${pnl < 0 ? "negative" : "positive"}">${money(pnl)}</strong></div>
      <div class="metric"><span>${t("unrealizedPnlPct")}</span><strong class="${(total.unrealized_pnl_pct || 0) < 0 ? "negative" : "positive"}">${pct(total.unrealized_pnl_pct)}</strong></div>
    </div>
  `;
}

function allocBars(rows, labelFn) {
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  const max = Math.max(...rows.map((row) => row.weight_pct || 0), 1);
  return `
    <div class="alloc-list">
      ${rows
        .map(
          (row) => `
        <div class="alloc-row">
          <span class="alloc-label">${escapeHtml(labelFn(row))}</span>
          <span class="alloc-track"><span class="alloc-fill" style="width:${Math.max((row.weight_pct || 0) / max * 100, 2)}%"></span></span>
          <span class="alloc-value">${money(row.aum_base)} · ${pct(row.weight_pct)}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function donut(rows, labelFn) {
  const data = rows.filter((row) => (row.weight_pct || 0) > 0);
  if (!data.length) return `<div class="empty">${t("empty")}</div>`;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = data
    .map((row, index) => {
      const fraction = (row.weight_pct || 0) / 100;
      const dash = fraction * circumference;
      const seg = `<circle r="${radius}" cx="80" cy="80" fill="none" stroke="${DONUT_COLORS[index % DONUT_COLORS.length]}" stroke-width="28" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"></circle>`;
      offset += dash;
      return seg;
    })
    .join("");
  const legend = data
    .map(
      (row, index) => `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${DONUT_COLORS[index % DONUT_COLORS.length]}"></span>
        <span>${escapeHtml(labelFn(row))}</span>
        <span class="legend-value">${pct(row.weight_pct)}</span>
      </div>
    `,
    )
    .join("");
  return `
    <div class="alloc-panel">
      <svg class="donut" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Allocation">
        ${segments}
        <circle r="46" cx="80" cy="80" fill="var(--panel)"></circle>
      </svg>
      <div class="legend">${legend}</div>
    </div>
  `;
}

function insightText(insight) {
  const templates = messages[activeLang()]?.insightTemplates || messages.en.insightTemplates || {};
  const template = templates[insight.code] || messages.en.insightTemplates?.[insight.code] || insight.code;
  const params = insight.params || {};
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    let value = params[key];
    if (value === undefined || value === null) return "";
    if (key === "asset_class") value = enumLabel(value, "asset");
    else if (key === "delta") value = `${Number(value) > 0 ? "+" : ""}${value}`;
    return escapeHtml(String(value));
  });
}

function insightsPanel() {
  const items = state.snapshot?.insights || [];
  const body = items.length
    ? items
        .map(
          (insight) => `
      <div class="insight-row">
        <span class="badge sev-${escapeHtml(insight.severity || "info")}">${escapeHtml(severityLabel(insight.severity))}</span>
        <span class="insight-text">${insightText(insight)}</span>
      </div>
    `,
        )
        .join("")
    : `<div class="muted insight-empty">${t("noFlags")}</div>`;
  return `
    <div class="overview-panel wide">
      <h2>${t("insights")}</h2>
      <div class="muted insight-note">${t("insightsNote")}</div>
      <div class="insight-list">${body}</div>
    </div>
  `;
}

function severityLabel(severity) {
  if (severity === "high") return t("sevHigh");
  if (severity === "watch") return t("sevWatch");
  return t("sevInfo");
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = consolidatedSubtitle();
  const byEntity = state.snapshot?.by_entity || [];
  const byAsset = state.snapshot?.by_asset_class || [];
  els.content.innerHTML = `
    ${totalsCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("headlineAllocation")}</h2>
        ${donut(byAsset, (row) => enumLabel(row.asset_class, "asset"))}
      </div>
      <div class="overview-panel">
        <h2>${t("topEntities")}</h2>
        ${byEntity
          .map(
            (row) => `
          <a class="health-row" href="#/entities/${encodeURIComponent(row.entity_id)}">
            <span><strong>${escapeHtml(row.name)}</strong><small>${pct(row.weight_pct)}</small></span>
            <span class="num">${money(row.aum_base)}</span>
            <span class="num ${(row.unrealized_pnl_base || 0) < 0 ? "negative" : "positive"}">${money(row.unrealized_pnl_base)}</span>
          </a>
        `,
          )
          .join("")}
      </div>
      <div class="overview-panel wide">
        <h2>${t("byAssetClass")}</h2>
        ${allocBars(byAsset, (row) => enumLabel(row.asset_class, "asset"))}
      </div>
      ${insightsPanel()}
    </section>
  `;
}

function renderEntities() {
  els.title.textContent = t("entities");
  els.subtitle.textContent = `${entities().length} ${t("entityCount")} · ${money(totals().aum_base)}`;
  const byEntity = new Map((state.snapshot?.by_entity || []).map((row) => [row.entity_id, row]));
  const list = entities();
  els.content.innerHTML = list.length
    ? `
    <div class="account-grid">
      ${list
        .map((entity) => {
          const roll = byEntity.get(entity.entity_id) || {};
          return `
        <a class="account-card" href="#/entities/${encodeURIComponent(entity.entity_id)}">
          <div class="row between"><strong>${escapeHtml(entity.name)}</strong><span class="badge">${escapeHtml(enumLabel(entity.type, "type"))}</span></div>
          <div class="muted">${escapeHtml(entity.member || entity.entity_id)}</div>
          <div class="balance">${money(roll.aum_base)}</div>
          <div class="row stats">
            <span>${t("weight")} ${pct(roll.weight_pct)}</span>
            <span>${t("unrealizedPnl")} ${money(roll.unrealized_pnl_base)}</span>
          </div>
        </a>
      `;
        })
        .join("")}
    </div>
  `
    : `<div class="empty">${t("needsImport")}</div>`;
}

function holdingsTable(rows) {
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("symbol")}</th><th>${t("name")}</th><th>${t("assetClass")}</th><th>${t("account")}</th><th>${t("quantity")}</th><th>${t("marketValue")}</th><th>${t("marketValueBase")}</th><th>${t("unrealizedPnl")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (h) => `
            <tr>
              <td><div class="strong">${escapeHtml(h.symbol || "")}</div></td>
              <td><div class="strong">${escapeHtml(h.name || "")}</div><div class="muted">${escapeHtml(accountName(h.account_id))}</div></td>
              <td><span class="badge">${escapeHtml(enumLabel(h.asset_class, "asset"))}</span></td>
              <td>${escapeHtml(institutionFor(h.account_id))}</td>
              <td class="num">${quantity(h.quantity)}</td>
              <td class="num">${moneyPrecise(h.market_value, h.currency)}</td>
              <td class="num">${money(h.market_value_base)}</td>
              <td class="num ${Number(h.unrealized_pnl_base) < 0 ? "negative" : "positive"}">${money(h.unrealized_pnl_base)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function accountName(accountId) {
  const account = accounts().find((item) => item.account_id === accountId);
  return account?.display_name || account?.institution || accountId;
}

function institutionFor(accountId) {
  return accounts().find((item) => item.account_id === accountId)?.institution || "";
}

function filteredHoldings(entityId = "") {
  const query = state.query.trim().toLowerCase();
  return holdings().filter((h) => {
    if (entityId && h.entity_id !== entityId) return false;
    if (!query) return true;
    return [h.symbol, h.name, h.asset_class, h.currency, accountName(h.account_id), institutionFor(h.account_id)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderEntityDetail() {
  const entity = entities().find((item) => item.entity_id === state.route.id);
  if (!entity) {
    renderEntities();
    return;
  }
  const roll = (state.snapshot?.by_entity || []).find((row) => row.entity_id === entity.entity_id) || {};
  const entityAccounts = accounts().filter((account) => account.entity_id === entity.entity_id);
  const entityHoldings = filteredHoldings(entity.entity_id);
  els.title.textContent = entity.name;
  els.subtitle.textContent = `${enumLabel(entity.type, "type")} · ${entity.member || ""} · ${money(roll.aum_base)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        ${warnings(entity.entity_id)}
        <div class="metrics">
          <div class="metric"><span>${t("subtotal")}</span><strong>${money(roll.aum_base)}</strong></div>
          <div class="metric"><span>${t("weight")}</span><strong>${pct(roll.weight_pct)}</strong></div>
          <div class="metric"><span>${t("unrealizedPnl")}</span><strong class="${(roll.unrealized_pnl_base || 0) < 0 ? "negative" : "positive"}">${money(roll.unrealized_pnl_base)}</strong></div>
          <div class="metric"><span>${t("holdings")}</span><strong>${entityHoldings.length}</strong></div>
        </div>
        ${holdingsTable(entityHoldings)}
      </div>
      <aside class="detail-side">
        <h2>${t("entityDetail")}</h2>
        <dl>
          <dt>${t("type")}</dt><dd>${escapeHtml(enumLabel(entity.type, "type"))}</dd>
          <dt>${t("member")}</dt><dd>${escapeHtml(entity.member || "")}</dd>
          <dt>${t("entity")}</dt><dd>${escapeHtml(entity.entity_id)}</dd>
        </dl>
        <h2 style="margin-top:16px">${t("account")}</h2>
        <dl>
          ${entityAccounts
            .map(
              (account) => `<dt>${escapeHtml(account.institution)}</dt><dd>${escapeHtml(account.account_type || "")} · ${escapeHtml(account.currency)}</dd>`,
            )
            .join("")}
        </dl>
      </aside>
    </section>
  `;
}

function renderAssets() {
  els.title.textContent = t("byAssetClass");
  els.subtitle.textContent = consolidatedSubtitle();
  const rows = state.snapshot?.by_asset_class || [];
  els.content.innerHTML = `
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("allocation")}</h2>
        ${donut(rows, (row) => enumLabel(row.asset_class, "asset"))}
      </div>
      <div class="overview-panel">
        <h2>${t("byAssetClass")}</h2>
        ${allocBars(rows, (row) => enumLabel(row.asset_class, "asset"))}
      </div>
    </section>
    <div class="table-wrap" style="margin-top:14px">
      <table>
        <thead><tr><th>${t("assetClass")}</th><th>${t("marketValueBase")}</th><th>${t("weight")}</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row) => `<tr><td class="strong">${escapeHtml(enumLabel(row.asset_class, "asset"))}</td><td class="num">${money(row.aum_base)}</td><td class="num">${pct(row.weight_pct)}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInstitutions() {
  els.title.textContent = t("byInstitution");
  els.subtitle.textContent = consolidatedSubtitle();
  const rows = state.snapshot?.by_institution || [];
  els.content.innerHTML = `
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("allocation")}</h2>
        ${donut(rows, (row) => row.institution)}
      </div>
      <div class="overview-panel">
        <h2>${t("byInstitution")}</h2>
        ${allocBars(rows, (row) => row.institution)}
      </div>
    </section>
    <div class="table-wrap" style="margin-top:14px">
      <table>
        <thead><tr><th>${t("institution")}</th><th>${t("marketValueBase")}</th><th>${t("weight")}</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row) => `<tr><td class="strong">${escapeHtml(row.institution)}</td><td class="num">${money(row.aum_base)}</td><td class="num">${pct(row.weight_pct)}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPerformance() {
  els.title.textContent = t("performance");
  els.subtitle.textContent = consolidatedSubtitle();
  const byEntity = state.snapshot?.by_entity || [];
  const total = totals();
  const rows = byEntity.map((row) => {
    const entityHoldings = holdings().filter((h) => h.entity_id === row.entity_id);
    const cost = entityHoldings.reduce((sum, h) => sum + (h.cost_basis_base || 0), 0);
    const market = row.aum_base || 0;
    const pnl = row.unrealized_pnl_base || 0;
    const pnlPct = cost ? (pnl / cost) * 100 : 0;
    return { ...row, cost, market, pnl, pnlPct };
  });
  els.content.innerHTML = `
    ${totalsCards()}
    ${warnings()}
    <div class="table-wrap" style="margin-top:4px">
      <table>
        <thead>
          <tr><th>${t("entity")}</th><th>${t("costBasis")}</th><th>${t("marketValue")}</th><th>${t("unrealizedPnl")}</th><th>${t("unrealizedPnlPct")}</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <td><a href="#/entities/${encodeURIComponent(row.entity_id)}"><strong>${escapeHtml(row.name)}</strong></a></td>
              <td class="num">${money(row.cost)}</td>
              <td class="num">${money(row.market)}</td>
              <td class="num ${row.pnl < 0 ? "negative" : "positive"}">${money(row.pnl)}</td>
              <td class="num ${row.pnlPct < 0 ? "negative" : "positive"}">${pct(row.pnlPct)}</td>
            </tr>
          `,
            )
            .join("")}
          <tr>
            <td class="strong">${escapeHtml(t("aum"))}</td>
            <td class="num strong">${money(total.cost_basis_base)}</td>
            <td class="num strong">${money(total.aum_base)}</td>
            <td class="num strong ${(total.unrealized_pnl_base || 0) < 0 ? "negative" : "positive"}">${money(total.unrealized_pnl_base)}</td>
            <td class="num strong ${(total.unrealized_pnl_pct || 0) < 0 ? "negative" : "positive"}">${pct(total.unrealized_pnl_pct)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const fx = summary.fx_rates || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("fxRates")}</dt><dd>${escapeHtml(Object.entries(fx).map(([k, v]) => `${k}=${v}`).join(", "))}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("entities")}</h2>
        ${
          (summary.entities || [])
            .map(
              (entity) => `
          <div class="settings-account">
            <strong>${escapeHtml(entity.name)}</strong>
            <span>${escapeHtml(enumLabel(entity.type, "type"))}</span>
            <span>${escapeHtml(entity.member || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("institutions")}</h2>
        <div class="muted">${escapeHtml((summary.institutions || []).join(" · ") || t("setupNeeded"))}</div>
      </section>
    </div>
  `;
}

function warnings(entityId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !entityId || !item.entity_id || item.entity_id === entityId,
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
  if (state.route.view === "entities" && state.route.id) renderEntityDetail();
  else if (state.route.view === "entities") renderEntities();
  else if (state.route.view === "assets") renderAssets();
  else if (state.route.view === "institutions") renderInstitutions();
  else if (state.route.view === "performance") renderPerformance();
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
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-family-office-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
