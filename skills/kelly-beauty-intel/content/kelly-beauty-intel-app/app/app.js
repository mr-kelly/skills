import { messages } from "./i18n/messages.js";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { NORMALIZE_ROW_BY_KEY } from "./js/intel-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

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
  selectedId: null,
  pagination: {},
  totalCount: {},
  workflowCount: null,
  loadingMore: {},
  loadMoreError: {},
  hasLoadedMore: false,
};

function parseRoute() {
  const hash = location.hash || "#/overview";
  const parts = hash.slice(2).split("/");
  return { view: parts[0] || "overview", id: parts[1] || null };
}

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
}

function allItems() {
  const b = state.batch || {};
  return [
    ...(b.signals || []).map((item) => ({ ...item, kind: "signal" })),
    ...(b.actions || []).map((item) => ({ ...item, kind: "action" })),
    ...(b.drafts || []).map((item) => ({ ...item, kind: "draft" })),
  ];
}

function effectiveStatus(item) {
  return item.status;
}

function byView() {
  const { view } = state.route;
  if (view === "signals") return (state.batch.signals || []).map((item) => ({ ...item, kind: "signal" }));
  if (view === "actions") return (state.batch.actions || []).map((item) => ({ ...item, kind: "action" }));
  if (view === "drafts") return (state.batch.drafts || []).map((item) => ({ ...item, kind: "draft" }));
  return allItems();
}

function counts() {
  if (state.workflowCount) return state.workflowCount;
  const items = allItems();
  return {
    needs: items.filter((item) => effectiveStatus(item) === "needs_review").length,
    approved: items.filter((item) => effectiveStatus(item) === "approved").length,
    blocked: items.filter(
      (item) => effectiveStatus(item) === "blocked" || effectiveStatus(item) === "changes_requested",
    ).length,
  };
}

