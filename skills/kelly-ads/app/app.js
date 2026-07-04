import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-ads-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-ads.sidebarCollapsed";

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
  reviewCount: document.querySelector("#count-review"),
  alertCount: document.querySelector("#count-alerts"),
  budgetCount: document.querySelector("#count-budget"),
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

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function money(value, currency = state.snapshot?.currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

function dateTime(value) {
  if (!value) return t("notAvailable");
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function pct(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function ageOf(startIso) {
  const reference = Date.parse(state.snapshot?.generated_at || "") || Date.now();
  const start = Date.parse(startIso || "");
  if (!Number.isFinite(start)) return t("notAvailable");
  const hours = Math.max(0, Math.round((reference - start) / 3600000));
  if (hours < 48) return `${hours}${t("hoursShort")}`;
  return `${Math.round(hours / 24)}${t("daysShort")}`;
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.notice = "";
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
    scenario === "campaigns"
      ? "#/campaigns"
      : scenario === "alerts"
        ? "#/alerts"
        : scenario === "adjustments"
          ? "#/adjustments"
          : scenario === "detail"
            ? "#/campaigns/amz-sp-manual-lunchbox"
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

function campaigns() {
  return state.snapshot?.campaigns || [];
}

function platforms() {
  return state.snapshot?.platforms || [];
}

function anomalies() {
  return state.snapshot?.anomalies || [];
}

function adjustments() {
  return state.snapshot?.adjustments || [];
}

function syncLog() {
  return state.snapshot?.sync_log || [];
}

function metrics() {
  return state.snapshot?.metrics || {};
}

function campaignById(campaignId) {
  return campaigns().find((item) => item.campaign_id === campaignId);
}

function adjustmentById(adjustmentId) {
  return adjustments().find((item) => item.adjustment_id === adjustmentId);
}

function anomalyById(anomalyId) {
  return anomalies().find((item) => item.anomaly_id === anomalyId);
}

function renderShell() {
  applyI18n();
  const m = metrics();
  const reviewCount = adjustments().filter((item) => item.status === "needs_review").length;
  const openAlerts = anomalies().filter((item) => item.state === "open").length;
  const budgetRisk = Number(m.budget_at_risk_today || 0);
  els.syncStatus.textContent =
    state.snapshot?.generated_at && Date.parse(state.snapshot.generated_at) > 0
      ? `${campaigns().length} ${t("campaigns").toLowerCase()}`
      : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.alertCount) els.alertCount.textContent = openAlerts;
  if (els.budgetCount) els.budgetCount.textContent = budgetRisk;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needReview")}`
      : openAlerts
        ? `${openAlerts} ${t("openAlerts")}`
        : `${campaigns().length} ${t("campaigns").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "campaigns") return t("campaigns");
  if (view === "alerts") return t("alerts");
  if (view === "adjustments") return t("adjustments");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusDot(status) {
  return `<span class="dot ${escapeHtml(status || "unknown")}" aria-hidden="true"></span>`;
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status || "unknown")}">${statusDot(status)}${escapeHtml(enumLabel(status))}</span>`;
}

function platformBadge(platformId) {
  return `<span class="badge platform-${escapeHtml(platformId)}">${escapeHtml(enumLabel(platformId, "platform"))}</span>`;
}

function typeBadge(type) {
  return `<span class="badge">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

function adjTypeBadge(type) {
  return `<span class="badge">${escapeHtml(enumLabel(type, "adjtype"))}</span>`;
}

function acosBadge(acos, target) {
  const value = Number(acos || 0);
  const goal = Number(target || 0);
  const cls = !goal || value <= goal ? "" : value <= goal * 1.2 ? "warn" : "crit";
  const label = goal ? `${value.toFixed(1)}% / ${goal.toFixed(0)}%` : `${value.toFixed(1)}%`;
  return `<span class="acos-badge ${cls}" title="${t("acos")} ${t("vs")} ${t("acosTarget")}">${escapeHtml(label)}</span>`;
}

function trendArrow(trend) {
  const glyph = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
  return `<span class="trend ${escapeHtml(trend || "flat")}" title="${t("trend")}">${glyph}</span>`;
}

function budgetBar(pctSpent) {
  const value = Math.max(0, Math.min(100, Number(pctSpent || 0)));
  const cls = value >= 100 ? "crit" : value >= 85 ? "warn" : "";
  return `<div class="budget-bar ${cls}"><i style="width:${value}%"></i></div>`;
}

function notice() {
  if (!state.notice) return "";
  return `<div class="notice">${escapeHtml(state.notice)}</div>`;
}

function lockBanner() {
  const lock = state.settings?.lock;
  if (!lock) return "";
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")}: ${escapeHtml(lock.message || "")}</span></div></div>`;
}

function warnings(campaignId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !campaignId || !item.campaign_id || item.campaign_id === campaignId,
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

function dailyTotals() {
  const byDate = new Map();
  for (const campaign of campaigns()) {
    for (const day of campaign.daily || []) {
      const entry = byDate.get(day.date) || { date: day.date, spend: 0, revenue: 0 };
      entry.spend += Number(day.spend || 0);
      entry.revenue += Number(day.revenue || 0);
      byDate.set(day.date, entry);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
}

function spendRevenueChart() {
  const days = dailyTotals();
  if (!days.length) return `<div class="empty">${t("empty")}</div>`;
  const width = 720;
  const height = 190;
  const padX = 8;
  const padTop = 10;
  const padBottom = 22;
  const max = Math.max(...days.map((day) => Math.max(day.spend, day.revenue)), 1);
  const slot = (width - padX * 2) / days.length;
  const barW = Math.max(4, Math.min(14, slot * 0.32));
  const yFor = (value) => padTop + (1 - value / max) * (height - padTop - padBottom);
  const bars = days
    .map((day, index) => {
      const x = padX + index * slot + slot / 2;
      const spendY = yFor(day.spend);
      const revenueY = yFor(day.revenue);
      const label =
        index % 2 === 0
          ? `<text class="axis-label" x="${x}" y="${height - 6}" text-anchor="middle">${escapeHtml(date(day.date))}</text>`
          : "";
      return `
      <rect class="bar-spend" x="${(x - barW - 1).toFixed(1)}" y="${spendY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(height - padBottom - spendY).toFixed(1)}" rx="1.5"><title>${escapeHtml(day.date)} · ${t("spend")} ${escapeHtml(money(day.spend))}</title></rect>
      <rect class="bar-revenue" x="${(x + 1).toFixed(1)}" y="${revenueY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(height - padBottom - revenueY).toFixed(1)}" rx="1.5"><title>${escapeHtml(day.date)} · ${t("revenue")} ${escapeHtml(money(day.revenue))}</title></rect>
      ${label}
    `;
    })
    .join("");
  return `
    <svg class="barchart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("spendVsRevenue")}" preserveAspectRatio="none">${bars}</svg>
    <div class="chart-legend">
      <span><i class="swatch-spend"></i>${t("spend")}</span>
      <span><i class="swatch-revenue"></i>${t("revenue")}</span>
    </div>
  `;
}

function campaignChart(campaign) {
  const days = [...(campaign.daily || [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  if (!days.length) return `<div class="empty">${t("empty")}</div>`;
  const width = 720;
  const height = 190;
  const padX = 8;
  const padTop = 10;
  const padBottom = 22;
  const maxSpend = Math.max(...days.map((day) => Number(day.spend || 0)), 1);
  const roasValues = days.map((day) => (Number(day.spend) > 0 ? Number(day.revenue || 0) / Number(day.spend) : 0));
  const maxRoas = Math.max(...roasValues, 1);
  const slot = (width - padX * 2) / days.length;
  const barW = Math.max(6, Math.min(22, slot * 0.5));
  const ySpend = (value) => padTop + (1 - value / maxSpend) * (height - padTop - padBottom);
  const yRoas = (value) => padTop + (1 - value / maxRoas) * (height - padTop - padBottom);
  const bars = days
    .map((day, index) => {
      const x = padX + index * slot + (slot - barW) / 2;
      const y = ySpend(Number(day.spend || 0));
      const label =
        index % 2 === 0
          ? `<text class="axis-label" x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${escapeHtml(date(day.date))}</text>`
          : "";
      return `<rect class="bar-spend" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${(height - padBottom - y).toFixed(1)}" rx="2"><title>${escapeHtml(day.date)} · ${t("spend")} ${escapeHtml(money(day.spend))} · ROAS ${roasValues[index].toFixed(2)}</title></rect>${label}`;
    })
    .join("");
  const line = roasValues
    .map((value, index) => {
      const x = padX + index * slot + slot / 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${yRoas(value).toFixed(1)}`;
    })
    .join(" ");
  return `
    <svg class="linechart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("dailySeries")}" preserveAspectRatio="none">
      ${bars}
      <path class="roas-line" d="${line}"></path>
    </svg>
    <div class="chart-legend">
      <span><i class="swatch-spend"></i>${t("spend")}</span>
      <span><i class="swatch-roas"></i>${t("roas")}</span>
    </div>
  `;
}

function kpiCards() {
  const m = metrics();
  const lastMonth = Number(m.spend_last_month || 0);
  const acos = Number(m.blended_acos_pct || 0);
  const target = Number(m.acos_target_pct || 0);
  const acosClass = target && acos > target ? "over-target" : "on-target";
  return `
    <div class="metrics">
      <div class="metric"><span>${t("spendMtd")}</span><strong>${money(m.spend_mtd)}</strong><small>${t("lastMonth")} ${money(lastMonth)}</small></div>
      <div class="metric"><span>${t("blendedRoas")}</span><strong>${Number(m.blended_roas || 0).toFixed(2)}</strong><small>${t("spend")} ${money(m.spend_14d)} · ${t("revenue")} ${money(m.revenue_14d)}</small></div>
      <div class="metric"><span>${t("blendedAcos")}</span><strong class="${acosClass}">${acos.toFixed(1)}%</strong><small>${t("acosTarget")} ${target.toFixed(0)}%</small></div>
      <div class="metric"><span>${t("conversions14d")}</span><strong>${Number(m.conversions_14d || 0)}</strong><small>${m.campaigns_active || 0} / ${m.campaigns_total || 0} ${enumLabel("active")}</small></div>
    </div>
  `;
}

function platformCards() {
  return `
    <div class="platform-grid">
      ${platforms()
        .map(
          (platform) => `
        <div class="platform-card">
          <div class="row between">
            <strong>${statusDot(platform.status)}${escapeHtml(platform.name)}</strong>
            ${platformBadge(platform.platform_id)}
          </div>
          <div class="platform-nums">
            <span>${t("spend")} <b>${money(platform.spend_14d, platform.currency)}</b></span>
            <span>ROAS <b>${Number(platform.roas || 0).toFixed(2)}</b></span>
            <span>ACOS <b>${Number(platform.acos_pct || 0).toFixed(1)}%</b></span>
          </div>
          <div class="muted">${platform.campaign_count || 0} ${t("campaigns").toLowerCase()} · ${t("lastSync")} ${dateTime(platform.last_sync_at)}</div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function worstOffenders() {
  const rows = [];
  for (const campaign of campaigns()) {
    for (const target of campaign.targets || []) {
      if (Number(target.conversions || 0) === 0 && Number(target.spend_14d || 0) >= 25) {
        rows.push({ campaign, target });
      }
    }
  }
  rows.sort((a, b) => Number(b.target.spend_14d) - Number(a.target.spend_14d));
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  return rows
    .slice(0, 6)
    .map(
      ({ campaign, target }) => `
    <a class="attention-row" href="#/campaigns/${encodeURIComponent(campaign.campaign_id)}">
      <span><strong>${escapeHtml(target.text)}</strong><small>${escapeHtml(campaign.name)} · ${escapeHtml(String(target.clicks || 0))} ${t("clicks").toLowerCase()}</small></span>
      <span class="badges">${platformBadge(campaign.platform)}<span class="acos-badge crit">${escapeHtml(money(target.spend_14d))} · ${t("zeroOrders")}</span></span>
    </a>
  `,
    )
    .join("");
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent =
    state.snapshot?.generated_at && Date.parse(state.snapshot.generated_at) > 0
      ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
      : t("empty");
  const needsDecision = adjustments().filter((item) => item.status === "needs_review");
  const critical = anomalies().filter((item) => item.state === "open" && item.severity === "critical");
  const budgetRisk = campaigns().filter(
    (item) => item.status === "active" && Number(item.budget_spent_today_pct || 0) >= 85,
  );
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    ${kpiCards()}
    ${platformCards()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("humanWorkTitle")}</h2>
        ${needsDecision
          .map(
            (item) => `
          <a class="attention-row" href="#/adjustments/${encodeURIComponent(item.adjustment_id)}">
            <span><strong>${t("adjustmentRef")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.reason)}</small></span>
            <span class="badges">${adjTypeBadge(item.type)}</span>
          </a>
        `,
          )
          .join("")}
        ${critical
          .map(
            (item) => `
          <a class="attention-row" href="#/alerts">
            <span><strong>${escapeHtml(campaignById(item.campaign_id)?.name || item.campaign_id)}</strong><small>${escapeHtml(item.evidence)}</small></span>
            <span class="badges">${typeBadge(item.type)}${statusBadge(item.severity)}</span>
          </a>
        `,
          )
          .join("")}
        ${budgetRisk
          .map(
            (item) => `
          <a class="attention-row" href="#/campaigns/${encodeURIComponent(item.campaign_id)}">
            <span><strong>${escapeHtml(item.name)}</strong><small>${t("dailyBudget")} ${money(item.daily_budget, item.currency)} · ${Number(item.budget_spent_today_pct || 0)}% ${t("spentToday")}</small></span>
            <span class="badges">${platformBadge(item.platform)}</span>
          </a>
        `,
          )
          .join("")}
        ${!needsDecision.length && !critical.length && !budgetRisk.length ? `<div class="empty">${t("empty")}</div>` : ""}
      </div>
      <div class="overview-panel">
        <h2>${t("worstOffenders")}</h2>
        ${worstOffenders()}
      </div>
      <div class="overview-panel wide">
        <h2>${t("spendVsRevenue")}</h2>
        ${spendRevenueChart()}
      </div>
      <div class="overview-panel">
        <h2>${t("dataFreshness")}</h2>
        <div class="freshness">
          ${
            platforms()
              .map(
                (platform) => `
            <div class="freshness-item"><span>${statusDot(platform.status)}${escapeHtml(platform.name)}</span><strong>${dateTime(platform.last_sync_at)}</strong></div>
          `,
              )
              .join("") || `<div class="empty">${t("empty")}</div>`
          }
        </div>
      </div>
      <div class="overview-panel">
        <h2>${t("syncActivity")}</h2>
        ${
          syncLog()
            .slice(0, 6)
            .map(
              (entry) => `
          <div class="sync-row">
            <span class="sync-meta"><small>${dateTime(entry.at)}</small><span class="badge">${escapeHtml(enumLabel(entry.kind, "kind"))}</span>${entry.platform ? platformBadge(entry.platform) : ""}</span>
            <span class="sync-message">${escapeHtml(entry.message)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

function filteredCampaigns() {
  const query = state.query.trim().toLowerCase();
  if (!query) return campaigns();
  return campaigns().filter((campaign) =>
    [campaign.name, campaign.product, campaign.sku, campaign.platform, campaign.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderCampaigns() {
  els.title.textContent = t("campaigns");
  const rows = filteredCampaigns();
  els.subtitle.textContent = `${rows.length} ${t("configured")}`;
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("campaign")}</th><th>${t("platform")}</th><th>${t("status")}</th><th class="budget-cell">${t("dailyBudget")}</th><th class="num">${t("spend7d")}</th><th class="num">${t("roas7d")}</th><th>${t("acos7d")}</th><th>${t("trend")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (campaign) => `
            <tr>
              <td><a href="#/campaigns/${encodeURIComponent(campaign.campaign_id)}"><strong>${escapeHtml(campaign.name)}</strong></a><div class="muted">${escapeHtml(campaign.product || "")}${campaign.sku ? ` · ${escapeHtml(campaign.sku)}` : ""}</div></td>
              <td>${platformBadge(campaign.platform)}</td>
              <td>${statusBadge(campaign.status)}</td>
              <td class="budget-cell">${money(campaign.daily_budget, campaign.currency)} <span class="muted">· ${Number(campaign.budget_spent_today_pct || 0)}% ${t("spentToday")}</span>${budgetBar(campaign.budget_spent_today_pct)}</td>
              <td class="num">${money(campaign.totals_7d?.spend, campaign.currency)}</td>
              <td class="num">${Number(campaign.totals_7d?.roas || 0).toFixed(2)}</td>
              <td>${acosBadge(campaign.totals_7d?.acos_pct, campaign.acos_target_pct)}</td>
              <td>${trendArrow(campaign.trend)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function targetsTable(campaign) {
  const rows = campaign.targets || [];
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap inset">
      <table class="compact">
        <thead>
          <tr>
            <th>${t("term")}</th><th>${t("type")}</th><th>${t("state")}</th><th class="num">${t("spend")} 14d</th><th class="num">${t("clicks")}</th><th class="num">${t("conversions")}</th><th class="num">${t("revenue")}</th><th class="num">${t("cpc")}</th><th class="num">${t("acos")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (target) => `
            <tr>
              <td><strong>${escapeHtml(target.text)}</strong>${target.match_type ? `<div class="muted">${escapeHtml(target.match_type)}</div>` : ""}</td>
              <td><span class="badge">${escapeHtml(enumLabel(target.type, "targettype"))}</span></td>
              <td>${statusBadge(target.state)}</td>
              <td class="num">${money(target.spend_14d, campaign.currency)}</td>
              <td class="num">${Number(target.clicks || 0)}</td>
              <td class="num ${Number(target.conversions || 0) === 0 ? "negative" : ""}">${Number(target.conversions || 0)}</td>
              <td class="num">${money(target.revenue, campaign.currency)}</td>
              <td class="num">${money(target.cpc, campaign.currency)}</td>
              <td class="num">${Number(target.revenue) > 0 ? `${Number(target.acos_pct || 0).toFixed(1)}%` : t("notAvailable")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function adjustmentCard(item) {
  return `
    <a class="action-card" href="#/adjustments/${encodeURIComponent(item.adjustment_id)}">
      <div class="action-card-head">
        <span class="action-ref">${t("adjustmentRef")} #${item.ref}</span>
        ${adjTypeBadge(item.type)}
        ${platformBadge(item.platform)}
        ${statusBadge(item.status)}
      </div>
      <strong>${escapeHtml(item.title)}</strong>
      <span class="value-line"><b>${escapeHtml(item.current_value)}</b> → <b>${escapeHtml(item.proposed_value)}</b></span>
      <span class="muted">${escapeHtml(item.reason)}</span>
      ${item.decision?.note ? `<span class="action-note">“${escapeHtml(item.decision.note)}”</span>` : ""}
    </a>
  `;
}

function renderCampaignDetail() {
  const campaign = campaignById(state.route.id);
  if (!campaign) {
    renderCampaigns();
    return;
  }
  els.title.textContent = campaign.name;
  els.subtitle.textContent = `${enumLabel(campaign.platform, "platform")} · ${campaign.product || ""} · ${enumLabel(campaign.status)}`;
  const linkedAnomalies = anomalies().filter((item) => item.campaign_id === campaign.campaign_id);
  const linkedAdjustments = adjustments().filter(
    (item) => item.campaign_id === campaign.campaign_id || item.target?.id === campaign.campaign_id,
  );
  const totals = campaign.totals_7d || {};
  els.content.innerHTML = `
    ${notice()}
    ${warnings(campaign.campaign_id)}
    <div class="metrics">
      <div class="metric"><span>${t("spend7d")}</span><strong>${money(totals.spend, campaign.currency)}</strong><small>${t("cpc")} ${money(totals.cpc, campaign.currency)}</small></div>
      <div class="metric"><span>${t("roas7d")}</span><strong>${Number(totals.roas || 0).toFixed(2)}</strong><small>${t("revenue")} ${money(totals.revenue, campaign.currency)}</small></div>
      <div class="metric"><span>${t("acos7d")}</span><strong>${acosBadge(totals.acos_pct, campaign.acos_target_pct)}</strong><small>${t("acosTarget")} ${Number(campaign.acos_target_pct || 0).toFixed(0)}%</small></div>
      <div class="metric"><span>${t("conversions")}</span><strong>${Number(totals.conversions || 0)}</strong><small>${Number(totals.clicks || 0)} ${t("clicks").toLowerCase()} · ${Number(totals.impressions || 0).toLocaleString()} ${t("impressions").toLowerCase()}</small></div>
    </div>
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("dailySeries")}</h2>
          ${campaignChart(campaign)}
        </div>
        <div class="panel">
          <h2>${t("topTargets")}</h2>
          ${targetsTable(campaign)}
        </div>
        ${
          linkedAnomalies.length
            ? `
          <div class="panel">
            <h2>${t("linkedAnomalies")}</h2>
            ${linkedAnomalies
              .map(
                (item) => `
              <a class="attention-row" href="#/alerts">
                <span><strong>${escapeHtml(enumLabel(item.type, "type"))}</strong><small>${escapeHtml(item.evidence)}</small></span>
                <span class="badges">${statusBadge(item.severity)}${statusBadge(item.state)}</span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        ${
          linkedAdjustments.length
            ? `
          <div class="panel">
            <h2>${t("adjustmentHistory")}</h2>
            <div class="action-list">
              ${linkedAdjustments.map((item) => adjustmentCard(item)).join("")}
            </div>
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("campaign")}</h2>
        <dl>
          <dt>${t("platform")}</dt><dd>${platformBadge(campaign.platform)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(campaign.status)}</dd>
          <dt>${t("product")}</dt><dd>${escapeHtml(campaign.product || t("notAvailable"))}</dd>
          ${campaign.sku ? `<dt>${t("sku")}</dt><dd class="mono">${escapeHtml(campaign.sku)}</dd>` : ""}
          <dt>${t("dailyBudget")}</dt><dd>${money(campaign.daily_budget, campaign.currency)}</dd>
          <dt>${t("spentToday")}</dt><dd>${Number(campaign.budget_spent_today_pct || 0)}%${budgetBar(campaign.budget_spent_today_pct)}</dd>
          <dt>${t("acosTarget")}</dt><dd>${Number(campaign.acos_target_pct || 0).toFixed(0)}%</dd>
          <dt>${t("currency")}</dt><dd>${escapeHtml(campaign.currency || "USD")}</dd>
          <dt>${t("lastSync")}</dt><dd>${dateTime(campaign.last_sync_at)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function filteredAnomalies() {
  const query = state.query.trim().toLowerCase();
  const order = { critical: 0, warning: 1, info: 2 };
  const stateOrder = { open: 0, actioned: 1, dismissed: 2, resolved: 3 };
  const rows = [...anomalies()].sort(
    (a, b) =>
      (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9) || (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
  );
  if (!query) return rows;
  return rows.filter((item) =>
    [item.type, item.severity, item.state, item.evidence, item.platform, campaignById(item.campaign_id)?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function adjustmentLink(adjustmentId) {
  const adjustment = adjustmentById(adjustmentId);
  if (!adjustment) return `<span class="muted">${t("notAvailable")}</span>`;
  return `<a class="badge action-link" href="#/adjustments/${encodeURIComponent(adjustmentId)}">${t("adjustmentRef")} #${adjustment.ref} · ${escapeHtml(enumLabel(adjustment.status))}</a>`;
}

function renderAlerts() {
  els.title.textContent = t("alertsFeed");
  const rows = filteredAnomalies();
  const open = rows.filter((item) => item.state === "open").length;
  els.subtitle.textContent = `${rows.length} ${t("alerts").toLowerCase()} · ${open} ${t("openAlerts")}`;
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("severity")}</th><th>${t("type")}</th><th>${t("campaign")}</th><th>${t("platform")}</th><th>${t("evidence")}</th><th>${t("age")}</th><th>${t("state")}</th><th>${t("adjustment")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((item) => {
              const campaign = campaignById(item.campaign_id);
              return `
              <tr>
                <td>${statusBadge(item.severity)}</td>
                <td>${typeBadge(item.type)}</td>
                <td><a href="#/campaigns/${encodeURIComponent(item.campaign_id)}"><strong>${escapeHtml(campaign?.name || item.campaign_id)}</strong></a></td>
                <td>${platformBadge(item.platform)}</td>
                <td>${escapeHtml(item.evidence)}</td>
                <td class="num">${ageOf(item.first_seen_at || item.detected_at)}</td>
                <td>${statusBadge(item.state)}</td>
                <td>${item.adjustment_id ? adjustmentLink(item.adjustment_id) : `<span class="muted">${t("notAvailable")}</span>`}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function filteredAdjustments() {
  const query = state.query.trim().toLowerCase();
  const order = { needs_review: 0, changes_requested: 1, approved: 2, blocked: 3, done: 4 };
  const rows = [...adjustments()].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.ref - b.ref);
  if (!query) return rows;
  return rows.filter((item) =>
    [item.title, item.reason, item.type, item.status, item.note, item.platform]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderAdjustments() {
  els.title.textContent = t("adjustmentsQueue");
  const rows = filteredAdjustments();
  const review = rows.filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${rows.length} ${t("adjustments").toLowerCase()} · ${review} ${t("needReview")}`;
  els.content.innerHTML = `
    ${notice()}
    ${lockBanner()}
    <div class="action-list">
      ${rows.map((item) => adjustmentCard(item)).join("")}
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function renderAdjustmentDetail() {
  const adjustment = adjustmentById(state.route.id);
  if (!adjustment) {
    renderAdjustments();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  const campaign = campaignById(adjustment.campaign_id);
  const anomaly = adjustment.anomaly_id ? anomalyById(adjustment.anomaly_id) : null;
  els.title.textContent = `${t("adjustmentRef")} #${adjustment.ref} · ${adjustment.title}`;
  els.subtitle.textContent = `${enumLabel(adjustment.type, "adjtype")} · ${enumLabel(adjustment.status)}`;
  els.content.innerHTML = `
    ${notice()}
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("reason")}</h2>
          <p class="guidance">${escapeHtml(adjustment.reason)}</p>
          <div class="value-shift">
            <span><span>${t("current")}</span><strong>${escapeHtml(adjustment.current_value)}</strong></span>
            <span class="arrow" aria-hidden="true">→</span>
            <span><span>${t("proposed")}</span><strong>${escapeHtml(adjustment.proposed_value)}</strong></span>
          </div>
          ${adjustment.expected_impact ? `<div class="impact"><strong>${t("expectedImpact")}</strong> · ${escapeHtml(adjustment.expected_impact)}</div>` : ""}
        </div>
        <div class="panel">
          <h2>${t("evidence")}</h2>
          <ul class="evidence-list">
            ${(adjustment.evidence || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ul>
        </div>
        <div class="panel">
          <h2>${t("note")}</h2>
          <textarea id="adjustment-note" rows="3" placeholder="${t("notePlaceholder")}" ${locked ? "disabled" : ""}>${escapeHtml(adjustment.note || "")}</textarea>
          <div class="decision-actions">
            <button type="button" class="primary" data-verdict="approve" ${locked ? "disabled" : ""} title="${t("approve")}">${t("approve")}</button>
            <button type="button" data-verdict="request_changes" ${locked ? "disabled" : ""} title="${t("requestChanges")}">${t("requestChanges")}</button>
            <button type="button" class="danger" data-verdict="block" ${locked ? "disabled" : ""} title="${t("block")}">${t("block")}</button>
            <button type="button" data-verdict="note" ${locked ? "disabled" : ""} title="${t("saveNote")}">${t("saveNote")}</button>
          </div>
        </div>
        ${
          adjustment.execution
            ? `
          <div class="panel">
            <h2>${t("execution")}</h2>
            <dl>
              <dt>${t("status")}</dt><dd>${statusBadge(adjustment.execution.status)}</dd>
              <dt>${t("operation")}</dt><dd class="mono">${escapeHtml(adjustment.execution.operation || "")}</dd>
              <dt>${t("target")}</dt><dd class="mono">${escapeHtml(JSON.stringify(adjustment.execution.target || {}))}</dd>
              <dt>${t("executedAt")}</dt><dd>${dateTime(adjustment.execution.executed_at)}</dd>
            </dl>
            ${adjustment.execution.detail ? `<p class="guidance muted">${escapeHtml(adjustment.execution.detail)}</p>` : ""}
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("decision")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${statusBadge(adjustment.status)}</dd>
          ${
            adjustment.decision
              ? `
            <dt>${t("decision")}</dt><dd>${escapeHtml(enumLabel(adjustment.decision.verdict === "approve" ? "approved" : adjustment.decision.verdict === "block" ? "blocked" : "changes_requested"))}</dd>
            <dt>${t("generated")}</dt><dd>${dateTime(adjustment.decision.decided_at)}</dd>
          `
              : ""
          }
        </dl>
        <h2>${t("target")}</h2>
        <dl>
          <dt>${t("campaign")}</dt><dd>${campaign ? `<a href="#/campaigns/${encodeURIComponent(campaign.campaign_id)}">${escapeHtml(campaign.name)}</a>` : escapeHtml(adjustment.campaign_id)}</dd>
          <dt>${t("platform")}</dt><dd>${platformBadge(adjustment.platform)}</dd>
          ${Object.entries(adjustment.target || {})
            .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd class="mono">${escapeHtml(String(value))}</dd>`)
            .join("")}
        </dl>
        ${
          anomaly
            ? `
          <h2>${t("linkedAnomalies")}</h2>
          <dl>
            <dt>${t("type")}</dt><dd>${typeBadge(anomaly.type)}</dd>
            <dt>${t("evidence")}</dt><dd>${escapeHtml(anomaly.evidence)}</dd>
          </dl>
        `
            : ""
        }
      </aside>
    </section>
  `;
  els.content.querySelectorAll("[data-verdict]").forEach((button) => {
    button.addEventListener("click", () => submitDecision(adjustment.adjustment_id, button.dataset.verdict));
  });
}

async function submitDecision(adjustmentId, verdict) {
  const note = els.content.querySelector("#adjustment-note")?.value || "";
  if (state.settings?.demo) {
    const adjustment = adjustmentById(adjustmentId);
    if (adjustment) {
      if (verdict !== "note") {
        adjustment.status = verdict === "approve" ? "approved" : verdict === "block" ? "blocked" : "changes_requested";
      }
      adjustment.note = note;
      adjustment.decision = { verdict, note, decided_at: new Date().toISOString() };
    }
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  try {
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adjustment_id: adjustmentId, verdict, note }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Decision failed: ${res.status}`);
    state.notice = t("decisionSaved");
    await loadState();
  } catch (error) {
    state.notice = error.message;
    render();
  }
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const targets = summary.targets || {};
  const thresholds = summary.thresholds || {};
  els.content.innerHTML = `
    ${notice()}
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd class="mono">${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("currency")}</dt><dd>${escapeHtml(summary.currency || "USD")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("platforms")}</h2>
        ${
          (summary.platforms || [])
            .map(
              (platform) => `
          <div class="settings-row">
            <strong>${escapeHtml(platform.name)}</strong>
            <span class="mono muted">${escapeHtml(platform.account_id || "")} · ${escapeHtml((platform.secret_envs || []).join(", "))}</span>
            <span>${platform.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("targets")}</h2>
        <dl>
          ${
            Object.entries(targets)
              .filter(([, value]) => typeof value !== "object")
              .map(([key, value]) => `<dt class="mono">${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`)
              .join("") || `<dd>${t("setupNeeded")}</dd>`
          }
        </dl>
      </section>
      <section>
        <h2>${t("thresholds")}</h2>
        <dl>
          ${
            Object.entries(thresholds)
              .map(([key, value]) => `<dt class="mono">${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`)
              .join("") || `<dd>${t("setupNeeded")}</dd>`
          }
        </dl>
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "campaigns" && state.route.id) renderCampaignDetail();
  else if (state.route.view === "campaigns") renderCampaigns();
  else if (state.route.view === "alerts") renderAlerts();
  else if (state.route.view === "adjustments" && state.route.id) renderAdjustmentDetail();
  else if (state.route.view === "adjustments") renderAdjustments();
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
  localStorage.setItem("kelly-ads-language", state.lang);
  loadState();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
