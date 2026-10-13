import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { computeMetrics } from "./js/insurance-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per view. Chosen by what people do with it:
//   signals/actions/drafts → split: each is a review queue worked top to
//                            bottom, one item after the next, so the queue
//                            stays beside the record being decided.
//   sources                → drawer: a short fact people scan many of,
//                            read the full coverage text, then return.
// A `/<view>/<id>` path always opens the full page; `?peek=` drives
// drawer/split. On a phone every mode becomes a page (base-ui.css handles
// that). Declared once, in config.js `ui.detail_modes`.
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const KIND_BY_VIEW = { signals: "signal", actions: "action", drafts: "draft" };

const state = {
  batch: null,
  bootstrap: null,
  provider: null,
  route: parseRoute(),
  // Records opened by URL that are not on the loaded page (records.get).
  extra: { signals: new Map(), actions: new Map(), drafts: new Map() },
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-insurance-intel-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
  notice: "",
  pageError: "",
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-insurance-intel.sidebarCollapsed";

const els = {
  loadState: document.querySelector("#loadState"),
  overviewPage: document.querySelector("#overviewPage"),
  viewPage: document.querySelector("#viewPage"),
  settingsPage: document.querySelector("#settingsPage"),
  viewTitle: document.querySelector("#viewTitle"),
  viewCount: document.querySelector("#viewCount"),
  listPanel: document.querySelector("#listPanel"),
  detailPanel: document.querySelector("#detailPanel"),
  detailBody: document.querySelector("#detailBody"),
  detailBack: document.querySelector("#detailBack"),
  detailExpand: document.querySelector("#detailExpand"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  needsReviewCount: document.querySelector("#count-needs-review"),
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
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
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
// What a row opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;
let routeSerial = 0;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back
  // to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  ensureSelectedRecord();
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
  state.provider = provider;
  const data = await provider.getState();
  closeConnectGate();
  state.batch = data.batch;
  state.bootstrap = data;
  state.extra = { signals: new Map(), actions: new Map(), drafts: new Map() };
  state.pageCursors = {};
  state.currentPage = {};
  state.totals = data.totals || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("kelly-insurance-intel:state", { detail: data }));
  applyDemoRoute();
  render();
  ensureSelectedRecord();
}

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  const total = state.totals[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

function isPartial(key) {
  if (state.totals[key] != null) {
    const total = pageCount(key);
    return total != null && (state.currentPage[key] || 1) < total;
  }
  return Boolean(state.pageCursors[key]?.[state.currentPage[key] || 1]);
}

function recordTotal(key, loaded) {
  if (state.totals[key] != null) return state.totals[key];
  return `${loaded}${state.pageCursors[key]?.[1] ? "+" : ""}`;
}

async function goToPage(key, targetPage) {
  if (state.pageLoading[key] || !state.pageCursors[key]) return;
  const totalPages = pageCount(key);
  const page = totalPages == null ? Math.max(1, targetPage) : Math.min(Math.max(1, targetPage), totalPages);
  if (page === state.currentPage[key]) return;
  state.pageLoading[key] = true;
  state.pageError = "";
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
    state.batch[key] = result.rows;
    state.batch.metrics = computeMetrics(state.batch);
    state.currentPage[key] = page;
  } catch (error) {
    state.pageError = error instanceof Error ? error.message : String(error);
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
      `<button type="button" class="button pager-page ${page === current ? "active" : ""}" data-goto-page="${key}:${page}" ${loading || page === current ? "disabled" : ""}>${page}</button>`,
    );
    previous = page;
  }
  return `<nav class="pager" aria-label="${t("pagination")}">
    <button type="button" class="button pager-nav" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
    ${items.join("")}
    <button type="button" class="button pager-nav" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    ${total == null ? "" : `<span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", total)}</span>`}
  </nav>`;
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get) instead of loading more pages to find it.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!state.batch || !selectedId || !(view in state.extra)) return;
  if (findItem(view, selectedId) || state.extra[view].has(selectedId)) return;
  const provider = state.provider;
  if (typeof provider?.getRecord !== "function") {
    state.extra[view].set(selectedId, null);
    render();
    return;
  }
  const serial = ++routeSerial;
  state.extra[view].set(selectedId, undefined);
  try {
    const row = await provider.getRecord(view, selectedId);
    state.extra[view].set(selectedId, row || null);
  } catch {
    state.extra[view].set(selectedId, null);
  }
  if (serial === routeSerial) render();
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
            ? detailUrl(state.batch?.signals?.[0]?.id || "", "signals")
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
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  document.querySelector("#settingsTitle").textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

function itemsForView(view) {
  const b = state.batch || {};
  if (view === "signals") return b.signals || [];
  if (view === "actions") return b.actions || [];
  if (view === "drafts") return b.drafts || [];
  if (view === "sources") return b.sources || [];
  return [];
}

// Loaded page first, then a record fetched on its own for the URL.
function findItem(view, id) {
  if (!id) return null;
  return itemsForView(view).find((item) => item.id === id) || state.extra[view]?.get(id) || null;
}

function isConnected() {
  return Boolean(state.batch?.batch_id || state.batch?.signals?.length || state.batch?.actions?.length);
}

function renderShell() {
  applyI18n();
  const metrics = state.batch?.metrics || {};
  els.syncStatus.textContent = state.batch?.generated_at
    ? `${t("generated")} ${new Date(state.batch.generated_at).toLocaleString()}`
    : t("empty");
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

function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="decision-feedback ${state.notice.negative ? "negative" : "positive"}">${escapeHtml(state.notice.text)}</div>`;
}