function navItem(view, label) {
  const active = state.route.view === view ? "active" : "";
  return `<a class="nav-item ${active}" href="#/${view}">${label}</a>`;
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
      <div class="mobile-topbar"><button id="mobileSidebarToggle" class="mobile-menu-button" type="button" aria-controls="appSidebar" aria-expanded="false" aria-label="Open navigation" title="Open navigation"><span class="mobile-menu-icon" aria-hidden="true"></span></button><div class="mobile-topbar-copy"><strong>${state.batch.source}</strong><span>${state.batch.vertical}</span></div></div>
      ${content}
    </main>
    <button id="sidebarScrim" class="sidebar-scrim" type="button" aria-label="Close navigation" hidden></button>
  `;
  bindMobileShell();
}

function badge(value) {
  return `<span class="badge ${String(value).replace(/_/g, "-")}">${value}</span>`;
}

function itemRow(item) {
  const status = effectiveStatus(item);
  return `
    <a class="item-row" href="#/${state.route.view === "overview" ? `${item.kind}s` : state.route.view}/${item.id}">
      <div class="row-ref">${item.kind} #${item.ref}</div>
      <div class="row-main">
        <strong>${escapeHtml(item.title || item.channel)}</strong>
        <span>${escapeHtml(item.summary || item.body || "")}</span>
      </div>
      ${badge(status)}
    </a>
  `;
}

function renderOverview() {
  const b = state.batch;
  renderShell(`
    <header class="page-header">
      <div>
        <p class="eyebrow">${new Date(b.generated_at).toLocaleString()}</p>
        <h1>Daily intelligence cockpit</h1>
        <p>${escapeHtml(b.offer)}</p>
      </div>
      <button class="secondary" id="refreshBtn">${t.refresh}</button>
    </header>
    <section class="summary-grid">
      <div><span>${t.buyer}</span><strong>${escapeHtml(b.buyer)}</strong></div>
      <div><span>${t.signals}</span><strong>${state.totalCount.signals ?? `${b.signals.length}${state.pagination.signals ? "+" : ""}`}</strong></div>
      <div><span>${t.actions}</span><strong>${state.totalCount.actions ?? `${b.actions.length}${state.pagination.actions ? "+" : ""}`}</strong></div>
      <div><span>${t.drafts}</span><strong>${state.totalCount.drafts ?? `${b.drafts.length}${state.pagination.drafts ? "+" : ""}`}</strong></div>
    </section>
    <section class="split">
      <div>
        <h2>Top signals</h2>
        ${b.signals
          .slice(0, 4)
          .map((item) => itemRow({ ...item, kind: "signal" }))
          .join("")}
      </div>
      <div>
        <h2>Ready actions</h2>
        ${b.actions
          .slice(0, 4)
          .map((item) => itemRow({ ...item, kind: "action" }))
          .join("")}
      </div>
    </section>
  `);
  document.querySelector("#refreshBtn")?.addEventListener("click", load);
}

function renderList() {
  const items = byView();
  const selected = state.route.id ? items.find((item) => item.id === state.route.id) : items[0];
  renderShell(`
    <header class="page-header">
      <div>
        <p class="eyebrow">${state.totalCount[state.route.view] ?? `${items.length}${state.pagination[state.route.view] ? "+" : ""}`} items</p>
        <h1>${state.route.view}</h1>
      </div>
    </header>
    <section class="workbench">
      <div class="list-pane">${items.map(itemRow).join("")}${loadMoreControl(state.route.view)}</div>
      <div class="detail-pane">${selected ? detail(selected) : "<p>No items.</p>"}</div>
    </section>
  `);
  bindDecisionForm(selected);
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

function detail(item) {
  const status = effectiveStatus(item);
  const body = item.body || item.summary || "";
  return `
    <article class="detail">
      <div class="detail-top">
        <span class="row-ref">${item.kind} #${item.ref}</span>
        ${badge(status)}
      </div>
      <h2>${escapeHtml(item.title || item.channel)}</h2>
      <p>${escapeHtml(item.summary || "")}</p>
      ${item.source ? `<div class="field"><span>${t.evidence}</span><a href="${item.source.url}" target="_blank" rel="noreferrer">${escapeHtml(item.source.name)}</a></div>` : ""}
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

function bindDecisionForm(item) {
  if (!item) return;
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

function renderSources() {
  const rows = (state.batch.sources || [])
    .map(
      (source) => `
    <div class="source-row">
      <strong>${escapeHtml(source.label)}</strong>
      ${badge(source.status)}
      <p>${escapeHtml(source.coverage || "")}</p>
      <span>${escapeHtml(source.freshness || "")}</span>
    </div>
  `,
    )
    .join("");
  renderShell(
    `<header class="page-header"><h1>${t.sources}</h1></header><section class="panel">${rows}${loadMoreControl("sources")}</section>`,
  );
}

function renderSettings() {
  const s = state.appState || {};
  renderShell(`
    <header class="page-header"><h1>${t.settings}</h1></header>
    <section class="panel settings">
      <div><span>Brand</span><strong>${escapeHtml(s.config_summary?.brand || "")}</strong></div>
      <div><span>Provider</span><strong>${escapeHtml(s.config_summary?.provider || "busabase")}</strong></div>
      <div><span>Data source</span><code>${escapeHtml(s.config_summary?.source || "")}</code></div>
      <div><span>Language</span><select id="langSelect"><option value="auto">Auto</option><option value="en">English</option><option value="zh">中文</option></select></div>
    </section>
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
  state.route = parseRoute();
  if (!state.batch) return;
  if (state.route.view === "overview") return renderOverview();
  if (state.route.view === "sources") return renderSources();
  if (state.route.view === "settings") return renderSettings();
  return renderList();
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

window.addEventListener("hashchange", render);
document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-load-more]");
  if (button) loadMore(button.dataset.loadMore);
});
boot();
setInterval(() => {
  const active = document.activeElement;
  if (active && ["TEXTAREA", "INPUT", "SELECT"].includes(active.tagName)) return;
  if (!state.batch || state.hasLoadedMore) return;
  load().catch((error) => console.error("Refresh failed", error));
}, 10000);
