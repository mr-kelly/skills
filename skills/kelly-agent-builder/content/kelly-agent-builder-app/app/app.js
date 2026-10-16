import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// There is exactly one record view ("catalog", backed by the "agents" Base)
// and it opens its record as a page: an agent config is a workplace — name,
// trigger description, tool checklist, quota, owning team, and lifecycle
// actions — you read and edit it at length, the same shape busa-crm uses for
// a deal. `#/catalog/:id` and `#/catalog/new` always render the full page;
// there is no drawer/split peek to open or close.
// Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

const state = {
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  summary: null,
  agents: [],
  toolCatalog: [],
  route: parseRoute(),
  query: "",
  sort: { key: "updated_at", dir: "desc" },
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-agent-builder-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  draft: null, // in-progress create/edit form state, keyed by agent id or "new"
  formError: null,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-agent-builder.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  catalogPage: byId("catalogPage"),
  settingsPage: byId("settingsPage"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  settingsContent: byId("settingsBody"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  attentionCount: byId("attention-count"),
  countLive: byId("count-live"),
  countTotal: byId("count-total"),
  language: byId("language"),
  newAgentButton: byId("newAgentButton"),
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

function tf(key, replacements = {}) {
  const template = t(key);
  return Object.entries(replacements).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, value), template);
}

function statusLabel(status) {
  return messages[activeLang()]?.enum?.status?.[status] || messages.en.enum?.status?.[status] || status;
}

function reasonLabel(reason) {
  return messages[activeLang()]?.reason?.[reason] || messages.en.reason?.[reason] || reason;
}

function fieldLabel(field) {
  return messages[activeLang()]?.field?.[field] || messages.en.field?.[field] || field;
}

function toolLabel(id) {
  const entry = state.toolCatalog.find((tool) => tool.id === id);
  if (!entry) return id;
  return activeLang() === "zh" ? entry.label_zh : entry.label_en;
}

// `#/<view>[/<id>]`. "catalog" is the only record view; `id` is either an
// agent id (open that record as a page) or the literal "new".
function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  return { view, id };
}

function setRoute() {
  state.route = parseRoute();
  state.draft = null;
  state.formError = null;
  setMobileSidebarOpen(false);
  render();
}

