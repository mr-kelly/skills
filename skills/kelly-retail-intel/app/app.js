import { messages } from "./i18n/messages.js";

const params = new URLSearchParams(location.search);
const langOverride = params.get("lang") || localStorage.getItem("lang") || "auto";
const lang =
  langOverride === "auto" ? ((navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en") : langOverride;
const t = messages[lang] || messages.en;
const state = { batch: null, decisions: {}, route: parseRoute(), selectedId: null };

function parseRoute() {
  const hash = location.hash || "#/overview";
  const parts = hash.slice(2).split("/");
  return { view: parts[0] || "overview", id: parts[1] || null };
}

async function load() {
  const [batch, decisions, appState] = await Promise.all([
    fetch(`/api/batch${location.search}`).then((r) => r.json()),
    fetch("/api/decisions").then((r) => r.json()),
    fetch(`/api/state${location.search}`).then((r) => r.json()),
  ]);
  state.batch = batch;
  state.decisions = decisions.decisions || {};
  state.appState = appState;
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
  const decision = state.decisions[item.id];
  if (!decision) return item.status;
  if (decision.action === "approve") return "approved";
  if (decision.action === "block") return "blocked";
  if (decision.action === "request_changes") return "changes_requested";
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

function renderShell(content) {
  const c = counts();
  document.querySelector("#app").innerHTML = `
    <aside class="sidebar">
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
      ${content}
    </main>
  `;
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
      <div><span>${t.signals}</span><strong>${b.signals.length}</strong></div>
      <div><span>${t.actions}</span><strong>${b.actions.length}</strong></div>
      <div><span>${t.drafts}</span><strong>${b.drafts.length}</strong></div>
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
        <p class="eyebrow">${items.length} items</p>
        <h1>${state.route.view}</h1>
      </div>
    </header>
    <section class="workbench">
      <div class="list-pane">${items.map(itemRow).join("")}</div>
      <div class="detail-pane">${selected ? detail(selected) : "<p>No items.</p>"}</div>
    </section>
  `);
  bindDecisionForm(selected);
}

function detail(item) {
  const decision = state.decisions[item.id] || {};
  const status = effectiveStatus(item);
  const body = decision.edited_body || item.body || item.summary || "";
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
      <label class="field"><span>${t.reviewNote}</span><textarea id="reviewNote">${escapeHtml(decision.note || "")}</textarea></label>
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
      await fetch(`/api/decisions/${item.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          note: document.querySelector("#reviewNote")?.value || "",
          edited_body: document.querySelector("#editedBody")?.value || "",
        }),
      });
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
  renderShell(`<header class="page-header"><h1>${t.sources}</h1></header><section class="panel">${rows}</section>`);
}

function renderSettings() {
  const s = state.appState || {};
  renderShell(`
    <header class="page-header"><h1>${t.settings}</h1></header>
    <section class="panel settings">
      <div><span>Config</span><strong>${escapeHtml(s.files?.config || "")}</strong></div>
      <div><span>Provider</span><strong>${escapeHtml(s.config_summary?.provider || "local")}</strong></div>
      <div><span>Batch file</span><code>${escapeHtml(s.files?.batch || "")}</code></div>
      <div><span>Decisions file</span><code>${escapeHtml(s.files?.decisions || "")}</code></div>
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

window.addEventListener("hashchange", render);
load();
setInterval(() => {
  const active = document.activeElement;
  if (active && ["TEXTAREA", "INPUT", "SELECT"].includes(active.tagName)) return;
  load();
}, 10000);
