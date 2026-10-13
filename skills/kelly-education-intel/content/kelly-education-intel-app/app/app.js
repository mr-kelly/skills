import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { computeMetrics } from "./js/education-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Where a record opens, per Base (declared in config.js `ui.detail_modes`):
//   signals/actions → split: a triage queue worked top to bottom — read,
//                      decide, move to the next — so the queue stays visible.
//   drafts          → page: editing a draft's body wants the full page, not
//                      a cramped side panel.
// A `/record` path always opens the full page; `?peek=` drives the split.
// On a phone every mode becomes a page (base-ui.css handles that).
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = ["signals", "actions", "drafts"];
const VIEW_KINDS = { signals: "signal", actions: "action", drafts: "draft" };

const state = {
  batch: null,
  bootstrap: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-education-intel-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
  pageError: "",
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-education-intel.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  recordPage: byId("recordPage"),
  sourcesPage: byId("sourcesPage"),
  settingsPage: byId("settingsPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBar: document.querySelector("#detailPanel .ws-detail-bar"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  sourcesList: byId("sourcesList"),
  sourcesCount: byId("sourcesCount"),
  search: byId("search"),
  refresh: byId("refresh"),
  viewRefresh: byId("viewRefresh"),
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

// ── Routing ──────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?peek=<record>]`. A `/record` path is always a full
// page; `?peek=` opens the split queue beside the list for a `split` Base.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [rawPath, rawQuery = ""] = raw.split("?");
  const parts = rawPath.split("/").filter(Boolean);
  const params = new URLSearchParams(rawQuery);
  const view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  const mode = RECORD_VIEWS.includes(view) ? DETAIL_MODES[view] || "page" : null;
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    mode,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
  };
}

function setRoute() {
  state.route = parseRoute();
  render();
}

// What a row opens: the full page for a `page` Base, else `?peek=`, keeping
// the list visible.
function recordUrl(view, id) {
  const mode = DETAIL_MODES[view] || "page";
  if (mode === "page") return `#/${view}/${encodeURIComponent(id)}`;
  return `#/${view}?peek=${encodeURIComponent(id)}`;
}

// Always the full page, whatever the Base's mode (the split's "open full
// page" link).
function detailUrl(view, id) {
  return `#/${view}/${encodeURIComponent(id)}`;
}

function closeDetail() {
  location.hash = `#/${state.route.view}`;
}

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
  window.dispatchEvent(new CustomEvent("kelly-education-intel:state", { detail: data }));
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
            ? `#/signals?peek=${encodeURIComponent(state.batch?.signals?.[0]?.id || "")}`
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
  if (els.viewRefresh) els.viewRefresh.textContent = t("refresh");
  els.detailExpand.textContent = t("openFullPage");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
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

// A relation is a business id (`signal-1`, `action-2`). Resolve it to a name
// and a link into that record; when it is not on the loaded page, say so —
// never print the bare id (pre-existing bug found during the layout
// migration: the retired detail panel printed raw ids here).
function relatedLink(view, id) {
  if (!id) return "";
  const item = findItem(view, id);
  if (!item) return `<span class="muted">${t("notLoaded")}</span>`;
  return `<a href="${recordUrl(view, id)}">${escapeHtml(itemLabel(item))}</a>`;
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
  return `<span class="badge status-${escapeHtml(status || "")}">${escapeHtml(enumLabel(status))}</span>`;
}