async function loadState() {
  const provider = await getProvider();
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
  state.summary = data.summary;
  state.agents = data.agents || [];
  state.toolCatalog = data.tools || [];
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
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function renderShell() {
  applyI18n();
  const summary = state.summary || {};
  els.syncStatus.textContent = !state.summary ? t("loading") : state.demo ? t("synced") : t("liveData");
  if (els.attentionCount) els.attentionCount.textContent = summary.needs_attention_count || 0;
  if (els.countLive) els.countLive.textContent = summary.live_count || 0;
  if (els.countTotal) els.countTotal.textContent = summary.total || 0;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = `${summary.live_count || 0} ${t("liveAgents")} · ${summary.needs_attention_count || 0} ${t("needsAttention")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "catalog") return t("catalogTitle");
  if (view === "settings") return t("settings");
  return t("overview");
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

function statusBadge(agent) {
  const status = agent.derived?.is_quota_reached ? "quota_reached" : agent.status;
  const label = agent.derived?.is_quota_reached ? `${statusLabel(agent.status)} · ⚠` : statusLabel(agent.status);
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function quotaBar(agent) {
  const pct = agent.derived?.usage_pct || 0;
  const clamped = Math.max(0, Math.min(100, pct));
  const level = agent.derived?.is_quota_reached ? "danger" : pct >= 80 ? "warn" : "ok";
  return `
    <div class="quota-bar" role="img" aria-label="${clamped.toFixed(1)}% of quota used">
      <div class="quota-bar-track">
        <div class="quota-bar-fill quota-bar-${level}" style="width:${clamped}%"></div>
      </div>
      <span class="quota-bar-label">${pct.toFixed(1)}%</span>
    </div>
  `;
}

function attentionReasons(agent) {
  const reasons = agent.derived?.attention_reasons || [];
  if (!reasons.length) return "";
  return `<div class="attention-reasons">${reasons.map((r) => `<span class="chip warn">${escapeHtml(reasonLabel(r))}</span>`).join("")}</div>`;
}

const agentUrl = (id) => `#/catalog/${encodeURIComponent(id)}`;

// ── Overview ─────────────────────────────────────────────────────────────
// Three numbers the nav does not already show (it already shows needs
// attention / live / total): quota usage, how many agents are stuck at
// quota, and how many drafts are still unfinished.
function metricsBand(summary) {
  const quotaLabel = `${t("quotaUsage")} (${summary.total_calls || 0}/${summary.total_quota || 0})`;
  return [
    [quotaLabel, `${(summary.usage_pct || 0).toFixed(1)}%`],
    [t("quotaReached"), summary.quota_reached_count || 0],
    [t("draftAgents"), summary.draft_count || 0],
  ]
    .map(
      ([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`,
    )
    .join("");
}

function renderOverview() {
  const summary = state.summary || {};
  byId("overviewTitle").textContent = t("overview");
  byId("overviewSummary").textContent = t("localFilesOnly");
  els.overviewMetrics.innerHTML = metricsBand(summary);
  const attentionAgents = state.agents.filter((a) => a.derived?.needs_attention);
  els.overviewBody.innerHTML = `
    <div class="overview-panel wide">
      <h2>${t("needsAttention")}</h2>
      ${
        attentionAgents.length
          ? `<div class="attention-list">${attentionAgents
              .map(
                (agent) => `
            <a class="attention-row" href="${agentUrl(agent.id)}">
              <span class="attention-row-name">${escapeHtml(agent.name || t("newAgent"))}</span>
              ${statusBadge(agent)}
              ${attentionReasons(agent)}
            </a>
          `,
              )
              .join("")}</div>`
          : `<div class="empty">${t("allClear")}</div>`
      }
    </div>
  `;
}

// ── Catalog (record view) ───────────────────────────────────────────────

function sortedAgents(list) {
  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = key === "usage" ? a.derived?.usage_pct || 0 : a[key];
    const bv = key === "usage" ? b.derived?.usage_pct || 0 : b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av ?? "").localeCompare(String(bv ?? "")) * factor;
  });
}

function filteredAgents() {
  const query = state.query.trim().toLowerCase();
  if (!query) return state.agents;
  return state.agents.filter((agent) =>
    [agent.name, agent.owning_team, agent.trigger_description, agent.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function sortHeader(key, label) {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="sortable ${active ? "active" : ""}" data-sort="${key}">${escapeHtml(label)}${arrow}</th>`;
}

function catalogTable(agents) {
  if (!agents.length) return `<div class="empty">${t(state.query ? "noAgents" : "empty")}</div>`;
  const rows = sortedAgents(agents);
  return `
    <table class="ws-table">
      <thead>
        <tr>
          ${sortHeader("name", t("name"))}
          ${sortHeader("owning_team", t("team"))}
          ${sortHeader("status", t("status"))}
          ${sortHeader("usage", t("usage"))}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (agent) => `
          <tr data-id="${escapeHtml(agent.id)}"${agent.id === state.route.id ? ' class="ws-selected"' : ""}>
            <td><a href="${agentUrl(agent.id)}"><span class="strong">${escapeHtml(agent.name || t("newAgent"))}</span></a>${attentionReasons(agent)}</td>
            <td>${agent.owning_team ? escapeHtml(agent.owning_team) : `<span class="muted">${escapeHtml(t("missingOwner"))}</span>`}</td>
            <td>${statusBadge(agent)}</td>
            <td class="num usage-cell">
              ${quotaBar(agent)}
              <span class="muted usage-count">${agent.calls_this_month}/${agent.monthly_quota}</span>
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderCatalog() {
  const agents = filteredAgents();
  els.viewCount.textContent = `${recordCountLabel("agents", agents.length, Boolean(state.query))}`;
  els.listPanel.innerHTML = `${catalogTable(agents)}${pagerControl("agents")}`;
  renderDetail();
}

// ── Agent detail / edit form ────────────────────────────────────────────

function emptyDraft() {
  return {
    name: "",
    trigger_description: "",
    allowed_tools: [],
    approval_required: false,
    monthly_quota: 1000,
    owning_team: "",
  };
}

function toolChecklist(selected) {
  return state.toolCatalog
    .map(
      (tool) => `
      <label class="tool-check">
        <input type="checkbox" name="allowed_tools" value="${escapeHtml(tool.id)}" ${selected.includes(tool.id) ? "checked" : ""}>
        <span>${escapeHtml(toolLabel(tool.id))}</span>
      </label>
    `,
    )
    .join("");
}

function agentForm(agent, draft) {
  const isNew = !agent;
  const readOnly = agent?.status === "archived";
  return `
    <form id="agentForm" class="agent-form">
      <div class="form-row">
        <label for="f-name">${t("name")}</label>
        <input id="f-name" name="name" type="text" value="${escapeHtml(draft.name)}" ${readOnly ? "disabled" : ""}>
      </div>
      <div class="form-row">
        <label for="f-trigger">${t("triggerDescription")}</label>
        <textarea id="f-trigger" name="trigger_description" rows="3" ${readOnly ? "disabled" : ""}>${escapeHtml(draft.trigger_description)}</textarea>
      </div>
      <div class="form-row">
        <label>${t("allowedTools")}</label>
        <div class="tool-checklist" ${readOnly ? "inert" : ""}>${toolChecklist(draft.allowed_tools)}</div>
      </div>
      <div class="form-row form-row-inline">
        <label for="f-quota">${t("monthlyQuota")}</label>
        <input id="f-quota" name="monthly_quota" type="number" min="0" value="${Number(draft.monthly_quota || 0)}" ${readOnly ? "disabled" : ""}>
      </div>
      <div class="form-row form-row-inline">
        <label for="f-team">${t("owningTeam")}</label>
        <input id="f-team" name="owning_team" type="text" value="${escapeHtml(draft.owning_team)}" ${readOnly ? "disabled" : ""}>
      </div>
      <div class="form-row form-row-inline">
        <label class="checkbox-label">
          <input type="checkbox" name="approval_required" ${draft.approval_required ? "checked" : ""} ${readOnly ? "disabled" : ""}>
          <span>${t("approvalRequired")}</span>
        </label>
      </div>
      ${state.formError ? `<div class="form-error">${escapeHtml(state.formError)}</div>` : ""}
      ${
        readOnly
          ? ""
          : `<div class="form-actions">
        <button type="submit" class="button primary">${isNew ? t("create") : t("save")}</button>
        <a class="button" href="${isNew ? "#/catalog" : agentUrl(agent.id)}">${t("cancel")}</a>
      </div>`
      }
    </form>
  `;
}

function agentMeta(agent) {
  return `
    <aside class="detail-side">
      <h2>${t("agentDetail")}</h2>
      <dl>
        <dt>${t("status")}</dt><dd>${statusBadge(agent)}</dd>
        <dt>${t("callsThisMonth")}</dt><dd>${agent.calls_this_month} / ${agent.monthly_quota}</dd>
        <dt>${t("createdAt")}</dt><dd>${new Date(agent.created_at).toLocaleString()}</dd>
        <dt>${t("updatedAt")}</dt><dd>${new Date(agent.updated_at).toLocaleString()}</dd>
      </dl>
      <div class="detail-quota">${quotaBar(agent)}</div>
      ${attentionReasons(agent)}
      <div class="detail-actions">
        ${
          agent.status === "draft"
            ? `<button type="button" data-action="activate" class="button primary">${t("activate")}</button>`
            : ""
        }
        ${agent.status === "live" ? `<button type="button" data-action="pause" class="button">${t("pause")}</button>` : ""}
        ${agent.status !== "archived" ? `<button type="button" data-action="archive" class="button">${t("archive")}</button>` : ""}
      </div>
    </aside>
  `;
}

function renderDetail() {
  const id = state.route.id;
  if (!id) {
    els.detailBody.innerHTML = "";
    return;
  }
  const isNew = id === "new";
  const agent = isNew ? null : state.agents.find((a) => a.id === id);
  if (!isNew && !agent) {
    // A record named by the URL but not on the loaded page. This Base paginates
    // (readLimit 50); rather than silently bouncing to the list, say so — the
    // record may just be on another page.
    els.detailBody.innerHTML = `<div class="empty">${escapeHtml(t("recordNotLoaded"))}</div>`;
    return;
  }
  if (!state.draft) state.draft = agent ? { ...agent } : emptyDraft();
  els.detailBody.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <header class="detail-head">
          <h2>${isNew ? t("newAgent") : escapeHtml(agent.name || t("newAgent"))}</h2>
          ${agent?.trigger_description ? `<p class="muted">${escapeHtml(agent.trigger_description)}</p>` : ""}
        </header>
        ${agentForm(agent, state.draft)}
      </div>
      ${agent ? agentMeta(agent) : ""}
    </section>
  `;
}

// ── Settings ─────────────────────────────────────────────────────────────

function renderSettings() {
  els.settingsContent.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("localFilesOnly")}</h2>
        <p>${escapeHtml(t("boundaryNote"))}</p>
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  const { view, id } = state.route;
  const ready = Boolean(state.summary);
  const onCatalog = ready && view === "catalog";
  const body = document.body.classList;
  body.toggle("ws-detail-open", onCatalog && Boolean(id));
  body.toggle("ws-detail-page", onCatalog && Boolean(id));
  body.toggle("ws-searching", onCatalog && Boolean(state.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.catalogPage.hidden = !onCatalog;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onCatalog) renderCatalog();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ── Form + action handling ────────────────────────────────────────────────

function readForm(form) {
  const data = new FormData(form);
  return {
    name: data.get("name") || "",
    trigger_description: data.get("trigger_description") || "",
    allowed_tools: data.getAll("allowed_tools"),
    approval_required: data.get("approval_required") === "on",
    monthly_quota: Number(data.get("monthly_quota") || 0),
    owning_team: data.get("owning_team") || "",
  };
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target.closest("#agentForm");
  if (!form) return;
  const payload = readForm(form);
  state.formError = null;
  try {
    const provider = await getProvider();
    const isNew = state.route.id === "new";
    if (isNew) {
      const agent = await provider.createAgent(payload);
      await loadState();
      location.hash = agentUrl(agent.id);
    } else {
      await provider.updateAgent(state.route.id, payload);
      await loadState();
      render();
    }
  } catch (error) {
    if (error.status === 422) {
      const fields = (error.missing_fields || []).map(fieldLabel).join(", ");
      state.formError = tf("activationBlocked", { fields });
    } else {
      state.formError = error.message;
    }
    render();
  }
}

async function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = state.route.id;
  try {
    const provider = await getProvider();
    if (action === "archive") {
      if (!window.confirm(t("archiveConfirm"))) return;
      await provider.archiveAgent(id);
    } else if (action === "pause") {
      await provider.pauseAgent(id);
    } else if (action === "activate") {
      await provider.activateAgent(id);
    }
    state.formError = null;
    await loadState();
    render();
  } catch (error) {
    if (error.status === 422) {
      const fields = (error.missing_fields || []).map(fieldLabel).join(", ");
      state.formError = tf("activationBlocked", { fields });
    } else {
      state.formError = error.message;
    }
    render();
  }
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
els.listPanel.addEventListener("click", (event) => {
  const header = event.target.closest("[data-sort]");
  if (header) {
    const key = header.dataset.sort;
    if (state.sort.key === key) {
      state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    } else {
      state.sort = { key, dir: key === "name" || key === "owning_team" ? "asc" : "desc" };
    }
    render();
    return;
  }
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  location.hash = agentUrl(row.dataset.id);
});
els.detailBody.addEventListener("click", handleAction);
els.detailBody.addEventListener("submit", handleFormSubmit);
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.newAgentButton?.addEventListener("click", () => {
  location.hash = "#/catalog/new";
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-agent-builder-language", state.lang);
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

// The app's own phone top bar already names the current view, so base-ui.css
// hides the toolbar's duplicate <h1> on narrow widths.
document.body.classList.add("ws-has-mobile-bar");
syncResponsiveShell();

const PAGE_BINDINGS = {
  catalog: { key: "agents", path: "agents" },
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

function recordCountLabel(key, loadedCount, filtered = false) {
  if (filtered) return loadedCount;
  const total = state.totals?.[key];
  if (total != null) return total;
  const current = state.currentPage?.[key] || 1;
  return `${loadedCount}${state.pageCursors?.[key]?.[current] ? "+" : ""}`;
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
