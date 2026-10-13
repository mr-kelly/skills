import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { NORMALIZE_ROW_BY_KEY } from "./js/intel-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

// Mode per Base, declared once in config.js `ui.detail_modes`:
//   signals/actions/drafts → split: one reviewable batch worked top to
//                            bottom, record after record — the queue stays
//                            beside the open record.
//   sources                → drawer: a source is a fact scanned, read, and
//                            returned from, not a workplace of its own.
// A `/record` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode becomes a page (base-ui.css handles that).
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

const params = new URLSearchParams(location.search);
const langOverride = params.get("lang") || localStorage.getItem("lang") || "auto";
const normalizeLang = (value) =>
  String(value || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : String(value || "auto");
const lang =
  langOverride === "auto"
    ? (navigator.language || "en").toLowerCase().startsWith("zh")
      ? "zh"
      : "en"
    : normalizeLang(langOverride);
const t = messages[lang] || messages.en;

const state = {
  batch: null,
  decisions: {},
  route: parseRoute(),
  pagination: {},
  totalCount: {},
  workflowCount: null,
  loadingMore: {},
  loadMoreError: {},
  hasLoadedMore: false,
  // Records opened by a `?peek=`/`/id` deep link that are not on the loaded
  // page (records.get, not a second records.list scan). One Map per Base,
  // kept across refreshes so an open peek survives the 10s auto-reload.
  extra: { signals: new Map(), actions: new Map(), drafts: new Map(), sources: new Map() },
};

// ── Routing ──────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?peek=<record>]`. A path record is always the full
// page; `?peek=` drives drawer/split. Refresh and shared links restore the
// same state.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const search = new URLSearchParams(query);
  let view = parts[0] || "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  if (!RECORD_VIEWS.includes(view) && view !== "settings") view = "overview";
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? search.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    // "page" when a `/record` path is open (whatever the Base's own mode),
    // else the Base's own mode (drawer/split), else null off a record view.
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
  };
}

const routeQuery = (extra = {}) => {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) if (value) p.set(key, value);
  const text = p.toString();
  return text ? `?${text}` : "";
};
const listUrl = (view) => `#/${view}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view) => `#/${view}/${encodeURIComponent(id)}`;
// What a row (or "Open full page") opens: a page view's own page, else `?peek=`.
const recordUrl = (id, view) => (DETAIL_MODES[view] === "page" ? detailUrl(id, view) : `#/${view}${routeQuery({ peek: id })}`);

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  render();
  ensureSelectedRecord();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl(state.route.view);
}

// ── Data ─────────────────────────────────────────────────────────────────
async function load() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.batch = data.batch;
  state.decisions = data.decisions || {};
  state.appState = data;
  state.pagination = data.pagination || {};
  state.totalCount = data.totalCount || {};
  state.workflowCount = data.workflowCount || null;
  render();
  ensureSelectedRecord();
}

// A deep link's id may not be on the loaded page: fetch it once (records.get)
// and cache it in state.extra so refresh/back/forward do not refetch.
async function ensureSelectedRecord() {
  const { view, selectedId } = state.route;
  if (!selectedId || !RECORD_VIEWS.includes(view) || !state.batch) return;
  if (byView(view).some((item) => item.id === selectedId)) return;
  if (state.extra[view]?.has(selectedId)) return;
  try {
    const provider = await getProvider();
    if (typeof provider.fetchRecord !== "function") return;
    const record = await provider.fetchRecord(view, selectedId);
    if (record) state.extra[view].set(selectedId, record);
    render();
  } catch (error) {
    console.error("Failed to fetch peeked record", error);
  }
}

function allItems() {
  const b = state.batch || {};
  return [
    ...(b.signals || []).map((item) => ({ ...item, kind: "signal" })),
    ...(b.actions || []).map((item) => ({ ...item, kind: "action" })),
    ...(b.drafts || []).map((item) => ({ ...item, kind: "draft" })),
  ];
}

function byView(view) {
  const kind = view.slice(0, -1);
  return (state.batch?.[view] || []).map((item) => ({ ...item, kind }));
}

