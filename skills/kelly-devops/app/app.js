import { messages } from "./i18n/messages.js";
import {
  renderActionDetail,
  renderActions,
  renderExpiries,
  renderExpiryDetail,
  renderServiceDetail,
  renderServices,
  renderSettings,
  renderSpend,
} from "./js/operations-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-devops-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-devops.sidebarCollapsed";

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
  expiringCount: document.querySelector("#count-expiring"),
  downCount: document.querySelector("#count-down"),
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

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function dateTime(value) {
  if (!value) return t("never");
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function pct(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
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
    scenario === "services"
      ? "#/services"
      : scenario === "expiries"
        ? "#/expiries"
        : scenario === "spend"
          ? "#/spend"
          : scenario === "actions"
            ? "#/actions"
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

export function services() {
  return state.snapshot?.services || [];
}

export function expiries() {
  return state.snapshot?.expiries || [];
}

export function actions() {
  return state.snapshot?.actions || [];
}

function events() {
  return state.snapshot?.events || [];
}

export function spend() {
  return state.snapshot?.spend || { providers: [], products: [] };
}

export function metrics() {
  return state.snapshot?.metrics || {};
}

export function actionById(actionId) {
  return actions().find((item) => item.action_id === actionId);
}

function renderShell() {
  applyI18n();
  const reviewCount = actions().filter((item) => item.status === "needs_review").length;
  const expiringCount = expiries().filter((item) => Number(item.days_left) <= 14).length;
  const downCount = services().filter((item) => item.status === "down").length;
  els.syncStatus.textContent =
    state.snapshot?.generated_at && Date.parse(state.snapshot.generated_at) > 0
      ? `${services().length} ${t("services").toLowerCase()}`
      : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.expiringCount) els.expiringCount.textContent = expiringCount;
  if (els.downCount) els.downCount.textContent = downCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needDecision")}`
      : downCount
        ? `${downCount} ${t("servicesDown")}`
        : `${services().length} ${t("services").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "services") return t("services");
  if (view === "expiries") return t("expiries");
  if (view === "spend") return t("spend");
  if (view === "actions") return t("actions");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusDot(status) {
  return `<span class="dot ${escapeHtml(status || "unknown")}" aria-hidden="true"></span>`;
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status || "unknown")}">${statusDot(status)}${escapeHtml(enumLabel(status))}</span>`;
}

export function daysLeftBadge(daysLeft) {
  const days = Number(daysLeft);
  const cls = days < 7 ? "crit" : days < 30 ? "warn" : "ok";
  const label = days < 0 ? `${Math.abs(days)} ${t("days")} ${t("overdue")}` : `${days} ${t("days")}`;
  return `<span class="days-badge ${cls}">${escapeHtml(label)}</span>`;
}

export function typeBadge(type) {
  return `<span class="badge type-${escapeHtml(type)}">${escapeHtml(enumLabel(type, "type"))}</span>`;
}

export function notice() {
  if (!state.notice) return "";
  return `<div class="notice">${escapeHtml(state.notice)}</div>`;
}

export function warnings(serviceId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !serviceId || !item.service_id || item.service_id === serviceId,
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

export function sparkline(history) {
  const points = (history || []).map((entry) => Number(entry.latency_ms || 0));
  if (!points.length) return `<div class="empty">${t("notAvailable")}</div>`;
  const width = 260;
  const height = 64;
  const pad = 6;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (value) => height - pad - (value / max) * (height - pad * 2);
  const coords = points.map((value, index) => [pad + index * step, y(value)]);
  const line = coords.map(([x, yy], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const dots = coords
    .map(([x, yy], index) => {
      const status = history[index]?.status || "up";
      return status === "up"
        ? ""
        : `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="3" class="spark-dot ${escapeHtml(status)}"></circle>`;
    })
    .join("");
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t("latency")}" preserveAspectRatio="none">
      <path d="${line}" fill="none"></path>
      ${dots}
    </svg>
  `;
}

function fleetCards() {
  const m = metrics();
  const spendDelta =
    Number(m.spend_last_month) > 0
      ? ((Number(m.spend_mtd) - Number(m.spend_last_month)) / Number(m.spend_last_month)) * 100
      : 0;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("services")}</span><strong>${m.services_up || 0} / ${m.services_total || 0}</strong><small>${m.services_degraded || 0} ${enumLabel("degraded")} · ${m.services_down || 0} ${enumLabel("down")}</small></div>
      <div class="metric"><span>${t("certs")}</span><strong>${m.certs_ok || 0} ${t("ok")}</strong><small>${m.certs_expiring || 0} ${t("expiring")}</small></div>
      <div class="metric"><span>${t("domains")}</span><strong>${m.domains_ok || 0} ${t("ok")}</strong><small>${m.domains_expiring || 0} ${t("expiring")}</small></div>
      <div class="metric"><span>${t("mtdVsLastMonth")}</span><strong>${money(m.spend_mtd)}</strong><small>${money(m.spend_last_month)} · ${pct(spendDelta)}</small></div>
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent =
    state.snapshot?.generated_at && Date.parse(state.snapshot.generated_at) > 0
      ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
      : t("empty");
  const needsDecision = actions().filter((item) => item.status === "needs_review");
  const expiring = expiries().filter((item) => Number(item.days_left) <= 14);
  const down = services().filter((item) => item.status !== "up");
  const checks = state.snapshot?.checks || {};
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    ${fleetCards()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("humanWorkTitle")}</h2>
        ${needsDecision
          .map(
            (item) => `
          <a class="attention-row" href="#/actions/${encodeURIComponent(item.action_id)}">
            <span><strong>${t("actionRef")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.reason)}</small></span>
            ${typeBadge(item.type)}
          </a>
        `,
          )
          .join("")}
        ${expiring
          .map(
            (item) => `
          <a class="attention-row" href="#/expiries/${encodeURIComponent(item.expiry_id)}">
            <span><strong>${escapeHtml(item.item)}</strong><small>${escapeHtml(item.product)} · ${date(item.expires_on)}</small></span>
            ${daysLeftBadge(item.days_left)}
          </a>
        `,
          )
          .join("")}
        ${down
          .map(
            (item) => `
          <a class="attention-row" href="#/services/${encodeURIComponent(item.service_id)}">
            <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.url)}</small></span>
            ${statusBadge(item.status)}
          </a>
        `,
          )
          .join("")}
        ${!needsDecision.length && !expiring.length && !down.length ? `<div class="empty">${t("empty")}</div>` : ""}
      </div>
      <div class="overview-panel">
        <h2>${t("recentEvents")}</h2>
        ${
          events()
            .slice(0, 8)
            .map(
              (event) => `
          <div class="event-row">
            <span class="event-meta">${statusDot(event.severity)}<small>${dateTime(event.at)}</small>${typeBadge(event.kind)}</span>
            <span class="event-message">${escapeHtml(event.message)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </div>
      <div class="overview-panel wide">
        <h2>${t("checkFreshness")}</h2>
        <div class="freshness">
          <div class="freshness-item"><span>${t("serviceCheck")}</span><strong>${dateTime(checks.services_checked_at)}</strong></div>
          <div class="freshness-item"><span>${t("domainCheck")}</span><strong>${dateTime(checks.domains_checked_at)}</strong></div>
          <div class="freshness-item"><span>${t("spendIngest")}</span><strong>${dateTime(checks.spend_ingested_at)}</strong></div>
        </div>
      </div>
    </section>
  `;
}

export function filteredServices() {
  const query = state.query.trim().toLowerCase();
  if (!query) return services();
  return services().filter((service) =>
    [service.name, service.product, service.url, service.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function render() {
  renderShell();
  if (state.route.view === "services" && state.route.id) renderServiceDetail();
  else if (state.route.view === "services") renderServices();
  else if (state.route.view === "expiries" && state.route.id) renderExpiryDetail();
  else if (state.route.view === "expiries") renderExpiries();
  else if (state.route.view === "spend") renderSpend();
  else if (state.route.view === "actions" && state.route.id) renderActionDetail();
  else if (state.route.view === "actions") renderActions();
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
  localStorage.setItem("kelly-devops-language", state.lang);
  loadState();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
