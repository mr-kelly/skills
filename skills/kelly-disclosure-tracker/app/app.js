import { messages } from "./i18n/messages.js";

const state = {
  batch: null,
  settings: null,
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
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-disclosure-tracker.sidebarCollapsed";

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
  countNeedsReview: document.querySelector("#count-needs-review"),
  countBlocked: document.querySelector("#count-blocked"),
  countReady: document.querySelector("#count-ready"),
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

function parseRoute() {
  const raw = (location.hash || "#/vehicles").slice(1).replace(/^\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart || "");
  return {
    view: parts[0] || "vehicles",
    id: parts[1] ? decodeURIComponent(parts[1]) : "",
    itemId: parts[2] ? decodeURIComponent(parts[2]) : "",
    filter: params.get("filter") || "",
  };
}

function setRoute() {
  state.route = parseRoute();
  state.noteDraft = "";
  state.pendingAction = "";
  state.overrideAck = false;
  render();
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.batch = data.batch;
  state.settings = data;
  render();
}

async function saveDecision(itemId, action, comment, overrideReconciliation) {
  const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, comment, override_reconciliation: Boolean(overrideReconciliation) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Save failed: ${res.status}`);
  }
  const data = await res.json();
  state.batch = data.batch;
}

function applyI18n() {
  document.documentElement.lang = activeLang();
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh-CN"
      ? { auto: "自动", en: "English", zh: "中文" }
      : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function isReady() {
  return Boolean(state.batch?.vehicles?.length);
}

function renderShell() {
  applyI18n();
  const batch = state.batch;
  const metrics = batch?.metrics || {};
  els.syncStatus.textContent = isReady()
    ? batch?.generated_at
      ? `${t("generated")} ${new Date(batch.generated_at).toLocaleString()}`
      : t("localFilesOnly")
    : t("empty");
  if (els.countNeedsReview) els.countNeedsReview.textContent = metrics.items_needs_review ?? 0;
  if (els.countBlocked) els.countBlocked.textContent = metrics.items_blocked ?? 0;
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
      (route === "vehicles" && state.route.view === "vehicles" && !state.route.filter) ||
      (route === state.route.filter && state.route.view === "vehicles") ||
      (route === "settings" && state.route.view === "settings") ||
      (route === "flagged" && state.route.view === "flagged");
    link.classList.toggle("active", Boolean(active));
  });
}

function viewLabel(view) {
  if (view === "vehicles") return t("vehiclesTitle");
  if (view === "flagged") return t("flaggedTitle");
  if (view === "settings") return t("settings");
  return t("vehiclesTitle");
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

function portfolioMetricCards() {
  const metrics = state.batch?.metrics || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("readyCount")}</span><strong class="ready">${metrics.vehicles_ready ?? 0}</strong></div>
      <div class="metric"><span>${t("blockedCount")}</span><strong class="blocked">${metrics.vehicles_blocked ?? 0}</strong></div>
      <div class="metric"><span>${t("inProgressCount")}</span><strong class="pending">${metrics.vehicles_in_progress ?? 0}</strong></div>
      <div class="metric"><span>${t("itemsBlocked")}</span><strong class="blocked">${metrics.items_blocked ?? 0}</strong></div>
    </div>
  `;
}

function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(tGroup("status_label", status))}</span>`;
}

function readinessBadge(readiness) {
  return `<span class="badge ${escapeHtml(readiness)}">${escapeHtml(tGroup("readiness_label", readiness))}</span>`;
}

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

function renderVehicles() {
  els.title.textContent = t("vehiclesTitle");
  const vehicles = filteredVehicles();
  els.subtitle.textContent = `${vehicles.length} ${t("vehicles")}`;
  if (!isReady()) {
    els.content.innerHTML = `<div class="empty">${t("empty")}</div>`;
    return;
  }
  els.content.innerHTML = `
    ${portfolioMetricCards()}
    <div class="vehicle-grid">
      ${vehicles
        .map((vehicle) => {
          const total = vehicle.metrics.total || 1;
          const donePct = Math.round((vehicle.metrics.done / total) * 100);
          return `
        <a class="vehicle-card" href="#/vehicles/${encodeURIComponent(vehicle.vehicle_id)}">
          <div class="row"><strong>${escapeHtml(vehicle.name)}</strong>${readinessBadge(vehicle.readiness)}</div>
          <div class="muted">${escapeHtml(vehicle.origination_entity)} · ${escapeHtml(vehicle.fund_manager_entity)} · ${escapeHtml(vehicle.listing_venue)}</div>
          <div class="vehicle-progress-wrap">
            <div class="vehicle-progress ${vehicle.metrics.blocked ? "has-blocked" : ""}"><span style="width:${donePct}%"></span></div>
            <div class="vehicle-progress-label">
              <span>${vehicle.metrics.done}/${vehicle.metrics.total} ${t("itemsDone").toLowerCase()}${
                vehicle.metrics.blocked ? ` · ${vehicle.metrics.blocked} ${t("flagged").toLowerCase()}` : ""
              }</span>
              <span>${donePct}%</span>
            </div>
          </div>
        </a>
      `;
        })
        .join("")}
    </div>
  `;
}

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
    <a class="checklist-row ${selected ? "selected" : ""}" href="#/vehicles/${encodeURIComponent(item.vehicle_id)}/${encodeURIComponent(item.id)}">
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
        <button type="button" data-action="verified" class="${currentAction === "verified" ? "active" : ""}">${t("verified")}</button>
        <button type="button" data-action="needs_source" class="${currentAction === "needs_source" ? "active" : ""}">${t("needsSource")}</button>
        <button type="button" data-action="flagged" class="${currentAction === "flagged" ? "active" : ""}">${t("flagInconsistent")}</button>
      </div>
      <div class="note-field">
        <label for="reviewNote">${t("reviewNote")}</label>
        <textarea id="reviewNote" data-item-id="${escapeHtml(item.id)}">${escapeHtml(draft)}</textarea>
        ${overrideField}
        <div class="save-row">
          <button type="button" id="saveDecisionButton" data-item-id="${escapeHtml(item.id)}">${t("saveDecision")}</button>
        </div>
      </div>
    </aside>
  `;
}