function findSelected(view) {
  const { selectedId } = state.route;
  if (!selectedId) return null;
  return byView(view).find((item) => item.id === selectedId) || state.extra[view]?.get(selectedId) || null;
}

function counts() {
  if (state.workflowCount) return state.workflowCount;
  const items = allItems();
  return {
    needs: items.filter((item) => item.status === "needs_review").length,
    approved: items.filter((item) => item.status === "approved").length,
    blocked: items.filter((item) => item.status === "blocked" || item.status === "changes_requested").length,
  };
}

// Per-Base total, shown once next to its nav item so the toolbar/overview
// never have to restate it. `50+` (not a bare loaded-rows count) while more
// pages remain unfetched.
function navCount(key) {
  if (typeof state.totalCount?.[key] === "number") return String(state.totalCount[key]);
  const loaded = (state.batch?.[key] || []).length;
  return state.pagination?.[key] ? `${loaded}+` : String(loaded);
}

// ── Shell ────────────────────────────────────────────────────────────────
function navItem(view, label) {
  const active = state.route.view === view ? "active" : "";
  const count = state.batch ? navCount(view) : "";
  return `<a class="nav-item ${active}" href="#/${view}"><span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</a>`;
}

function setMobileSidebar(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  const toggle = document.querySelector("#mobileSidebarToggle");
  const scrim = document.querySelector("#sidebarScrim");
  toggle?.setAttribute("aria-expanded", String(Boolean(open)));
  if (scrim) scrim.hidden = !open;
}

function bindMobileShell() {
  document.querySelector("#mobileSidebarToggle")?.addEventListener("click", () => setMobileSidebar(true));
  document.querySelector("#sidebarScrim")?.addEventListener("click", () => setMobileSidebar(false));
  document
    .querySelectorAll(".sidebar nav a")
    .forEach((link) => link.addEventListener("click", () => setMobileSidebar(false)));
}

// The app's own phone top bar already names the current view (ws-has-mobile-bar
// hides the toolbar's own title there), so give it that name instead of the
// static brand once the operator is inside a record view.
function mobileTopbarLabel() {
  const { view } = state.route;
  if (RECORD_VIEWS.includes(view)) return viewLabel(view);
  if (view === "settings") return t.settings;
  return state.batch.vertical;
}

function viewLabel(view) {
  return { signals: t.signals, actions: t.actions, drafts: t.drafts, sources: t.sources }[view] || view;
}

function renderShell(content) {
  const c = counts();
  document.querySelector("#app").innerHTML = `
    <aside class="sidebar" id="appSidebar">
      <div class="brand">
        <div class="brand-mark">K</div>
        <div>
          <strong>${state.batch.source}</strong>
          <span>${state.batch.vertical}</span>
        </div>
      </div>
      <section class="attention">
        <div class="eyebrow">${t.humanAttention}</div>
        <div class="attention-row"><strong>${c.needs}</strong><span>${t.needsReview}</span></div>
        <div class="attention-row"><strong>${c.approved}</strong><span>${t.approved}</span></div>
        <div class="attention-row"><strong>${c.blocked}</strong><span>${t.blocked}</span></div>
      </section>
      <nav>
        ${navItem("overview", t.overview)}
        ${navItem("signals", t.signals)}
        ${navItem("actions", t.actions)}
        ${navItem("drafts", t.drafts)}
        ${navItem("sources", t.sources)}
        ${navItem("settings", t.settings)}
      </nav>
    </aside>
    <main class="main">
      <div class="mobile-topbar"><button id="mobileSidebarToggle" class="mobile-menu-button" type="button" aria-controls="appSidebar" aria-expanded="false" aria-label="Open navigation" title="Open navigation"><span class="mobile-menu-icon" aria-hidden="true"></span></button><div class="mobile-topbar-copy"><strong>${state.batch.source}</strong><span>${escapeHtml(mobileTopbarLabel())}</span></div></div>
      ${content}
    </main>
    <button id="sidebarScrim" class="sidebar-scrim" type="button" aria-label="Close navigation" hidden></button>
  `;
  bindMobileShell();
  applyBodyModeClasses();
}

