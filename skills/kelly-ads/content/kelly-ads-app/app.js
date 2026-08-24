import { messages } from "./i18n/messages.js";
import {
  renderAdjustmentDetail,
  renderAdjustments,
  renderAlerts,
  renderCampaignDetail,
  renderCampaigns,
  renderSettings,
} from "./js/campaign-views.js";

export const state = {
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

export const els = {
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

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function money(value, currency = state.snapshot?.currency || "USD") {
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

export function dateTime(value) {
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

export function ageOf(startIso) {
  const reference = Date.parse(state.snapshot?.generated_at || "") || Date.now();
  const start = Date.parse(startIso || "");
  if (!Number.isFinite(start)) return t("notAvailable");
  const hours = Math.max(0, Math.round((reference - start) / 3600000));
  if (hours < 48) return `${hours}${t("hoursShort")}`;
  return `${Math.round(hours / 24)}${t("daysShort")}`;
}

export function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.notice = "";
  state.route = parseRoute();
  render();
}

export async function loadState() {
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

export function anomalies() {
  return state.snapshot?.anomalies || [];
}

export function adjustments() {
  return state.snapshot?.adjustments || [];
}

function syncLog() {
  return state.snapshot?.sync_log || [];
}

function metrics() {
  return state.snapshot?.metrics || {};
}

export function campaignById(campaignId) {
  return campaigns().find((item) => item.campaign_id === campaignId);
}

export function adjustmentById(adjustmentId) {
  return adjustments().find((item) => item.adjustment_id === adjustmentId);
}

export function anomalyById(anomalyId) {
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

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status || "unknown")}">${statusDot(status)}${escapeHtml(enumLabel(status))}</span>`;
}

export function platformBadge(platformId) {
  return `<span class="badge platform-${escapeHtml(platformId)}">${escapeHtml(enumLabel(platformId, "platform"))}</span>`;
}

export function typeBadge(type) {
  return `<span class="badge">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

export function adjTypeBadge(type) {
  return `<span class="badge">${escapeHtml(enumLabel(type, "adjtype"))}</span>`;
}

export function acosBadge(acos, target) {
  const value = Number(acos || 0);
  const goal = Number(target || 0);
  const cls = !goal || value <= goal ? "" : value <= goal * 1.2 ? "warn" : "crit";
  const label = goal ? `${value.toFixed(1)}% / ${goal.toFixed(0)}%` : `${value.toFixed(1)}%`;
  return `<span class="acos-badge ${cls}" title="${t("acos")} ${t("vs")} ${t("acosTarget")}">${escapeHtml(label)}</span>`;
}

export function trendArrow(trend) {
  const glyph = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
  return `<span class="trend ${escapeHtml(trend || "flat")}" title="${t("trend")}">${glyph}</span>`;
}

export function budgetBar(pctSpent) {
  const value = Math.max(0, Math.min(100, Number(pctSpent || 0)));
  const cls = value >= 100 ? "crit" : value >= 85 ? "warn" : "";
  return `<div class="budget-bar ${cls}"><i style="width:${value}%"></i></div>`;
}

export function notice() {
  if (!state.notice) return "";
  return `<div class="notice">${escapeHtml(state.notice)}</div>`;
}

export function lockBanner() {
  const lock = state.settings?.lock;
  if (!lock) return "";
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")}: ${escapeHtml(lock.message || "")}</span></div></div>`;
}

export function warnings(campaignId = "") {
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

export function campaignChart(campaign) {
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

export function filteredCampaigns() {
  const query = state.query.trim().toLowerCase();
  if (!query) return campaigns();
  return campaigns().filter((campaign) =>
    [campaign.name, campaign.product, campaign.sku, campaign.platform, campaign.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function render() {
  renderShell();
  if (state.route.view === "campaigns" && state.route.id) renderCampaignDetail();
  else if (state.route.view === "campaigns") renderCampaigns();
  else if (state.route.view === "alerts") renderAlerts();
  else if (state.route.view === "adjustments" && state.route.id) renderAdjustmentDetail();
  else if (state.route.view === "adjustments") renderAdjustments();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

export function escapeHtml(value) {
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