function renderVehicleDetail() {
  const vehicle = (state.batch?.vehicles || []).find((v) => v.vehicle_id === state.route.id);
  if (!vehicle) {
    state.route.view = "vehicles";
    renderVehicles();
    return;
  }
  const items = vehicleItems(vehicle.vehicle_id);
  const selectedItem = state.route.itemId ? items.find((item) => item.id === state.route.itemId) : null;
  els.title.textContent = vehicle.name;
  els.subtitle.textContent = `${escapeHtml(vehicle.vehicle_type).toUpperCase()} · ${vehicle.base_currency}`;

  const roleSections = ROLE_ORDER.map((role) => {
    const roleItems = items.filter((item) => item.role === role);
    if (!roleItems.length) return "";
    return `
      <section class="role-section">
        <h2>${escapeHtml(t(role))}<span class="role-section-count">${roleItems.filter((i) => i.status === "done").length}/${roleItems.length}</span></h2>
        <div class="checklist">
          ${roleItems.map((item) => checklistRow(item, item.id === state.route.itemId)).join("")}
        </div>
      </section>
    `;
  }).join("");

  els.content.innerHTML = `
    <a class="back-link" href="#/vehicles">← ${t("back")}</a>
    <div class="metrics">
      <div class="metric"><span>${t("originationEntity")}</span><strong>${escapeHtml(vehicle.origination_entity)}</strong></div>
      <div class="metric"><span>${t("fundManagerEntity")}</span><strong>${escapeHtml(vehicle.fund_manager_entity)}</strong></div>
      <div class="metric"><span>${t("listingVenue")}</span><strong>${escapeHtml(vehicle.listing_venue)}</strong></div>
      <div class="metric"><span>${t("targetClose")}</span><strong>${escapeHtml(vehicle.target_close_date)}</strong></div>
    </div>
    <section class="item-detail">
      <div class="item-detail-main">${roleSections}</div>
      ${itemDetailPanel(selectedItem)}
    </section>
  `;
}

function renderFlagged() {
  els.title.textContent = t("flaggedTitle");
  els.subtitle.textContent = t("flaggedSubtitle");
  const items = (state.batch?.items || []).filter((item) => item.status === "blocked");
  if (!items.length) {
    els.content.innerHTML = `<div class="empty">${t("noFlags")}</div>`;
    return;
  }
  const vehicleName = (vehicleId) => state.batch?.vehicles?.find((v) => v.vehicle_id === vehicleId)?.name || vehicleId;
  els.content.innerHTML = `
    <div class="flagged-list">
      ${items
        .map(
          (item) => `
        <a class="flagged-card" href="#/vehicles/${encodeURIComponent(item.vehicle_id)}/${encodeURIComponent(item.id)}">
          <div class="row between"><strong>${escapeHtml(vehicleName(item.vehicle_id))} — ${escapeHtml(item.title)}</strong>${statusBadge(item.status)}</div>
          <div class="muted">${escapeHtml(item.reason)}</div>
          ${
            item.reconciliation
              ? `<div class="reconciliation-banner"><dl>
                  <dt>${escapeHtml(t("originationEntity"))}</dt><dd>${escapeHtml(item.reconciliation.origination_value)}</dd>
                  <dt>${escapeHtml(t("listingVenue"))}</dt><dd>${escapeHtml(item.reconciliation.listing_value)}</dd>
                </dl></div>`
              : ""
          }
          ${item.decision?.comment ? `<div class="checklist-note">${escapeHtml(item.decision.comment)}</div>` : ""}
        </a>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  els.content.innerHTML = `
    <div class="item-detail-main" style="max-width:640px">
      <h2>${t("settingsTitle")}</h2>
      <dl>
        <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
        <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
        <dt>${t("reviewerName")}</dt><dd>${escapeHtml(summary.reviewer_name || "")}</dd>
        <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
      </dl>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "vehicles" && state.route.id) renderVehicleDetail();
  else if (state.route.view === "vehicles") renderVehicles();
  else if (state.route.view === "flagged") renderFlagged();
  else if (state.route.view === "settings") renderSettings();
  else renderVehicles();
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
els.content.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    event.preventDefault();
    state.pendingAction = actionButton.dataset.action;
    document.querySelectorAll(".decision-actions button").forEach((btn) => btn.classList.remove("active"));
    actionButton.classList.add("active");
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
      saveButton.textContent = t("selectItem");
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
      render();
    } catch (error) {
      els.content.insertAdjacentHTML("afterbegin", `<div class="empty">${escapeHtml(error.message)}</div>`);
    } finally {
      saveButton.disabled = false;
    }
    return;
  }
});
els.content.addEventListener("input", (event) => {
  if (event.target.id === "reviewNote") state.noteDraft = event.target.value;
});
els.content.addEventListener("change", (event) => {
  if (event.target.id === "overrideAck") state.overrideAck = event.target.checked;
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-disclosure-tracker-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