// One rule per mode, per base-ui.css's contract: `ws-detail-open` whenever a
// record is shown, plus exactly one of ws-detail-page / ws-detail-drawer /
// ws-layout-split (split is set for the whole view even with nothing picked).
function applyBodyModeClasses() {
  const { view, presentation, selectedId } = state.route;
  const mode = DETAIL_MODES[view];
  const onRecordView = Boolean(mode);
  const body = document.body;
  body.classList.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.classList.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.classList.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.classList.toggle("ws-layout-split", onRecordView && mode === "split" && presentation !== "page");
  // This app's own phone top bar always names the current view/brand, so the
  // in-toolbar title is redundant there.
  body.classList.add("ws-has-mobile-bar");
}

function badge(value) {
  return `<span class="badge ${String(value).replace(/_/g, "-")}">${escapeHtml(String(value))}</span>`;
}

// ── Overview ─────────────────────────────────────────────────────────────
// Three numbers that take a computation to know and are not already shown by
// the sidebar's needs/approved/blocked totals or the per-Base nav counts.
function metricsBand(b) {
  const highPriorityOpen = b.actions.filter((a) => a.priority === "high" && a.status === "needs_review").length;
  const flagged = b.signals.filter((s) => (s.risk || []).length > 0).length;
  const draftsReady = b.drafts.filter((d) => d.status === "approved").length;
  return [
    [t.highPriorityActions, highPriorityOpen],
    [t.flaggedSignals, flagged],
    [t.draftsReady, draftsReady],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

function itemRow(item) {
  return `
    <a class="item-row" href="${recordUrl(item.id, item.kind === "signal" ? "signals" : item.kind === "action" ? "actions" : "drafts")}">
      <div class="row-ref">${item.kind} #${item.ref}</div>
      <div class="row-main">
        <strong>${escapeHtml(item.title || item.channel)}</strong>
        <span>${escapeHtml(item.summary || item.body || "")}</span>
      </div>
      ${badge(item.status)}
    </a>
  `;
}

function renderOverview() {
  const b = state.batch;
  renderShell(`
    <div class="ws-overview" id="overviewPage">
      <header class="page-hero">
        <div>
          <p class="eyebrow">${new Date(b.generated_at).toLocaleString()}</p>
          <h1>${t.dailyCockpit}</h1>
          <p>${escapeHtml(b.offer)}</p>
        </div>
        <div class="page-actions"><button class="secondary" id="refreshBtn">${t.refresh}</button></div>
      </header>
      <section class="ws-metrics">${metricsBand(b)}</section>
      <section class="split">
        <div>
          <h2>${t.topSignals}</h2>
          ${b.signals.slice(0, 4).map((item) => itemRow({ ...item, kind: "signal" })).join("") || `<p class="muted">${t.noItems}</p>`}
        </div>
        <div>
          <h2>${t.readyActions}</h2>
          ${b.actions.slice(0, 4).map((item) => itemRow({ ...item, kind: "action" })).join("") || `<p class="muted">${t.noItems}</p>`}
        </div>
      </section>
    </div>
  `);
  document.querySelector("#refreshBtn")?.addEventListener("click", load);
}

// ── Record views: signals / actions / drafts (split) ────────────────────
// Source rows show their own 3 columns (label/freshness/coverage) — a
// source has no ref/title/status-queue shape, it is reference data, not a
// reviewable item.
function tableRow(item, view) {
  const selected = state.route.selectedId === item.id ? "ws-selected" : "";
  if (view === "sources") {
    return `<tr data-id="${escapeHtml(item.id)}" class="${selected}"><td title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</td><td class="ws-col-narrow">${badge(item.status)}</td><td>${escapeHtml(item.freshness)}</td><td class="ws-col-wide">${escapeHtml(item.coverage)}</td></tr>`;
  }
  const title = view === "drafts" ? `${item.channel}: ${item.title}` : item.title;
  return `<tr data-id="${escapeHtml(item.id)}" class="${selected}"><td title="${escapeHtml(title)}">${escapeHtml(title)}</td><td class="ws-col-narrow">${badge(item.status)}</td></tr>`;
}

function tableHead(view) {
  if (view === "sources") {
    return `<tr><th>${escapeHtml(viewLabel(view))}</th><th class="ws-col-narrow">${t.status}</th><th class="ws-col-narrow">${t.freshness}</th><th class="ws-col-wide">${t.coverage}</th></tr>`;
  }
  return `<tr><th>${escapeHtml(viewLabel(view))}</th><th class="ws-col-narrow">${t.status}</th></tr>`;
}

function renderRecordList(view) {
  const items = byView(view);
  const selected = findSelected(view);
  const count = navCount(view);
  renderShell(`
    <div class="ws-view" id="viewPage">
      <div class="ws-toolbar">
        <div class="ws-title"><h1 title="${escapeHtml(viewLabel(view))}">${escapeHtml(viewLabel(view))}</h1><span class="ws-count">${count}</span></div>
        <div class="ws-actions"></div>
      </div>
      <div class="ws-workspace">
        <div class="ws-list">
          <table class="ws-table">
            <thead>${tableHead(view)}</thead>
            <tbody>${items.map((item) => tableRow(item, view)).join("") || ""}</tbody>
          </table>
          ${items.length ? "" : `<div class="empty-state"><strong>${t.noItems}</strong></div>`}
          ${loadMoreControl(view)}
        </div>
        <div class="ws-detail">${renderDetailPane(selected, view)}</div>
      </div>
    </div>
  `);
  bindRecordViewInteractions(view, selected);
}

// Matches the non-source bar ("signal #3"): a short locator, not the title —
// the title is the body's own h2, one line down, so the bar never repeats it.
function detailBarTitle(item) {
  return item.kind === "source" ? t.source : `${item.kind} #${item.ref}`;
}

function renderDetailPane(item, view) {
  if (!item) return `<div class="ws-detail-empty">${t.selectItem}</div>`;
  return `
    <div class="ws-detail-bar">
      <strong>${detailBarTitle(item)}</strong>
      <div class="ws-actions">
        ${state.route.presentation !== "page" ? `<a class="button" href="${detailUrl(item.id, view)}">${t.openFullPage}</a>` : ""}
        ${state.route.presentation !== "page" ? `<button type="button" class="button" id="detailClose">${t.close}</button>` : ""}
      </div>
    </div>
    ${detailBody(item)}
  `;
}

function detailBody(item) {
  if (item.kind === "source") return sourceDetailBody(item);
  const body = item.body || item.summary || "";
  return `
    <article>
      <div class="detail-top">${badge(item.status)}</div>
      <h2>${escapeHtml(item.title || item.channel)}</h2>
      <p>${escapeHtml(item.summary || "")}</p>
      ${item.source?.url ? `<div class="field"><span>${t.evidence}</span><a href="${item.source.url}" target="_blank" rel="noreferrer">${escapeHtml(item.source.name)}</a></div>` : ""}
      ${item.why_it_matters ? `<div class="field"><span>${t.why}</span><p>${escapeHtml(item.why_it_matters)}</p></div>` : ""}
      ${item.buyer_intent ? `<div class="field"><span>${t.buyerIntent}</span><p>${escapeHtml(item.buyer_intent)}</p></div>` : ""}
      ${item.next_step ? `<div class="field"><span>${t.nextStep}</span><p>${escapeHtml(item.next_step)}</p></div>` : ""}
      ${item.kind === "draft" ? `<label class="field"><span>${t.editedDraft}</span><textarea id="editedBody">${escapeHtml(body)}</textarea></label>` : ""}
      <label class="field"><span>${t.reviewNote}</span><textarea id="reviewNote">${escapeHtml(item.decision_note || "")}</textarea></label>
      <div class="actions-bar">
        <button data-action="approve">${t.approve}</button>
        <button class="secondary" data-action="request_changes">${t.requestChanges}</button>
        <button class="danger" data-action="block">${t.block}</button>
        ${item.kind === "draft" ? `<button class="secondary" data-action="revise">${t.revise}</button>` : ""}
      </div>
    </article>
  `;
}

function sourceDetailBody(item) {
  return `
    <article>
      <div class="detail-top">${badge(item.status)}</div>
      <h2>${escapeHtml(item.label)}</h2>
      <div class="field"><span>${t.coverage}</span><p>${escapeHtml(item.coverage || "")}</p></div>
      <div class="field"><span>${t.freshness}</span><p>${escapeHtml(item.freshness || "")}</p></div>
    </article>
  `;
}

function loadMoreControl(key) {
  if (!state.pagination[key]) return "";
  return `<div class="load-more"><button type="button" data-load-more="${escapeHtml(key)}" ${state.loadingMore[key] ? "disabled" : ""}>${state.loadingMore[key] ? t.loadingMore : t.loadMore}</button>${state.loadMoreError[key] ? `<span role="alert">${t.loadMoreFailed}</span>` : ""}</div>`;
}

async function loadMore(key) {
  const cursor = state.pagination[key];
  if (!cursor || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.loadMoreError[key] = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage(key, cursor);
    const normalize = NORMALIZE_ROW_BY_KEY[key];
    const known = new Set((state.batch[key] || []).map((item) => item.id));
    const rows = (page.rows || []).map(normalize).filter((item) => !known.has(item.id));
    state.batch[key].push(...rows);
    state.pagination[key] = page.nextCursor;
    state.hasLoadedMore = true;
  } catch {
    state.loadMoreError[key] = true;
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

function bindRecordViewInteractions(view, selected) {
  document.querySelectorAll(".ws-table tbody tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => {
      location.hash = recordUrl(tr.dataset.id, view);
    });
  });
  document.querySelector("#detailClose")?.addEventListener("click", closeDetail);
  bindDecisionForm(selected);
}

function bindDecisionForm(item) {
  if (!item || item.kind === "source") return;
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-action");
      const provider = await getProvider();
      try {
        await provider.applyDecision(item.kind, item.id, {
          action,
          note: document.querySelector("#reviewNote")?.value || "",
          edited_body: document.querySelector("#editedBody")?.value || "",
        });
      } catch (error) {
        console.error("Decision failed", error);
      }
      await load();
    });
  });
}

