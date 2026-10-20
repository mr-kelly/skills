import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where the vehicles view opens a record. A vehicle is a workplace — its
// role-grouped checklist, cross-entity reconciliation flags, and the
// reviewer's decision panel — you stay a while, so it always opens as a full
// page (`#/vehicles/<id>`), never a drawer/split peek. `flagged` is a plain
// table with no detail mode of its own: a row's reconciliation mismatch
// belongs to a vehicle, so clicking it navigates straight into that
// vehicle's item instead of opening an inline record for "flagged" itself.
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

export const state = {
  batch: null,
  settings: null,
  provider: null,
  loaded: false,
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-disclosure-tracker-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  noteDraft: "",
  pendingAction: "",
  overrideAck: false,
  notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-disclosure-tracker.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  countNeedsReview: byId("count-needs-review"),
  countBlocked: byId("count-blocked"),
  countReady: byId("count-ready"),
  language: byId("language"),
  settingsTitle: byId("settingsTitle"),
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
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value === "auto") return "auto";
  return value.startsWith("zh") ? "zh-CN" : "en";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function tGroup(group, key) {
  return messages[activeLang()]?.[group]?.[key] || messages.en[group]?.[key] || key;
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<vehicleId>[/<itemId>]][?filter=…]`. `filter` narrows the
// vehicle grid (SKILL.md's documented contract); the free-text search stays
// transient app state, not the URL, matching this app's original behaviour.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  if (!RECORD_VIEWS.includes(view) && view !== "flagged" && view !== "settings") view = "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  let itemId = "";
  try {
    itemId = parts[2] ? decodeURIComponent(parts[2]) : "";
  } catch {
    itemId = "";
  }
  const mode = DETAIL_MODES[view];
  return {
    view,
    id,
    itemId,
    selectedId: mode ? id : "",
    presentation: mode && id ? "page" : null,
    filter: params.get("filter") || "",
  };
}

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.noteDraft = "";
  state.pendingAction = "";
  state.overrideAck = false;
  state.notice = "";
  setMobileSidebarOpen(false);
  render();
}

export const listUrl = (filter = state.route.filter) => `#/vehicles${filter ? `?filter=${filter}` : ""}`;
export const detailUrl = (vehicleId, itemId = "") =>
  `#/vehicles/${encodeURIComponent(vehicleId)}${itemId ? `/${encodeURIComponent(itemId)}` : ""}`;

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.batch = data.batch;
  state.settings = data;
  state.loaded = true;
  window.dispatchEvent(new CustomEvent("kelly-disclosure-tracker:state", { detail: data }));
  render();
}

async function saveDecision(itemId, action, comment, overrideReconciliation) {
  const provider = await getProvider();
  await provider.submitReview({ id: itemId, action, comment, overrideReconciliation: Boolean(overrideReconciliation) });
  await loadState();
}

