import { messages } from "./i18n/messages.js";
import {
  renderAnomalies,
  renderInvoiceDetail,
  renderInvoices,
  renderOrderDetail,
  renderOrders,
  renderSettings,
  submitDecision,
} from "./js/audit-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  anomalyFilter: "all",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-audit-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoDecisions: {},
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-audit.sidebarCollapsed";

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
  approvedCount: document.querySelector("#count-approved"),
  blockedCount: document.querySelector("#count-blocked"),
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

function locale() {
  return activeLang() === "zh" ? "zh-Hans" : "en-US";
}

export function money(value, currency) {
  const code = currency || state.snapshot?.base_currency || "USD";
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency: code, maximumFractionDigits: 2 }).format(
      Number(value || 0),
    );
  } catch {
    return `${code} ${Number(value || 0).toFixed(2)}`;
  }
}

export function n(value) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "2-digit", year: "numeric" }).format(
    new Date(`${String(value).slice(0, 10)}T00:00:00`),
  );
}

export function parseRoute() {
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
  const mismatch = (state.snapshot?.anomalies || []).find((item) => item.rule === "amount_mismatch");
  const route =
    scenario === "orders"
      ? "#/orders"
      : scenario === "invoices"
        ? "#/invoices"
        : scenario === "anomalies"
          ? "#/anomalies"
          : scenario === "detail"
            ? `#/anomalies/${encodeURIComponent(mismatch?.id || "")}`
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

export function anomalies() {
  const list = state.snapshot?.anomalies || [];
  if (!state.demo) return list;
  return list.map((anomaly) => {
    const local = state.demoDecisions[anomaly.id];
    if (!local) return anomaly;
    let status = anomaly.status;
    if (local.action === "approve") status = "approved";
    if (local.action === "request_changes") status = "changes_requested";
    if (local.action === "block") status = "blocked";
    if (local.action === "dismiss") status = "done";
    return { ...anomaly, status, decision: local, draft: local.draft ?? anomaly.draft };
  });
}

export function anomalyById(id) {
  return anomalies().find((item) => item.id === id);
}

function orders() {
  return state.snapshot?.orders || [];
}

export function invoices() {
  return state.snapshot?.invoices || [];
}

function payments() {
  return state.snapshot?.payments || [];
}

export function orderById(id) {
  return orders().find((item) => item.order_id === id);
}

export function invoiceById(id) {
  return invoices().find((item) => item.invoice_id === id);
}

export function paymentById(id) {
  return payments().find((item) => item.payment_id === id);
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const list = anomalies();
  const reviewCount = list.filter((item) => item.status === "needs_review").length;
  const approvedCount = list.filter((item) => item.status === "approved").length;
  const blockedCount = list.filter((item) => item.status === "blocked").length;
  const orderCount = snapshot?.orders?.length || 0;
  els.syncStatus.textContent =
    snapshot && orderCount
      ? `${n(orderCount)} ${t("orders").toLowerCase()} · ${n(snapshot?.invoices?.length || 0)} ${t("invoices").toLowerCase()}`
      : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount;
  if (els.blockedCount) els.blockedCount.textContent = blockedCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needsReview")}`
      : `${n(orderCount)} ${t("orders").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "orders") return t("orders");
  if (view === "invoices") return t("invoices");
  if (view === "anomalies") return t("anomalies");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function ruleBadge(rule) {
  return `<span class="badge badge-${escapeHtml(rule)}">${escapeHtml(enumLabel(rule, "rule"))}</span>`;
}

export function severityBadge(severity) {
  return `<span class="badge badge-severity-${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

export function anomalyBadges(anomalyIds) {
  const list = (anomalyIds || []).map((id) => anomalyById(id)).filter(Boolean);
  if (!list.length) return `<span class="muted">—</span>`;
  return list
    .map(
      (anomaly) =>
        `<a class="badge badge-${escapeHtml(anomaly.rule)}" href="#/anomalies/${encodeURIComponent(anomaly.id)}" title="${escapeHtml(anomaly.title)}">#${anomaly.ref} ${escapeHtml(enumLabel(anomaly.rule, "rule"))}</a>`,
    )
    .join(" ");
}

function warningsPanel() {
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

/* ---------- Overview ---------- */

const AGING_COLORS = ["#dbe3ee", "#f3dfa8", "#f4c48c", "#eb9d80", "#d97b6c"];

function agingBar() {
  const buckets = state.snapshot?.metrics?.aging || [];
  const total = buckets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (!total) return `<div class="empty">${t("empty")}</div>`;
  let x = 0;
  const segments = buckets
    .map((bucket, index) => {
      const width = (Number(bucket.amount || 0) / total) * 100;
      const rect =
        width > 0
          ? `<rect x="${x.toFixed(2)}" y="0" width="${Math.max(width, 0.4).toFixed(2)}" height="8" fill="${AGING_COLORS[index % AGING_COLORS.length]}"><title>${escapeHtml(bucketLabel(bucket.bucket))}: ${money(bucket.amount)}</title></rect>`
          : "";
      x += width;
      return rect;
    })
    .join("");
  const legend = buckets
    .map(
      (bucket, index) => `
    <span><i class="dot" style="background:${AGING_COLORS[index % AGING_COLORS.length]}"></i>${escapeHtml(bucketLabel(bucket.bucket))} <strong>${money(bucket.amount)}</strong></span>
  `,
    )
    .join("");
  return `
    <div class="aging">
      <svg class="aging-svg" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(t("agingTitle"))}">${segments}</svg>
      <div class="aging-legend">${legend}</div>
    </div>
  `;
}

function bucketLabel(bucket) {
  if (bucket === "current") return enumLabel("current");
  return `${bucket} ${t("days")}`;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const list = anomalies();
  const reviewItems = list.filter((item) => item.status === "needs_review");
  const importLog = state.snapshot?.import_log || [];
  els.content.innerHTML = `
    ${warningsPanel()}
    <div class="attention-strip">
      <a class="attention-card" href="#/anomalies">
        <strong>${n(reviewItems.length)}</strong>
        <span>${t("needDecision")}</span>
      </a>
      <a class="attention-card alert" href="#/anomalies">
        <strong>${money(metrics.at_stake_total)}</strong>
        <span>${t("atStake")}</span>
      </a>
      <a class="attention-card alert" href="#/invoices">
        <strong>${money(metrics.overdue_receivable_total)}</strong>
        <span>${t("overdueReceivables")}</span>
      </a>
    </div>
    <div class="metrics six">
      <div class="metric"><span>${t("orders")}</span><strong>${n(metrics.order_count)}</strong><small>${t("imported")}</small></div>
      <div class="metric"><span>${t("invoices")}</span><strong>${n(metrics.invoice_count)}</strong><small>${t("imported")}</small></div>
      <div class="metric"><span>${t("payments")}</span><strong>${n(metrics.payment_count)}</strong><small>${t("imported")}</small></div>
      <div class="metric"><span>${t("matchedPct")}</span><strong>${pct(metrics.matched_pct)}</strong><small>${n(metrics.matched_payment_count)} / ${n(metrics.payment_count)}</small></div>
      <div class="metric"><span>${t("openAnomalies")}</span><strong>${n(metrics.open_anomaly_count)}</strong><small>${n(metrics.anomaly_count)} ${t("anomalies").toLowerCase()}</small></div>
      <div class="metric"><span>${t("receivableOutstanding")}</span><strong>${money(metrics.receivable_total)}</strong><small>${money(metrics.overdue_receivable_total)} ${t("overdueReceivables")}</small></div>
    </div>
    <div class="overview-panel wide">
      <h2>${t("agingTitle")}</h2>
      ${agingBar()}
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <div class="row between">
          <h2>${t("reviewQueue")}</h2>
          <a class="muted" href="#/anomalies">${t("viewAll")} →</a>
        </div>
        ${
          list
            .filter((item) => item.status !== "done")
            .slice(0, 5)
            .map(
              (item) => `
          <a class="health-row" href="#/anomalies/${encodeURIComponent(item.id)}">
            <span><strong>${t("anomaly")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(enumLabel(item.rule, "rule"))} · ${escapeHtml(item.customer || "")}</small></span>
            <span class="num">${money(item.amount_at_stake, item.currency)}</span>
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty">${t("noAnomalies")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("importLog")}</h2>
        ${
          importLog
            .slice(0, 5)
            .map(
              (entry) => `
          <div class="import-row">
            <span>
              <strong>${escapeHtml(new Date(entry.imported_at).toLocaleString())}</strong>
              <small>${escapeHtml(
                Object.values(entry.files || {})
                  .filter(Boolean)
                  .join(" · "),
              )}</small>
              ${(entry.warnings || []).map((warning) => `<small class="import-warning">${escapeHtml(warning)}</small>`).join("")}
            </span>
            <span class="num">+${n(entry.added?.orders || 0)} / +${n(entry.added?.invoices || 0)} / +${n(entry.added?.payments || 0)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

/* ---------- Orders ---------- */

export function filteredOrders() {
  const query = state.query.trim().toLowerCase();
  if (!query) return orders();
  return orders().filter((order) =>
    [order.order_no, order.customer, order.invoice_status, order.payment_status, order.currency]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

/* ---------- Router ---------- */

export function render() {
  renderShell();
  if (state.route.view === "orders" && state.route.id) renderOrderDetail();
  else if (state.route.view === "orders") renderOrders();
  else if (state.route.view === "invoices" && state.route.id) renderInvoiceDetail();
  else if (state.route.view === "invoices") renderInvoices();
  else if (state.route.view === "anomalies") renderAnomalies();
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
  localStorage.setItem("kelly-audit-language", state.lang);
  if (state.demo) loadState();
  else render();
});
els.content.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-anomaly-filter]");
  if (chip) {
    state.anomalyFilter = chip.dataset.anomalyFilter;
    render();
    return;
  }
  const button = event.target.closest("[data-decision]");
  if (button && !button.disabled) {
    submitDecision(button.dataset.id, button.dataset.decision);
  }
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