function riskBadges(risk = []) {
  return risk.map((entry) => `<span class="badge status-blocked">${escapeHtml(entry)}</span>`).join(" ");
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

/* ---------- Overview ---------- */

function renderOverview() {
  byId("overviewTitle").textContent = t("overview");
  byId("overviewSummary").textContent = state.batch?.generated_at
    ? `${t("generated")} ${new Date(state.batch.generated_at).toLocaleString()}`
    : t("empty");
  if (!isConnected()) {
    byId("overviewMetrics").innerHTML = "";
    byId("overviewBody").innerHTML = `<div class="empty-inline">${t("setupNeeded")}</div>`;
    return;
  }
  const b = state.batch;
  const topSignals = (b.signals || []).slice(0, 4);
  const readyActions = (b.actions || []).filter((item) => item.status === "approved").slice(0, 4);
  const actionsToShow = readyActions.length ? readyActions : (b.actions || []).slice(0, 4);
  // Three numbers the sidebar does not already show (it carries needs-review/
  // approved/blocked across all kinds); the buyer names who this batch is for.
  byId("overviewMetrics").innerHTML = [
    [t("signals"), recordTotal("signals", b.signals.length), "#/signals"],
    [t("actions"), recordTotal("actions", b.actions.length), "#/actions"],
    [t("drafts"), recordTotal("drafts", b.drafts.length), "#/drafts"],
  ]
    .map(
      ([label, value, href]) =>
        `<a href="${href}"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></a>`,
    )
    .join("");
  byId("overviewBody").innerHTML = `
    ${demoBanner()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("topSignals")}</h2>
        ${
          topSignals
            .map(
              (item) => `
          <a class="signal-row" href="${recordUrl("signals", item.id)}">
            <span class="signal-row-main">
              <strong>${escapeHtml(itemLabel(item))}</strong>
              <small>${escapeHtml(itemSummary(item))}</small>
            </span>
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
          <a class="signal-row" href="${recordUrl("actions", item.id)}">
            <span class="signal-row-main">
              <strong>${escapeHtml(itemLabel(item))}</strong>
              <small>${escapeHtml(itemSummary(item))}</small>
            </span>
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("buyer")}</h2>
        <p class="muted">${escapeHtml(b.buyer || "")}</p>
        <h2 style="margin-top: 14px">${t("offer")}</h2>
        <p class="muted">${escapeHtml(b.offer || "")}</p>
      </div>
    </section>
  `;
}

/* ---------- Signals / Actions / Drafts: record view ---------- */

function filteredItems(view) {
  const query = state.query.trim().toLowerCase();
  const items = itemsForView(view);
  if (!query) return items;
  return items.filter((item) =>
    [itemLabel(item), itemSummary(item), item.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const rowOpen = (view, id) =>
  `<tr data-view="${escapeHtml(view)}" data-id="${escapeHtml(id)}" tabindex="0"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function signalsTable(items) {
  return `
    <table class="ws-table edu-table signals-table">
      <thead><tr><th>${t("title")}</th><th class="ws-col-num">${t("confidence")}</th><th class="ws-split-keep">${t("status")}</th><th class="muted-col">${t("detected")}</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen("signals", item.id)}
              ${cell(`<span class="strong">${escapeHtml(itemLabel(item))}</span>`, itemSummary(item))}
              ${cell(`${Math.round((item.confidence || 0) * 100)}%`, "", "ws-col-num")}
              ${cell(statusBadge(item.status), "", "ws-split-keep")}
              ${cell(item.detected_at ? new Date(item.detected_at).toLocaleDateString() : "", "", "muted-col")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function actionsTable(items) {
  return `
    <table class="ws-table edu-table actions-table">
      <thead><tr><th>${t("title")}</th><th class="ws-col-narrow">${t("priority")}</th><th class="ws-split-keep">${t("status")}</th><th class="muted-col">${t("owner")}</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen("actions", item.id)}
              ${cell(`<span class="strong">${escapeHtml(itemLabel(item))}</span>`, itemSummary(item))}
              ${cell(`<span class="badge priority-${escapeHtml(item.priority || "")}">${escapeHtml(enumLabel(item.priority, "priority") || item.priority)}</span>`)}
              ${cell(statusBadge(item.status), "", "ws-split-keep")}
              ${cell(escapeHtml(item.owner || ""), "", "muted-col")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function draftsTable(items) {
  return `
    <table class="ws-table edu-table drafts-table">
      <thead><tr><th class="ws-col-narrow">${t("channel")}</th><th class="ws-col-wide">${t("title")}</th><th>${t("status")}</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen("drafts", item.id)}
              ${cell(escapeHtml(item.channel || ""))}
              ${cell(`<span class="strong">${escapeHtml(itemLabel(item))}</span>`, itemSummary(item), "ws-col-wide")}
              ${cell(statusBadge(item.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

const EMPTY_ICON = { signals: "signals", actions: "actions", drafts: "drafts" };

function renderRecordView(view) {
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = itemsForView(view).length
    ? `${itemsForView(view).filter((item) => item.status === "needs_review").length} ${t("needsReview")}`
    : "";
  const items = filteredItems(view);
  els.viewCount.textContent = String(recordTotal(view, items.length));
  document.body.classList.toggle("ws-searching", Boolean(state.query));

  const table =
    view === "signals" ? signalsTable(items) : view === "actions" ? actionsTable(items) : draftsTable(items);
  const empty = `<div class="empty-inline">${state.query ? t("noMatches") : t("empty")}</div>`;
  els.listPanel.innerHTML = `
    ${demoBanner()}
    ${state.pageError ? `<div class="warnings"><div class="warning"><strong>${escapeHtml(state.pageError)}</strong></div></div>` : ""}
    ${items.length ? table : empty}
    ${pagerControl(view)}
  `;
  renderDetail(view);
}

function signalDetailFields(item) {
  return `
    <dl class="detail-facts">
      <dt>${t("confidence")}</dt><dd>${Math.round((item.confidence || 0) * 100)}%</dd>
      <dt>${t("detected")}</dt><dd>${item.detected_at ? new Date(item.detected_at).toLocaleString() : ""}</dd>
      ${item.source?.url ? `<dt>${t("evidence")}</dt><dd><a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.source.name || item.source.url)}</a></dd>` : ""}
    </dl>
    ${item.why_it_matters ? `<section class="detail-section"><h3>${t("why")}</h3><p>${escapeHtml(item.why_it_matters)}</p></section>` : ""}
    ${item.buyer_intent ? `<section class="detail-section"><h3>${t("buyerIntent")}</h3><p>${escapeHtml(item.buyer_intent)}</p></section>` : ""}
  `;
}

function actionDetailFields(item) {
  return `
    <dl class="detail-facts">
      <dt>${t("priority")}</dt><dd>${escapeHtml(enumLabel(item.priority, "priority") || item.priority)}</dd>
      <dt>${t("owner")}</dt><dd>${escapeHtml(item.owner)}</dd>
      ${(item.linked_signal_ids || []).length ? `<dt>${t("linkedSignals")}</dt><dd>${item.linked_signal_ids.map((id) => relatedLink("signals", id)).join(", ")}</dd>` : ""}
    </dl>
    ${item.reason ? `<section class="detail-section"><h3>${t("reason")}</h3><p>${escapeHtml(item.reason)}</p></section>` : ""}
    ${item.next_step ? `<section class="detail-section"><h3>${t("nextStep")}</h3><p>${escapeHtml(item.next_step)}</p></section>` : ""}
  `;
}

function draftDetailFields(item) {
  return `
    <dl class="detail-facts">
      <dt>${t("channel")}</dt><dd>${escapeHtml(item.channel)}</dd>
      ${item.linked_action_id ? `<dt>${t("linkedAction")}</dt><dd>${relatedLink("actions", item.linked_action_id)}</dd>` : ""}
    </dl>
    <section class="detail-section">
      <h3>${t("summary")}</h3>
      <p>${escapeHtml(item.effective_body)}</p>
      <label class="note-label" for="edited-body">${t("editedDraft")}</label>
      <textarea id="edited-body" class="review-note" data-edited-body>${escapeHtml(item.edited_body || item.body || "")}</textarea>
    </section>
  `;
}

function decisionActions(kind) {
  const disabled = state.saving ? "disabled" : "";
  const buttons = [
    `<button type="button" class="button action primary" data-action="approve" ${disabled}>${t("approve")}</button>`,
    `<button type="button" class="button action" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>`,
    `<button type="button" class="button action danger" data-action="block" ${disabled}>${t("block")}</button>`,
  ];
  if (kind === "draft")
    buttons.push(
      `<button type="button" class="button action" data-action="revise" ${disabled}>${t("revise")}</button>`,
    );
  return buttons.join("");
}

function renderDetail(view) {
  const { selectedId, presentation } = state.route;
  const phone = isMobileLayout();
  if (els.detailBack) els.detailBack.textContent = presentation === "page" || phone ? t("back") : t("close");
  if (els.detailExpand) {
    els.detailExpand.hidden = !selectedId || presentation === "page";
    if (selectedId) els.detailExpand.href = detailUrl(view, selectedId);
  }
  if (els.detailBar) els.detailBar.hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = state.route.mode === "split" ? `<div class="empty-inline">${t("selectItem")}</div>` : "";
    return;
  }
  const item = findItem(view, selectedId);
  if (!item) {
    els.detailBody.innerHTML = `<div class="empty-inline">${t("recordMissing")}</div>`;
    return;
  }
  const kind = VIEW_KINDS[view];
  const fields =
    kind === "signal"
      ? signalDetailFields(item)
      : kind === "action"
        ? actionDetailFields(item)
        : draftDetailFields(item);
  els.detailBody.innerHTML = `
    ${demoBanner()}
    <header class="detail-header">
      <h2>${escapeHtml(itemLabel(item))}</h2>
      <div class="detail-head">
        ${statusBadge(item.status)}
        ${riskBadges(item.risk)}
      </div>
    </header>
    ${item.summary ? `<p class="detail-lead">${escapeHtml(item.summary)}</p>` : ""}
    ${fields}
    <section class="detail-section">
      <h3>${t("reviewNote")}</h3>
      <textarea id="review-note" class="review-note" data-review-note>${escapeHtml(item.decision?.comment || "")}</textarea>
      <div class="action-row" data-decision-actions>${decisionActions(kind)}</div>
      <div id="decision-feedback" class="decision-feedback" role="status"></div>
    </section>
  `;
  bindDecisionForm(view, kind, item);
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
        await loadState();
        const again = els.detailBody.querySelector("#decision-feedback");
        if (again) {
          again.textContent = t("decisionSaved");
          again.className = "decision-feedback positive";
        }
      } catch (error) {
        state.saving = false;
        render();
        const again = els.detailBody.querySelector("#decision-feedback");
        if (again) {
          again.textContent = error instanceof Error ? error.message : String(error);
          again.className = "decision-feedback negative";
        }
      } finally {
        state.saving = false;
      }
    });
  });
}

/* ---------- Sources ---------- */

function renderSources() {
  const sources = state.batch?.sources || [];
  els.sourcesCount.textContent = String(sources.length);
  els.sourcesList.innerHTML = `
    ${demoBanner()}
    ${
      sources.length
        ? `<table class="ws-table edu-table sources-table">
      <thead><tr><th>${t("source")}</th><th>${t("status")}</th><th class="ws-col-narrow muted-col">${t("freshness")}</th><th class="ws-col-wide">${t("coverage")}</th></tr></thead>
      <tbody>
        ${sources
          .map(
            (source) => `<tr>
              ${cell(`<span class="strong">${escapeHtml(source.label)}</span>`)}
              ${cell(statusBadge(source.status))}
              ${cell(escapeHtml(source.freshness || ""), "", "muted-col")}
              ${cell(escapeHtml(source.coverage || ""), source.coverage, "ws-col-wide")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
        : `<div class="empty-inline">${t("empty")}</div>`
    }
  `;
}

/* ---------- Settings ---------- */

function renderSettings() {
  const b = state.batch || {};
  byId("settingsContent").innerHTML = `
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

function render() {
  renderShell();
  els.loadState.hidden = true;
  const { view } = state.route;
  const onRecordView = RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  const selected = onRecordView && Boolean(state.route.selectedId);
  body.add("ws-has-mobile-bar");
  body.toggle("ws-detail-open", selected);
  body.toggle("ws-detail-page", onRecordView && state.route.presentation === "page" && selected);
  body.toggle("ws-detail-drawer", false);
  body.toggle("ws-layout-split", onRecordView && state.route.mode === "split" && state.route.presentation !== "page");
  for (const name of RECORD_VIEWS) body.toggle(`view-${name}`, onRecordView && view === name);

  els.overviewPage.hidden = view !== "overview";
  els.recordPage.hidden = !onRecordView;
  els.sourcesPage.hidden = view !== "sources";
  els.settingsPage.hidden = view !== "settings";

  if (onRecordView) renderRecordView(view);
  else if (view === "sources") renderSources();
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

els.listPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-goto-page]");
  if (button) {
    const [key, page] = button.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
    return;
  }
  if (event.target.closest("a")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  location.hash = recordUrl(row.dataset.view, row.dataset.id);
});
els.listPanel.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const row = event.target.closest("tr[data-id]");
  if (row) location.hash = recordUrl(row.dataset.view, row.dataset.id);
});
els.detailBack?.addEventListener("click", closeDetail);
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
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.viewRefresh?.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-education-intel-language", state.lang);
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

syncResponsiveShell();
boot();
