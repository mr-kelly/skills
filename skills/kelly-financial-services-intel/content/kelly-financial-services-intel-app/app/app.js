import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { computeMetrics } from "./js/financial-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where each Base opens a record. signals/actions/drafts are all a daily
// review queue worked top to bottom — one item approved/changed/blocked,
// then the next — so all three are `split`: the queue stays beside the
// record (busa-crm's followups is the same shape). `sources` has no
// per-record detail at all (no decision panel, nothing to open), so it is
// not a RECORD_VIEW and renders as a plain full-bleed table.
// A `/record` path always opens the full page; `?peek=` drives the split
// selection. Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const KNOWN_VIEWS = [...RECORD_VIEWS, "sources", "settings"];
const VIEW_KINDS = { signals: "signal", actions: "action", drafts: "draft" };

const state = {
  batch: null,
  bootstrap: null,
  route: parseRoute(),
  sourcesQuery: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-financial-services-intel-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
  feedback: null,
  pageError: "",
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  edits: {},
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-financial-services-intel.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  viewPage: byId("viewPage"),
  sourcesPage: byId("sourcesPage"),
  settingsPage: byId("settingsPage"),
  settingsBody: byId("settingsBody"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  search: byId("search"),
  sourcesTitle: byId("sourcesTitle"),
  sourcesCount: byId("sourcesCount"),
  sourcesBody: byId("sourcesBody"),
  sourcesSearch: byId("sourcesSearch"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  needsReviewCount: byId("count-needs-review"),
  approvedCount: byId("count-approved"),
  blockedCount: byId("count-blocked"),
  language: byId("language"),
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

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&peek=…]`. Search and the peeked record live in
// the URL so refresh, shared links and Back restore the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!KNOWN_VIEWS.includes(view)) view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    // A `/record` path is always a full page; a split selection reached via
    // `?peek=` keeps the queue on screen beside it.
    presentation: !mode ? null : id ? "page" : mode,
    query: params.get("q") || "",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row opens: `?peek=` drives the split selection.
const recordUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back
  // to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.pageError = "";
  state.feedback = null;
  if (els.search) els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
}

// Replace the current entry without a hashchange: search keystrokes should
// not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.batch = data.batch;
  state.bootstrap = data;
  state.pageCursors = {};
  state.currentPage = {};
  state.totals = data.totals || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("kelly-financial-services-intel:state", { detail: data }));
  applyDemoRoute();
  render();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  const total = state.totals[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

// True while a Base holds only part of its rows — more pages exist, or the
// user is on a later page. Anything summed from loaded rows must say so.
function isPartial(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return false;
  const current = state.currentPage[key] || 1;
  return current > 1 || Boolean(cursors[current]);
}

function recordTotal(key, loaded) {
  if (state.totals[key] != null) return String(state.totals[key]);
  return `${loaded}${isPartial(key) ? "+" : ""}`;
}

// Replaces the displayed page for `key` with a NEIGHBOURING page: exactly one
// request per click, using a cursor already learned from a prior page. Never
// jumps ahead by looping through intermediate pages — that would read every
// page between here and the target to fake a "jump to page N" (there is no
// records.listPage/view-backed total for these Bases, only a forward keyset
// cursor), so this is Prev/Next only.
async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return;
  const current = state.currentPage[key] || 1;
  if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
  if (targetPage > current && !cursors[current]) return; // no next page
  state.pageLoading[key] = true;
  state.pageError = "";
  render();
  try {
    const provider = await getProvider();
    const result = await provider.fetchPage(key, cursors[targetPage - 1]);
    state.batch[key] = result.rows;
    state.batch.metrics = computeMetrics(state.batch);
    cursors[targetPage] = result.nextCursor;
    state.currentPage[key] = targetPage;
  } catch (error) {
    state.pageError = error instanceof Error ? error.message : String(error);
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", String(Math.max(total || 1, current)))}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

function applyDemoRoute() {
  if (!state.bootstrap?.demo || location.hash) return;
  const scenario = state.bootstrap.demo_scenario || "overview";
  const route =
    scenario === "signals"
      ? "#/signals"
      : scenario === "actions"
        ? "#/actions"
        : scenario === "drafts"
          ? "#/drafts"
          : scenario === "detail"
            ? `#/signals/${encodeURIComponent(state.batch?.signals?.[0]?.id || "")}`
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = { auto: activeLang() === "zh" ? "自动" : "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  if (els.search) els.search.placeholder = t("search");
  if (els.sourcesSearch) els.sourcesSearch.placeholder = t("search");
  if (els.refresh) els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  byId("overviewTitle").textContent = t("overview");
  byId("sourcesTitle").textContent = t("sources");
  byId("settingsTitle").textContent = t("settings");
  if (els.detailExpand) els.detailExpand.textContent = t("openFullPage");
}

function itemsForView(view) {
  const b = state.batch || {};
  if (view === "signals") return b.signals || [];
  if (view === "actions") return b.actions || [];
  if (view === "drafts") return b.drafts || [];
  return [];
}

function findItem(view, id) {
  return itemsForView(view).find((item) => item.id === id);
}

function isConnected() {
  return Boolean(state.batch?.batch_id || state.batch?.signals?.length || state.batch?.actions?.length);
}

function renderShell() {
  applyI18n();
  const metrics = state.batch?.metrics || {};
  els.syncStatus.textContent = !state.batch
    ? t("loading")
    : state.bootstrap?.demo
      ? t("demoData")
      : t("liveData");
  if (els.needsReviewCount) els.needsReviewCount.textContent = metrics.needs_review ?? 0;
  if (els.approvedCount) els.approvedCount.textContent = metrics.approved ?? 0;
  if (els.blockedCount) els.blockedCount.textContent = metrics.blocked ?? 0;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = isConnected()
      ? `${metrics.needs_review ?? 0} ${t("needsReview")}`
      : t("needsConnection");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "signals") return t("signals");
  if (view === "actions") return t("actions");
  if (view === "drafts") return t("drafts");
  if (view === "sources") return t("sources");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function riskBadges(risk = []) {
  return risk.map((entry) => `<span class="badge blocked">${escapeHtml(entry)}</span>`).join(" ");
}

function demoBanner() {
  if (!state.bootstrap?.demo) return "";
  return `<div class="warnings"><div class="info"><strong>${t("demoModeTitle")}</strong><span>${t("demoModeBody")}</span></div></div>`;
}

function itemLabel(item) {
  return item.title || item.channel || item.id;
}

function itemSummary(item) {
  return item.summary || item.effective_body || item.body || "";
}

function matches(values, query) {
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav/attention block does not already show (that block
// shows the across-kind needs_review/approved/blocked totals) — the
// per-Base totals, each marked partial when only a page of the Base is
// loaded and the real total (records.count) is not yet known.
function metricsBand() {
  const b = state.batch || {};
  return [
    [t("signals"), recordTotal("signals", (b.signals || []).length)],
    [t("actions"), recordTotal("actions", (b.actions || []).length)],
    [t("drafts"), recordTotal("drafts", (b.drafts || []).length)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderOverview() {
  const b = state.batch || {};
  const generated = b.generated_at ? new Date(b.generated_at).toLocaleString() : "";
  byId("overviewSummary").textContent = [b.buyer, generated ? `${t("generated")} ${generated}` : ""]
    .filter(Boolean)
    .join(" · ");
  byId("overviewMetrics").innerHTML = metricsBand();
  if (!isConnected()) {
    byId("overviewBody").innerHTML = `<div class="empty-state"><strong>${t("setupNeeded")}</strong></div>`;
    return;
  }
  const topSignals = (b.signals || []).slice(0, 5);
  const readyActions = (b.actions || []).filter((item) => item.status === "approved").slice(0, 5);
  const actionsToShow = readyActions.length ? readyActions : (b.actions || []).slice(0, 5);
  byId("overviewBody").innerHTML = `
    ${demoBanner()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("topSignals")}</h2>
        ${
          topSignals
            .map(
              (item) => `
          <a class="due-row" href="${recordUrl(item.id, "signals")}">
            <span><strong>${escapeHtml(itemLabel(item))}</strong><small>${escapeHtml(itemSummary(item))}</small></span>
            <span class="due-meta">${statusBadge(item.status)}</span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("readyActions")}</h2>
        ${
          actionsToShow
            .map(
              (item) => `
          <a class="due-row" href="${recordUrl(item.id, "actions")}">
            <span><strong>${escapeHtml(itemLabel(item))}</strong><small>${escapeHtml(itemSummary(item))}</small></span>
            <span class="due-meta">${statusBadge(item.status)}</span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views: Signals / Actions / Drafts ────────────────────────────────
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) => `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

// Exactly two columns (title + status) on every kind's table — the review
// queue is worked in the narrow `split` pane (see DETAIL_MODES), and
// base-ui.css hides a third+ column there by default; a secondary fact
// (confidence, priority/owner, channel) rides inline under the title
// instead of a column that would only ever render on a full page.
function signalsTable(items) {
  return `
    <table class="ws-table fin-table signals-table">
      ${tableHead([[t("title")], [t("status")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(
                `<span class="strong">${escapeHtml(itemLabel(item))}</span><small>${escapeHtml(itemSummary(item))} · ${Math.round((item.confidence || 0) * 100)}% ${escapeHtml(t("confidence")).toLowerCase()}</small>`,
                itemSummary(item),
              )}
              ${cell(statusBadge(item.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function actionsTable(items) {
  return `
    <table class="ws-table fin-table actions-table">
      ${tableHead([[t("title")], [t("status")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(
                `<span class="strong">${escapeHtml(itemLabel(item))}</span><small>${escapeHtml(enumLabel(item.priority, "priority") || item.priority)} · ${escapeHtml(item.owner || "")}</small>`,
                itemSummary(item),
              )}
              ${cell(statusBadge(item.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function draftsTable(items) {
  return `
    <table class="ws-table fin-table drafts-table">
      ${tableHead([[t("title")], [t("status")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(
                `<span class="strong">${escapeHtml(itemLabel(item))}</span><small>${escapeHtml(item.channel || "")}</small>`,
                itemSummary(item),
              )}
              ${cell(statusBadge(item.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function filteredItems(view) {
  const query = state.route.query.trim().toLowerCase();
  const items = itemsForView(view);
  if (!query) return items;
  return items.filter((item) => matches([itemLabel(item), itemSummary(item), item.status], query));
}

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  const items = filteredItems(view);
  els.viewCount.textContent = `${items.length}${isPartial(view) ? "+" : ""}`;
  const table = view === "signals" ? signalsTable(items) : view === "actions" ? actionsTable(items) : draftsTable(items);
  const empty = `<div class="empty-state"><strong>${escapeHtml(state.route.query ? t("noMatches") : t("empty"))}</strong></div>`;
  els.listPanel.innerHTML = `
    ${state.pageError ? `<div class="warnings"><div class="warning"><strong>${escapeHtml(state.pageError)}</strong></div></div>` : ""}
    ${items.length ? table : empty}
    ${pagerControl(view)}
  `;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = isMobileLayout();
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = `<div class="empty-state"><strong>${t("selectItem")}</strong></div>`;
    return;
  }
  const item = findItem(view, selectedId);
  if (!item) {
    els.detailBody.innerHTML = `<div class="empty-state"><strong>${t("recordMissing")}</strong></div>`;
    return;
  }
  const kind = VIEW_KINDS[view];
  els.detailBody.innerHTML = itemDetail(view, kind, item);
  bindDecisionForm(view, kind, item);
}

function signalDetailFields(item) {
  return `
    <div class="field"><span>${t("confidence")}</span><p>${Math.round((item.confidence || 0) * 100)}%</p></div>
    <div class="field"><span>${t("detected")}</span><p>${item.detected_at ? new Date(item.detected_at).toLocaleString() : ""}</p></div>
    ${item.source?.url ? `<div class="field"><span>${t("evidence")}</span><a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.source.name || item.source.url)}</a></div>` : ""}
    ${item.why_it_matters ? `<div class="field"><span>${t("why")}</span><p>${escapeHtml(item.why_it_matters)}</p></div>` : ""}
    ${item.buyer_intent ? `<div class="field"><span>${t("buyerIntent")}</span><p>${escapeHtml(item.buyer_intent)}</p></div>` : ""}
  `;
}

// A relation field (linked signal/action id) arrives as a bare business id —
// resolved to its own record's label when loaded, "not loaded" otherwise.
// Never the raw id.
function actionDetailFields(item) {
  const linkedSignals = (item.linked_signal_ids || []).map((id) => {
    const signal = findItem("signals", id);
    return signal
      ? `<a href="${recordUrl(signal.id, "signals")}">${escapeHtml(itemLabel(signal))}</a>`
      : `<span class="muted">${t("notLoaded")}</span>`;
  });
  return `
    <div class="field"><span>${t("priority")}</span><p>${escapeHtml(enumLabel(item.priority, "priority") || item.priority)}</p></div>
    <div class="field"><span>${t("owner")}</span><p>${escapeHtml(item.owner)}</p></div>
    ${item.reason ? `<div class="field"><span>${t("reason")}</span><p>${escapeHtml(item.reason)}</p></div>` : ""}
    ${linkedSignals.length ? `<div class="field"><span>${t("linkedSignals")}</span><p>${linkedSignals.join(", ")}</p></div>` : ""}
    ${item.next_step ? `<div class="field"><span>${t("nextStep")}</span><p>${escapeHtml(item.next_step)}</p></div>` : ""}
  `;
}

function draftDetailFields(item) {
  const linkedAction = item.linked_action_id ? findItem("actions", item.linked_action_id) : null;
  return `
    <div class="field"><span>${t("channel")}</span><p>${escapeHtml(item.channel)}</p></div>
    ${
      item.linked_action_id
        ? `<div class="field"><span>${t("linkedAction")}</span><p>${
            linkedAction
              ? `<a href="${recordUrl(linkedAction.id, "actions")}">${escapeHtml(itemLabel(linkedAction))}</a>`
              : `<span class="muted">${t("notLoaded")}</span>`
          }</p></div>`
        : ""
    }
    <div class="field"><span>${t("summary")}</span><p>${escapeHtml(item.effective_body)}</p></div>
    <label class="field"><span>${t("editedDraft")}</span><textarea data-edited-body rows="7">${escapeHtml(item.edited_body || item.body || "")}</textarea></label>
  `;
}

function decisionActions(kind) {
  const disabled = state.saving ? "disabled" : "";
  const buttons = [
    `<button type="button" class="approve" data-action="approve" ${disabled}>${t("approve")}</button>`,
    `<button type="button" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>`,
    `<button type="button" class="danger" data-action="block" ${disabled}>${t("block")}</button>`,
  ];
  if (kind === "draft") buttons.push(`<button type="button" data-action="revise" ${disabled}>${t("revise")}</button>`);
  return buttons.join("");
}

// One detail markup for every kind, same shape the split queue (and the
// `/record` full page, and a reloaded `?peek=`) all render identically.
function itemDetail(view, kind, item) {
  const fields =
    kind === "signal" ? signalDetailFields(item) : kind === "action" ? actionDetailFields(item) : draftDetailFields(item);
  return `
    <article class="item-review" data-item="${escapeHtml(item.id)}">
      <header class="queue-head">
        <span class="queue-ref">#${item.ref}</span>
        ${statusBadge(item.status)}
        ${riskBadges(item.risk)}
      </header>
      <h2 class="queue-subject">${escapeHtml(itemLabel(item))}</h2>
      ${item.summary ? `<p class="muted">${escapeHtml(item.summary)}</p>` : ""}
      ${fields}
      <label class="field"><span>${t("reviewNote")}</span><textarea data-review-note rows="2">${escapeHtml(item.decision?.comment || "")}</textarea></label>
      <div class="queue-actions" data-decision-actions>${decisionActions(kind)}</div>
      <div class="decision-feedback${state.feedback && state.feedback.id === item.id ? ` ${state.feedback.type}` : ""}" data-decision-feedback>${
        state.feedback && state.feedback.id === item.id ? escapeHtml(state.feedback.text) : ""
      }</div>
    </article>
  `;
}

// The feedback message lives in state, not a DOM mutation applied after the
// fact: `render()` in the `finally` block below always rebuilds
// `detailBody` from `itemDetail()` (loadState()'s own render() does too),
// so writing the result straight onto a `[data-decision-feedback]` node gets
// silently wiped by that very next render — itemDetail() has to be able to
// read it back.
function bindDecisionForm(view, kind, item) {
  const panel = els.detailBody.querySelector("[data-decision-actions]");
  if (!panel) return;
  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const note = els.detailBody.querySelector("[data-review-note]")?.value || "";
      const editedBody = els.detailBody.querySelector("[data-edited-body]")?.value || "";
      state.saving = true;
      state.feedback = null;
      render();
      try {
        const provider = await getProvider();
        const result = await provider.saveDecision({
          kind,
          id: item.id,
          action,
          comment: note,
          edited_body: editedBody,
        });
        if (!result.ok) throw new Error(result.error || t("decisionError"));
        await loadState();
        state.feedback = { id: item.id, type: "positive", text: t("decisionSaved") };
      } catch (error) {
        state.feedback = {
          id: item.id,
          type: "negative",
          text: error instanceof Error ? error.message : String(error),
        };
      } finally {
        state.saving = false;
        render();
      }
    });
  });
}

// ── Sources (flat reference list, no detail) ────────────────────────────────
function filteredSources() {
  const query = state.sourcesQuery.trim().toLowerCase();
  const sources = state.batch?.sources || [];
  if (!query) return sources;
  return sources.filter((item) => matches([item.label, item.coverage, item.status, item.freshness], query));
}

function sourcesTable(items) {
  return `
    <table class="ws-table fin-table sources-table">
      ${tableHead([[t("title")], [t("status")], [t("freshness")], [t("coverage")]])}
      <tbody>
        ${items
          .map(
            (item) => `
          <tr>
            ${cell(`<span class="strong">${escapeHtml(item.label)}</span>`, item.label)}
            ${cell(statusBadge(item.status))}
            ${cell(escapeHtml(item.freshness || ""))}
            ${cell(escapeHtml(item.coverage || ""), item.coverage)}
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSources() {
  const items = filteredSources();
  els.sourcesCount.textContent = String(items.length);
  const empty = `<div class="empty-state"><strong>${escapeHtml(state.sourcesQuery ? t("noMatches") : t("empty"))}</strong></div>`;
  els.sourcesBody.innerHTML = items.length ? sourcesTable(items) : empty;
}

// ── Help & Settings ────────────────────────────────────────────────────────
function renderSettings() {
  const b = state.batch || {};
  els.settingsBody.innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.bootstrap?.data_provider || "busabase")}</dd>
          <dt>${t("batchId")}</dt><dd>${escapeHtml(b.batch_id || "")}</dd>
          <dt>${t("vertical")}</dt><dd>${escapeHtml(b.vertical || "")}</dd>
          <dt>${t("buyer")}</dt><dd>${escapeHtml(b.buyer || "")}</dd>
          <dt>${t("offer")}</dt><dd>${escapeHtml(b.offer || "")}</dd>
        </dl>
      </section>
    </div>
  `;
}

// ── Render dispatch ──────────────────────────────────────────────────────────
function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.batch);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const onSourcesView = ready && view === "sources";
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-layout-split", onRecordView && presentation !== "page");
  body.toggle("ws-searching", (onRecordView || onSourcesView) && Boolean((onSourcesView ? state.sourcesQuery : state.route.query)));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.sourcesPage.hidden = !onSourcesView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onRecordView) renderRecordView();
  else if (onSourcesView) renderSources();
  else if (view === "settings") renderSettings();
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

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while the split selection is open replaces the entry,
  // so Close still steps back to the list the selection was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`);
});
els.sourcesSearch?.addEventListener("input", () => {
  state.sourcesQuery = els.sourcesSearch.value;
  render();
});
els.refresh?.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-financial-services-intel-language", state.lang);
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

if (els.search) els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