function renderSettings() {
  const s = state.appState || {};
  renderShell(`
    <div class="page-shell">
      <header class="page-header"><h1>${t.settings}</h1></header>
      <section class="panel settings">
        <div><span>Brand</span><strong>${escapeHtml(s.config_summary?.brand || "")}</strong></div>
        <div><span>Provider</span><strong>${escapeHtml(s.config_summary?.provider || "busabase")}</strong></div>
        <div><span>Data source</span><code>${escapeHtml(s.config_summary?.source || "")}</code></div>
        <div><span>Language</span><select id="langSelect"><option value="auto">Auto</option><option value="en">English</option><option value="zh">中文</option></select></div>
      </section>
    </div>
  `);
  const select = document.querySelector("#langSelect");
  if (select) {
    select.value = langOverride;
    select.addEventListener("change", () => {
      localStorage.setItem("lang", select.value);
      location.reload();
    });
  }
}

function render() {
  if (!state.batch) return;
  const { view } = state.route;
  if (view === "overview") return renderOverview();
  if (view === "settings") return renderSettings();
  return renderRecordList(view);
}

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );
}

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await load();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    console.error("Failed to load Kelly Beauty Intel state", error);
  }
}

window.addEventListener("hashchange", setRoute);
document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-load-more]");
  if (button) loadMore(button.dataset.loadMore);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const { presentation, selectedId } = state.route;
  if (selectedId && presentation && presentation !== "page") closeDetail();
});
boot();
setInterval(() => {
  const active = document.activeElement;
  if (active && ["TEXTAREA", "INPUT", "SELECT"].includes(active.tagName)) return;
  if (!state.batch || state.hasLoadedMore) return;
  load().catch((error) => console.error("Refresh failed", error));
}, 10000);