function applyI18n() {
  document.documentElement.lang = activeLang();
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh-CN"
      ? { auto: "自动", en: "English", "zh-CN": "中文" }
      : { auto: "Auto", en: "English", "zh-CN": "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  els.detailExpand.textContent = t("openFullPage");
}

function isReady() {
  return Boolean(state.batch?.vehicles?.length);
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

const emptyState = (title) => `<div class="empty-state"><strong>${escapeHtml(title)}</strong></div>`;

function statusBadge(status) {
  const variant = { done: "positive", changes_requested: "warning", blocked: "danger" }[status] || "";
  return `<span class="badge ${variant}">${escapeHtml(tGroup("status_label", status))}</span>`;
}

function readinessBadge(readiness) {
  const variant = { ready: "positive", blocked: "danger", in_progress: "active" }[readiness] || "";
  return `<span class="badge ${variant}">${escapeHtml(tGroup("readiness_label", readiness))}</span>`;
}

function viewLabel(view) {
  if (view === "vehicles") return t("vehiclesTitle");
  if (view === "flagged") return t("flaggedTitle");
  if (view === "settings") return t("settings");
  return t("overview");
}

function renderShell() {
  applyI18n();
  const batch = state.batch;
  const metrics = batch?.metrics || {};
  els.syncStatus.textContent = !state.loaded
    ? t("empty")
    : isReady()
      ? batch?.generated_at
        ? `${t("generated")} ${new Date(batch.generated_at).toLocaleString()}`
        : t("localFilesOnly")
      : t("empty");
  if (els.countNeedsReview) els.countNeedsReview.textContent = metrics.items_needs_review ?? 0;
  if (els.countBlocked) els.countBlocked.textContent = metrics.vehicles_blocked ?? 0;
  if (els.countReady) els.countReady.textContent = metrics.vehicles_ready ?? 0;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = isReady()
      ? `${metrics.vehicles_ready ?? 0} ${t("readyCount").toLowerCase()} · ${metrics.items_needs_review ?? 0} ${t(
          "needsReview",
        ).toLowerCase()}`
      : t("empty");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    const route = link.dataset.route;
    const active =
      (route === "overview" && state.route.view === "overview") ||
      (route === "vehicles" && state.route.view === "vehicles" && !state.route.filter) ||
      (route === state.route.filter && state.route.view === "vehicles") ||
      (route === "settings" && state.route.view === "settings") ||
      (route === "flagged" && state.route.view === "flagged");
    link.classList.toggle("active", Boolean(active));
  });
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar's "needs a decision" block does not already show
// (that block covers items_needs_review / vehicles_blocked / vehicles_ready).
function metricsBand() {
  const metrics = state.batch?.metrics || {};
  const total = state.batch?.vehicles?.length ?? 0;
  return [
    [t("vehiclesTracked"), String(total)],
    [t("inProgressCount"), String(metrics.vehicles_in_progress ?? 0)],
    [t("itemsBlocked"), String(metrics.items_blocked ?? 0)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function readinessRows() {
  const vehicles = state.batch?.vehicles || [];
  const total = vehicles.length || 1;
  return ["ready", "in_progress", "blocked"]
    .map((key) => {
      const count = vehicles.filter((v) => v.readiness === key).length;
      const pct = Math.round((count / total) * 100);
      return `
        <div class="stage-row">
          <span class="stage-row-head">${readinessBadge(key)}<small>${count}</small></span>
          <span class="stage-bar"><span style="width:${pct}%"></span></span>
          <span class="num">${pct}%</span>
        </div>
      `;
    })
    .join("");
}

function vehicleName(vehicleId) {
  return state.batch?.vehicles?.find((v) => v.vehicle_id === vehicleId)?.name || vehicleId;
}

function needsAttentionRows() {
  const priority = { blocked: 0, changes_requested: 1, needs_review: 2 };
  const items = (state.batch?.items || [])
    .filter((item) => item.status !== "done")
    .sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9))
    .slice(0, 6);
  if (!items.length) return `<div class="empty-inline">${t("noItemsNeedAttention")}</div>`;
  return items
    .map(
      (item) => `
      <a class="due-row" href="${detailUrl(item.vehicle_id, item.id)}">
        <span><strong>${escapeHtml(vehicleName(item.vehicle_id))}</strong><small>${escapeHtml(item.title)}</small></span>
        <span class="due-meta">${statusBadge(item.status)}</span>
      </a>
    `,
    )
    .join("");
}

function renderOverview() {
  const vehicles = state.batch?.vehicles || [];
  const batch = state.batch;
  document.getElementById("overviewSummary").textContent = isReady()
    ? [
        `${vehicles.length} ${t("vehicles")}`,
        batch?.generated_at
          ? `${t("generated")} ${new Date(batch.generated_at).toLocaleString()}`
          : t("localFilesOnly"),
      ]
        .filter(Boolean)
        .join(" · ")
    : t("empty");
  document.getElementById("overviewMetrics").innerHTML = isReady() ? metricsBand() : "";
  const body = document.getElementById("overviewBody");
  if (!isReady()) {
    body.innerHTML = emptyState(t("empty"));
    return;
  }
  body.innerHTML = `
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("readinessByVehicle")}</h2>
        ${readinessRows()}
      </div>
      <div class="card overview-panel">
        <h2>${t("needsAttention")}</h2>
        ${needsAttentionRows()}
      </div>
    </section>
  `;
}

// ── Vehicles (record view, detail mode: page) ───────────────────────────────
function filteredVehicles() {
  const query = state.query.trim().toLowerCase();
  const filter = state.route.filter;
  return (state.batch?.vehicles || []).filter((vehicle) => {
    if (query) {
      const haystack = [vehicle.name, vehicle.origination_entity, vehicle.fund_manager_entity, vehicle.listing_venue]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (!filter) return true;
    if (filter === "ready") return vehicle.readiness === "ready";
    if (filter === "blocked") return vehicle.readiness === "blocked";
    if (filter === "needs_review") return vehicle.metrics.needs_review > 0;
    if (filter === "changes_requested") return vehicle.metrics.changes_requested > 0;
    return true;
  });
}

function vehiclesTable(items) {
  return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("vehicleCol")}</th>
          <th class="ws-col-type">${t("typeCol")}</th>
          <th>${t("originationEntity")}</th>
          <th>${t("fundManagerEntity")}</th>
          <th>${t("listingVenue")}</th>
          <th class="ws-col-progress ws-col-num">${t("progressCol")}</th>
          <th class="ws-col-readiness">${t("readinessCol")}</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map((vehicle) => {
            const total = vehicle.metrics.total || 1;
            const pct = Math.round((vehicle.metrics.done / total) * 100);
            return `
            <tr data-id="${escapeHtml(vehicle.vehicle_id)}"${vehicle.vehicle_id === state.route.selectedId ? ' class="ws-selected"' : ""}>
              <td><span class="strong">${escapeHtml(vehicle.name)}</span></td>
              <td>${escapeHtml(String(vehicle.vehicle_type || "").toUpperCase())}</td>
              <td title="${escapeHtml(vehicle.origination_entity)}">${escapeHtml(vehicle.origination_entity)}</td>
              <td title="${escapeHtml(vehicle.fund_manager_entity)}">${escapeHtml(vehicle.fund_manager_entity)}</td>
              <td title="${escapeHtml(vehicle.listing_venue)}">${escapeHtml(vehicle.listing_venue)}</td>
              <td class="ws-col-num">${pct}%</td>
              <td>${readinessBadge(vehicle.readiness)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderVehiclesView() {
  els.viewTitle.textContent = t("vehiclesTitle");
  els.viewTitle.title = t("vehiclesHint");
  const items = filteredVehicles();
  els.viewCount.textContent = String(items.length);
  const table = items.length
    ? vehiclesTable(items)
    : emptyState(state.query || state.route.filter ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${table}${items.length ? pagerControl("vehicles") : ""}`;
  renderVehicleDetailPane();
}

// ── Flagged (plain table, no detail mode — rows open the owning vehicle) ───
function filteredFlagged() {
  const query = state.query.trim().toLowerCase();
  return (state.batch?.items || [])
    .filter((item) => item.status === "blocked")
    .filter((item) => {
      if (!query) return true;
      const haystack = [vehicleName(item.vehicle_id), item.title, item.reason].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
}

function flaggedTable(items) {
  return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("vehicleCol")}</th>
          <th class="ws-col-wide">${t("itemCol")}</th>
          <th class="ws-col-wide">${t("reason")}</th>
          <th class="ws-col-narrow">${t("status")}</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
            <tr data-href="${detailUrl(item.vehicle_id, item.id)}">
              <td><span class="strong">${escapeHtml(vehicleName(item.vehicle_id))}</span></td>
              <td title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</td>
              <td title="${escapeHtml(item.reason)}">${escapeHtml(item.reason)}</td>
              <td class="ws-col-narrow">${statusBadge(item.status)}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderFlaggedView() {
  els.viewTitle.textContent = t("flaggedTitle");
  els.viewTitle.title = t("flaggedHint");
  const items = filteredFlagged();
  els.viewCount.textContent = String(items.length);
  const table = items.length ? flaggedTable(items) : emptyState(state.query ? t("noFlagMatches") : t("noFlags"));
  els.listPanel.innerHTML = `${table}${items.length ? pagerControl("items") : ""}`;
  const bar = els.detailPanel.querySelector(".ws-detail-bar");
  bar.hidden = true;
  els.detailBody.innerHTML = "";
}

// ── Vehicle detail (role-grouped checklist + per-item decision panel) ──────
const ROLE_ORDER = ["origination", "fund_manager", "listing_venue"];

function vehicleItems(vehicleId) {
  return (state.batch?.items || []).filter((item) => item.vehicle_id === vehicleId);
}

function checklistRow(item, selected) {
  const reconciliation =
    item.reconciliation && !item.reconciliation.match
      ? `
      <div class="reconciliation-banner">
        <div class="reconciliation-banner-title">${escapeHtml(t("reconciliationMismatch"))}</div>
        ${escapeHtml(item.reconciliation.note || "")}
        <dl>
          <dt>${escapeHtml(t("originationEntity"))}</dt><dd>${escapeHtml(item.reconciliation.origination_value)}</dd>
          <dt>${escapeHtml(t("listingVenue"))}</dt><dd>${escapeHtml(item.reconciliation.listing_value)}</dd>
        </dl>
      </div>
    `
      : "";
  return `
    <a class="checklist-row ${selected ? "selected" : ""}" href="${detailUrl(item.vehicle_id, item.id)}">
      <div class="checklist-main">
        <div class="checklist-title">${escapeHtml(item.title)}</div>
        <div class="checklist-summary">${escapeHtml(item.summary)}</div>
        ${item.decision?.comment ? `<div class="checklist-note">${escapeHtml(item.decision.comment)}</div>` : ""}
        ${reconciliation}
      </div>
      <div>${statusBadge(item.status)}</div>
    </a>
  `;
}

function itemDetailPanel(item) {
  if (!item) return `<aside class="item-detail-side"><p class="muted">${t("selectItem")}</p></aside>`;
  const currentAction = item.decision?.action || "";
  const draft = state.noteDraft || item.decision?.comment || "";
  const hasMismatch = Boolean(item.reconciliation && !item.reconciliation.match);
  const pendingOrCurrentAction = state.pendingAction || currentAction;
  const overrideNeeded = hasMismatch && pendingOrCurrentAction === "verified";
  const overrideChecked = state.overrideAck || Boolean(item.decision?.override_reconciliation);
  const overrideField = overrideNeeded
    ? `
      <label class="override-ack">
        <input type="checkbox" id="overrideAck" ${overrideChecked ? "checked" : ""} />
        ${escapeHtml(t("overrideAckLabel"))}
      </label>
    `
    : "";
  const notice = state.notice ? `<div class="empty-inline">${escapeHtml(state.notice)}</div>` : "";
  return `
    <aside class="item-detail-side">
      <h2>${escapeHtml(item.title)}</h2>
      <dl>
        <dt>${t("status")}</dt><dd>${statusBadge(item.status)}</dd>
        <dt>${t("proposedAction")}</dt><dd>${escapeHtml(tGroup("proposed_action", item.proposed_action))}</dd>
        <dt>${t("reason")}</dt><dd>${escapeHtml(item.reason)}</dd>
      </dl>
      ${hasMismatch ? `<p class="mismatch-note">${escapeHtml(t("reconciliationHoldNote"))}</p>` : ""}
      <div class="decision-actions">
        <button type="button" data-action="verified" class="button ${currentAction === "verified" ? "active" : ""}">${t("verified")}</button>
        <button type="button" data-action="needs_source" class="button ${currentAction === "needs_source" ? "active" : ""}">${t("needsSource")}</button>
        <button type="button" data-action="flagged" class="button ${currentAction === "flagged" ? "active" : ""}">${t("flagInconsistent")}</button>
      </div>
      <div class="note-field">
        <label for="reviewNote">${t("reviewNote")}</label>
        <textarea id="reviewNote" data-item-id="${escapeHtml(item.id)}">${escapeHtml(draft)}</textarea>
        ${overrideField}
        ${notice}
        <div class="save-row">
          <button type="button" id="saveDecisionButton" class="button primary" data-item-id="${escapeHtml(item.id)}">${t("saveDecision")}</button>
        </div>
      </div>
    </aside>
  `;
}

function renderVehicleDetailPane() {
  const { selectedId, itemId } = state.route;
  const bar = els.detailPanel.querySelector(".ws-detail-bar");
  els.detailBack.textContent = t("backToList");
  els.detailExpand.hidden = true; // "page" mode never opens anywhere else
  bar.hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = "";
    return;
  }
  const vehicle = (state.batch?.vehicles || []).find((v) => v.vehicle_id === selectedId);
  if (!vehicle) {
    // Pre-existing fallback, ported as-is: a stale/bad vehicle id in the URL
    // silently falls back to the list instead of showing a dead page.
    state.route = { ...state.route, id: "", itemId: "", selectedId: "", presentation: null };
    renderVehiclesView();
    return;
  }
  const items = vehicleItems(vehicle.vehicle_id);
  const selectedItem = itemId ? items.find((item) => item.id === itemId) : null;
  const roleSections = ROLE_ORDER.map((role) => {
    const roleItems = items.filter((item) => item.role === role);
    if (!roleItems.length) return "";
    return `
      <section class="role-section">
        <h2>${escapeHtml(t(role))}<span class="role-section-count">${roleItems.filter((i) => i.status === "done").length}/${roleItems.length}</span></h2>
        <div class="checklist">
          ${roleItems.map((item) => checklistRow(item, item.id === itemId)).join("")}
        </div>
      </section>
    `;
  }).join("");
  els.detailBody.innerHTML = `
    <header class="detail-head">
      <h2>${escapeHtml(vehicle.name)} ${readinessBadge(vehicle.readiness)}</h2>
      <p class="muted">${[
        escapeHtml(String(vehicle.vehicle_type || "").toUpperCase()),
        escapeHtml(vehicle.base_currency),
        escapeHtml(vehicle.origination_entity),
        escapeHtml(vehicle.fund_manager_entity),
        escapeHtml(vehicle.listing_venue),
        `${escapeHtml(t("targetClose"))}: ${escapeHtml(vehicle.target_close_date)}`,
      ].join(" · ")}</p>
    </header>
    <section class="item-detail">
      <div class="item-detail-main">${roleSections}</div>
      ${itemDetailPanel(selectedItem)}
    </section>
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
function renderSettings() {
  if (els.settingsTitle) els.settingsTitle.title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  byId("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("settingsTitle")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("reviewerName")}</dt><dd>${escapeHtml(summary.reviewer_name || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
    </div>
  `;
}

// ── Render dispatch ──────────────────────────────────────────────────────────
function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = state.loaded;
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const onTableView = onRecordView || (ready && view === "flagged");
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-searching", onTableView && Boolean(state.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onTableView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onRecordView) renderVehiclesView();
  else if (view === "flagged") renderFlaggedView();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
    return;
  }
  if (event.target.closest("a, button")) return;
  const hrefRow = event.target.closest("tr[data-href]");
  if (hrefRow) {
    location.hash = hrefRow.dataset.href;
    return;
  }
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  location.hash = detailUrl(row.dataset.id);
});
els.detailBody.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    event.preventDefault();
    const hadOverrideNeed = Boolean(document.getElementById("overrideAck"));
    state.pendingAction = actionButton.dataset.action;
    document.querySelectorAll(".decision-actions button").forEach((btn) => btn.classList.remove("active"));
    actionButton.classList.add("active");
    // Only a full re-render can show/hide the reconciliation-override
    // checkbox (it depends on which action is pending); otherwise toggle the
    // button classes in place so the note textarea keeps focus and caret.
    const selectedItem = vehicleItems(state.route.id).find((i) => i.id === state.route.itemId) || null;
    const needsOverrideNow =
      Boolean(selectedItem?.reconciliation && !selectedItem.reconciliation.match) && state.pendingAction === "verified";
    if (hadOverrideNeed !== needsOverrideNow) renderVehicleDetailPane();
    return;
  }
  const saveButton = event.target.closest("#saveDecisionButton");
  if (saveButton) {
    event.preventDefault();
    const itemId = saveButton.dataset.itemId;
    const textarea = document.querySelector("#reviewNote");
    const comment = textarea ? textarea.value : "";
    const item = (state.batch?.items || []).find((i) => i.id === itemId);
    const action = state.pendingAction || item?.decision?.action;
    if (!action) {
      state.notice = t("selectItem");
      renderVehicleDetailPane();
      return;
    }
    const hasMismatch = Boolean(item?.reconciliation && !item.reconciliation.match);
    const overrideCheckbox = document.querySelector("#overrideAck");
    const overrideReconciliation = hasMismatch && action === "verified" ? Boolean(overrideCheckbox?.checked) : false;
    saveButton.disabled = true;
    try {
      await saveDecision(itemId, action, comment, overrideReconciliation);
      state.pendingAction = "";
      state.noteDraft = "";
      state.overrideAck = false;
      state.notice = t("saved");
      render();
    } catch (error) {
      state.notice = error instanceof Error ? error.message : String(error);
      renderVehicleDetailPane();
    } finally {
      saveButton.disabled = false;
    }
    return;
  }
});
els.detailBody.addEventListener("input", (event) => {
  if (event.target.id === "reviewNote") state.noteDraft = event.target.value;
});
els.detailBody.addEventListener("change", (event) => {
  if (event.target.id === "overrideAck") state.overrideAck = event.target.checked;
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  // "page" mode: Escape has nowhere shallower to go than the list itself.
  if (state.route.selectedId) closeDetail();
});
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
  localStorage.setItem("kelly-disclosure-tracker-language", state.lang);
  render();
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    els.loadState.hidden = false;
    els.loadState.classList.add("error");
    els.loadState.textContent = error instanceof Error ? error.message : String(error);
  }
}

previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();

// ── Pagination ─────────────────────────────────────────────────────────────
// Ported unchanged from the pre-migration app.js: jump-to-any-page controls
// (not busa-crm's prev/next-only) because this app's pager already supported
// that and the spec's "no automatic multi-page loop" rule is about not
// fetching every page at once, not about which pager widget is used.
const PAGE_BINDINGS = {
  vehicles: { key: "vehicles", path: "batch.vehicles" },
  flagged: { key: "items", path: "batch.items" },
};

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

function replacePageRows(path, rows) {
  const parts = path.split(".");
  let target = state;
  for (const part of parts.slice(0, -1)) {
    target = target?.[part];
    if (!target) return;
  }
  target[parts.at(-1)] = rows;
}

async function goToPage(key, targetPage) {
  if (state.pageLoading[key] || !state.pageCursors[key]) return;
  const binding = Object.values(PAGE_BINDINGS).find((entry) => entry.key === key);
  if (!binding) return;
  const totalPages = pageCount(key);
  const page = totalPages == null ? Math.max(1, targetPage) : Math.min(Math.max(1, targetPage), totalPages);
  if (page === state.currentPage[key]) return;
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    let result;
    for (let next = state.pageCursors[key].length; next <= page; next += 1) {
      const cursor = state.pageCursors[key][next - 1];
      if (next > 1 && !cursor) return;
      result = await provider.fetchPage(key, cursor);
      state.pageCursors[key][next] = result.nextCursor;
    }
    if (!result || state.pageCursors[key].length > page + 1) {
      result = await provider.fetchPage(key, state.pageCursors[key][page - 1]);
      state.pageCursors[key][page] = result.nextCursor;
    }
    replacePageRows(binding.path, result.rows);
    state.currentPage[key] = page;
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

function pagerControl(key) {
  if (!state.pageCursors[key]) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const loading = Boolean(state.pageLoading[key]);
  const hasNext = total == null ? Boolean(state.pageCursors[key][current]) : current < total;
  if ((total === 1 || total == null) && current === 1 && !hasNext) return "";
  const pages =
    total == null
      ? []
      : total <= 7
        ? Array.from({ length: total }, (_, index) => index + 1)
        : [...new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))].sort(
            (a, b) => a - b,
          );
  const items = [];
  let previous = 0;
  for (const page of pages) {
    if (previous && page - previous > 1) items.push('<span class="pager-ellipsis">…</span>');
    items.push(
      `<button type="button" class="pager-page ${page === current ? "active" : ""}" data-goto-page="${key}:${page}" ${loading || page === current ? "disabled" : ""}>${page}</button>`,
    );
    previous = page;
  }
  return `<nav class="pager" aria-label="${t("pagination")}">
    <button type="button" class="pager-nav" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
    ${items.join("")}
    <button type="button" class="pager-nav" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    ${total == null ? "" : `<span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", total)}</span>`}
  </nav>`;
}

boot();