function itemLabel(item) {
  // `item.id` is a last resort, never a label: for a source it is the raw
  // `source_id` slug (e.g. "news"), not the human-readable name — that is
  // the exact "a relation/record id reaches the screen" trap the shared
  // layout spec calls out. `label` covers sources; signals/actions/drafts
  // always have `title`.
  return item.title || item.label || item.channel || item.id;
}

function itemSummary(item) {
  return item.summary || item.effective_body || item.body || "";
}

// ── Overview ───────────────────────────────────────────────────────────────

function renderOverview() {
  const b = state.batch;
  document.querySelector("#overviewTitle").textContent = t("overview");
  document.querySelector("#overviewSummary").textContent = [
    b?.vertical,
    b?.buyer,
    b?.generated_at ? `${t("generated")} ${new Date(b.generated_at).toLocaleString()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (!isConnected()) {
    document.querySelector("#overviewMetrics").innerHTML = "";
    document.querySelector("#overviewBody").innerHTML =
      `<div class="empty-state"><strong>${t("setupNeeded")}</strong></div>`;
    return;
  }
  // Three numbers, none shown anywhere else on screen (the per-kind needs-
  // review counts already sit in the sidebar's attention block).
  document.querySelector("#overviewMetrics").innerHTML = [
    [t("signals"), recordTotal("signals", b.signals.length)],
    [t("actions"), recordTotal("actions", b.actions.length)],
    [t("drafts"), recordTotal("drafts", b.drafts.length)],
  ]
    .map(
      ([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`,
    )
    .join("");

  const topSignals = (b.signals || []).slice(0, 4);
  const readyActions = (b.actions || []).filter((item) => item.status === "approved").slice(0, 4);
  const actionsToShow = readyActions.length ? readyActions : (b.actions || []).slice(0, 4);
  document.querySelector("#overviewBody").innerHTML = `
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
            ${statusBadge(item.status)}
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
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views: Signals / Actions / Drafts / Sources ──────────────────────

function filteredItems(view) {
  const query = state.route.query.trim().toLowerCase();
  const items = itemsForView(view);
  if (!query) return items;
  return items.filter((item) =>
    [itemLabel(item), itemSummary(item), item.status, item.label, item.coverage]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const rowOpen = (view, id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId && state.route.view === view ? ' class="ws-selected"' : ""}>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

// Rows are one line (base-ui's --ws-row-height): the label is the only text
// column, the summary/coverage moves to the detail panel instead of a
// second line that a fixed-height row would clip.
function queueTable(view, items) {
  return `
    <table class="ws-table queue-table">
      <thead><tr><th>${t("title")}</th><th class="ws-col-narrow">${t("status")}</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(view, item.id)}
              ${cell(`<span class="strong">${escapeHtml(itemLabel(item))}</span>`, itemLabel(item))}
              ${cell(statusBadge(item.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function sourcesTable(items) {
  return `
    <table class="ws-table sources-table">
      <thead><tr><th>${t("source")}</th><th class="ws-col-narrow">${t("status")}</th><th class="ws-col-narrow">${t("freshness")}</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen("sources", item.id)}
              ${cell(`<span class="strong">${escapeHtml(item.label)}</span>`, item.label)}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(item.freshness || ""))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = view === "sources" ? t("sources") : t(view);
  const items = filteredItems(view);
  els.viewCount.textContent = `${items.length}${isPartial(view) ? "+" : ""}`;
  const table = view === "sources" ? sourcesTable(items) : queueTable(view, items);
  const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `
    ${state.pageError ? `<div class="warnings"><div class="warning"><strong>${escapeHtml(state.pageError)}</strong></div></div>` : ""}
    ${items.length ? table : empty}
    ${pagerControl(view)}
  `;
  renderDetail();
}

function decisionActions(kind) {
  const disabled = state.saving ? "disabled" : "";
  const buttons = [
    `<button type="button" class="button primary" data-action="approve" ${disabled}>${t("approve")}</button>`,
    `<button type="button" class="button" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>`,
    `<button type="button" class="button danger" data-action="block" ${disabled}>${t("block")}</button>`,
  ];
  if (kind === "draft")
    buttons.push(`<button type="button" class="button" data-action="revise" ${disabled}>${t("revise")}</button>`);
  return buttons.join("");
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

function actionDetailFields(item) {
  return `
    <div class="field"><span>${t("priority")}</span><p>${escapeHtml(enumLabel(item.priority, "priority") || item.priority)}</p></div>
    <div class="field"><span>${t("owner")}</span><p>${escapeHtml(item.owner)}</p></div>
    ${item.reason ? `<div class="field"><span>${t("reason")}</span><p>${escapeHtml(item.reason)}</p></div>` : ""}
    ${(item.linked_signal_ids || []).length ? `<div class="field"><span>${t("linkedSignals")}</span><p>${item.linked_signal_ids.map((id) => escapeHtml(id)).join(", ")}</p></div>` : ""}
    ${item.next_step ? `<div class="field"><span>${t("nextStep")}</span><p>${escapeHtml(item.next_step)}</p></div>` : ""}
  `;
}

function draftDetailFields(item) {
  return `
    <div class="field"><span>${t("channel")}</span><p>${escapeHtml(item.channel)}</p></div>
    ${item.linked_action_id ? `<div class="field"><span>${t("linkedAction")}</span><p>${escapeHtml(item.linked_action_id)}</p></div>` : ""}
    <div class="field"><span>${t("summary")}</span><p>${escapeHtml(item.effective_body)}</p></div>
    <label class="field"><span>${t("editedDraft")}</span><textarea data-edited-body>${escapeHtml(item.edited_body || item.body || "")}</textarea></label>
  `;
}

function sourceDetailFields(item) {
  return `
    <div class="field"><span>${t("freshness")}</span><p>${escapeHtml(item.freshness || "")}</p></div>
    <div class="field"><span>${t("coverage")}</span><p>${escapeHtml(item.coverage || "")}</p></div>
  `;
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = isMobileLayout();
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectRecord")) : "";
    return;
  }
  const item = findItem(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  const kind = KIND_BY_VIEW[view];
  const fields =
    kind === "signal"
      ? signalDetailFields(item)
      : kind === "action"
        ? actionDetailFields(item)
        : kind === "draft"
          ? draftDetailFields(item)
          : sourceDetailFields(item);
  els.detailBody.innerHTML = `
    <header class="detail-head">
      <h2>${escapeHtml(itemLabel(item))}</h2>
      <p class="muted">${statusBadge(item.status)} ${riskBadges(item.risk)}</p>
    </header>
    ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
    ${fields}
    ${
      kind
        ? `
      <label class="field"><span>${t("reviewNote")}</span><textarea data-review-note>${escapeHtml(item.decision?.comment || "")}</textarea></label>
      ${noticeBanner()}
      <div class="actions-bar" data-decision-actions>${decisionActions(kind)}</div>
    `
        : ""
    }
  `;
  if (kind) bindDecisionForm(view, kind, item);
}

function bindDecisionForm(view, kind, item) {
  const panel = els.detailBody.querySelector("[data-decision-actions]");
  if (!panel) return;
  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const note = els.detailBody.querySelector("[data-review-note]")?.value || "";
      const editedBody = els.detailBody.querySelector("[data-edited-body]")?.value || "";
      state.saving = true;
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
        state.saving = false;
        await loadState();
        state.notice = { text: t("decisionSaved") };
      } catch (error) {
        state.saving = false;
        state.notice = { text: error instanceof Error ? error.message : String(error), negative: true };
      } finally {
        render();
      }
    });
  });
}

// ── Help & Settings ────────────────────────────────────────────────────────

function renderSettings() {
  document.querySelector("#settingsTitle").textContent = t("settings");
  const b = state.batch || {};
  document.querySelector("#settingsBody").innerHTML = `
    <div class="settings-grid">
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

function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.batch);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onRecordView) renderRecordView();
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
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
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
  replaceRoute(
    `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: els.search.value })}`,
  );
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-insurance-intel-language", state.lang);
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

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
