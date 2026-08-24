import { messages, resolveLanguage } from "./i18n/messages.js";
import {
  closeConnectGate,
  passConnectGate,
  renderProductOnboarding,
  renderSetupRequired,
} from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const app = document.getElementById("app");
const scrim = document.getElementById("sidebarScrim");
const state = {
  data: null,
  route: parseRoute(),
  lang: resolveLanguage(),
  compareMode: "split",
  reveal: 50,
  draftStrength: null,
  localFileName: "",
  settingsTab: "guide",
  busy: false,
  pendingDecision: null,
};

const t = (key) => messages[state.lang]?.[key] || messages.en[key] || key;
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function parseRoute() {
  const [view = "queue", id = ""] = window.location.hash.replace(/^#\/?/, "").split("/");
  const allowed = new Set(["queue", "approved", "done", "blocked", "settings"]);
  return { view: allowed.has(view) ? view : "queue", id };
}

function routeTo(view, id = "") {
  window.location.hash = `#/${view}${id ? `/${id}` : ""}`;
}

function isMobile() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  scrim.hidden = !open;
}

function visibleCandidates() {
  const items = state.data?.snapshot?.candidates || [];
  if (state.route.view === "approved") return items.filter((item) => item.status === "approved");
  if (state.route.view === "done") return items.filter((item) => item.status === "done");
  if (state.route.view === "blocked") return items.filter((item) => item.status === "blocked");
  return items.filter((item) => ["needs_review", "changes_requested"].includes(item.status));
}

function selectedCandidate() {
  const items = visibleCandidates();
  return items.find((item) => item.candidate_id === state.route.id) || items[0] || null;
}

function statusLabel(status) {
  return (
    {
      needs_review: t("queue"),
      changes_requested: t("changes"),
      approved: t("approved"),
      done: t("done"),
      blocked: t("blocked"),
    }[status] || status
  );
}

function statusClass(status) {
  return ["approved", "done"].includes(status) ? "ok" : status === "blocked" ? "bad" : "warn";
}

function render() {
  if (!state.data) return;
  state.lang = resolveLanguage();
  state.route = parseRoute();
  const candidate = selectedCandidate();
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.body.classList.toggle("mobile-detail-open", Boolean(candidate && state.route.id && isMobile()));
  app.innerHTML = `${renderSidebar()}<main class="main">${renderMobileBar()}<section class="content">${renderList()}${renderDetail(candidate)}</section></main>${state.route.view === "settings" ? renderSettings() : ""}`;
  bindEvents();
}

function renderSidebar() {
  const metrics = state.data.snapshot.metrics;
  return `<aside class="sidebar" id="appSidebar">
    <div class="brand">
      <div class="brand-icon" aria-hidden="true">PR</div>
      <div class="brand-copy"><strong>${esc(t("app"))}</strong><span>${esc(t("subtitle"))}</span></div>
      <button class="icon-button sidebar-toggle" data-collapse type="button" title="Toggle sidebar"><span class="panel-icon"></span></button>
    </div>
    <section class="attention"><span>${esc(t("needsAttention"))}</span><strong>${metrics.needs_review + metrics.changes_requested}</strong></section>
    <nav class="nav" aria-label="Workflow">
      ${navItem("queue", t("queue"), metrics.needs_review + metrics.changes_requested)}
      ${navItem("approved", t("approved"), metrics.approved)}
      ${navItem("done", t("done"), metrics.done)}
      ${navItem("blocked", t("blocked"), metrics.blocked)}
    </nav>
    <div class="sidebar-footer">
      ${state.data.demo ? `<span class="demo-label">${esc(t("demo"))}</span>` : ""}
      <button class="plain" data-route="settings" type="button">${esc(t("settings"))}</button>
    </div>
  </aside>`;
}

function navItem(view, label, count) {
  return `<button class="${state.route.view === view ? "active" : ""}" data-route="${view}" type="button"><span>${esc(label)}</span><small>${count}</small></button>`;
}

function renderMobileBar() {
  return `<div class="mobile-topbar">
    <button class="icon-button" data-open-sidebar type="button" aria-label="Open sidebar"><span class="panel-icon"></span></button>
    <strong>${esc(state.route.view === "settings" ? t("settings") : t(state.route.view))}</strong>
    <button class="icon-button" data-route="settings" type="button" aria-label="${esc(t("settings"))}">?</button>
  </div>`;
}

function renderList() {
  const items = visibleCandidates();
  return `<section class="list-panel">
    <header class="panel-header"><div><h1>${esc(t(state.route.view === "queue" ? "all" : state.route.view))}</h1><p>${items.length} ${esc(t("app"))}</p></div></header>
    <div class="intake">
      <label class="file-button"><input type="file" accept="image/*" data-local-file /><span>${esc(t("choosePhoto"))}</span></label>
      <div><strong>${esc(state.localFileName || t("selected"))}</strong><small>${esc(t("filenameOnly"))}</small></div>
      <button class="icon-button" data-copy-cli type="button" title="${esc(t("copy"))}">⌘</button>
    </div>
    <div class="row-list">${items.length ? items.map(renderRow).join("") : `<p class="empty">${esc(t("empty"))}</p>`}</div>
  </section>`;
}

function renderRow(candidate) {
  const active = candidate.candidate_id === state.route.id || (!state.route.id && selectedCandidate() === candidate);
  return `<button class="portrait-row ${active ? "active" : ""}" data-candidate="${esc(candidate.candidate_id)}" type="button">
    <img src="${esc(candidate.output_url)}" alt="" />
    <span class="row-copy"><strong>Review #${candidate.ref} · ${esc(candidate.title)}</strong><small>${esc(t(candidate.preset))} · ${candidate.strength}%</small><span class="chip ${statusClass(candidate.status)}">${esc(statusLabel(candidate.status))}</span></span>
  </button>`;
}

function renderDetail(candidate) {
  if (!candidate) return `<aside class="detail-panel"><p class="empty">${esc(t("empty"))}</p></aside>`;
  const strength = state.draftStrength ?? candidate.strength;
  return `<aside class="detail-panel">
    <div class="detail-top">
      <button class="back-to-list plain" data-back type="button">← ${esc(t("back"))}</button>
      <div class="detail-actions">
        <button class="primary" data-decision="approve" type="button">${esc(t("approve"))}</button>
        <button class="plain" data-decision="request_changes" type="button">${esc(t("changes"))}</button>
        <button class="danger" data-decision="block" type="button">${esc(t("block"))}</button>
      </div>
    </div>
    <div class="detail-scroll">
      <div class="detail-heading"><div><span class="eyebrow">Review #${candidate.ref}</span><h2>${esc(candidate.title)}</h2></div><span class="chip ${statusClass(candidate.status)}">${esc(statusLabel(candidate.status))}</span></div>
      ${state.pendingDecision?.candidate_id === candidate.candidate_id ? `<p class="pending-cr">ChangeRequest <strong>${esc(state.pendingDecision.change_request_id || "pending")}</strong> was submitted and is waiting for review. The candidate state has not been changed yet.</p>` : ""}
      <div class="segmented" role="group" aria-label="Comparison mode">
        ${segment("before", t("before"))}${segment("split", t("split"))}${segment("after", t("after"))}
      </div>
      ${renderCompare(candidate)}
      <section class="controls-band">
        <div class="control-head"><label for="strength">${esc(t("strength"))}</label><output>${strength}%</output></div>
        <input id="strength" type="range" min="0" max="100" step="1" value="${strength}" data-strength />
        <div class="facts">
          <span><small>${esc(t("preset"))}</small><strong>${esc(t(candidate.preset))}</strong></span>
          <span><small>${esc(t("faces"))}</small><strong>${candidate.face_count}</strong></span>
          ${checkFact("texture", candidate.checks.texture)}${checkFact("identity", candidate.checks.identity)}${checkFact("tone", candidate.checks.tone)}
        </div>
      </section>
      <section class="review-note"><label for="reviewNote">${esc(t("note"))}</label><textarea id="reviewNote" rows="3" placeholder="${esc(t("note"))}"></textarea></section>
      <section class="file-facts"><div><small>${esc(t("source"))}</small><strong>${esc(candidate.source_label)}</strong></div><div><small>${esc(t("output"))}</small><strong>${esc(candidate.output_label)}</strong></div></section>
    </div>
  </aside>`;
}

function segment(mode, label) {
  return `<button class="${state.compareMode === mode ? "active" : ""}" data-compare-mode="${mode}" type="button">${esc(label)}</button>`;
}

function renderCompare(candidate) {
  const mode = state.compareMode;
  const reveal = mode === "before" ? 0 : mode === "after" ? 100 : state.reveal;
  return `<figure class="compare" style="--reveal:${reveal}%">
    <img class="before-image" src="${esc(candidate.source_url)}" alt="${esc(t("before"))}" />
    <div class="after-mask"><img class="after-image" src="${esc(candidate.output_url)}" alt="${esc(t("after"))}" /></div>
    ${mode === "split" ? `<div class="divider"></div><input class="compare-range" type="range" min="0" max="100" value="${state.reveal}" aria-label="${esc(t("split"))}" data-reveal />` : ""}
    <figcaption><span>${esc(t("before"))}</span><span>${esc(t("after"))}</span></figcaption>
  </figure>`;
}

function checkFact(key, value) {
  return `<span><small>${esc(t(key))}</small><strong class="check-pass">${value === "pass" ? "✓ " : ""}${esc(t(value))}</strong></span>`;
}

function renderSettings() {
  const tab = state.settingsTab;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(t("settings"))}">
    <header><h2>${esc(t("settings"))}</h2><button class="icon-button" data-close-settings type="button" aria-label="${esc(t("close"))}">×</button></header>
    <nav class="modal-tabs">${settingsTab("guide")}${settingsTab("resources")}${settingsTab("privacy")}</nav>
    <div class="modal-body">${settingsPanel(tab)}</div>
  </section></div>`;
}

function settingsTab(tab) {
  return `<button class="${state.settingsTab === tab ? "active" : ""}" data-settings-tab="${tab}" type="button">${esc(t(tab))}</button>`;
}

function settingsPanel(tab) {
  if (tab === "resources")
    return "<dl><dt>Folder</dt><dd>kelly-portrait-retouch</dd><dt>Bases</dt><dd>jobs · candidates · settings</dd><dt>Images</dt><dd>Busabase Assets; Base rows store asset IDs</dd><dt>Schema</dt><dd>v1</dd></dl>";
  if (tab === "privacy")
    return "<dl><dt>Metadata</dt><dd>Stripped by default</dd><dt>External upload</dt><dd>Off by default</dd><dt>Overwrite</dt><dd>Explicit opt-in only</dd></dl>";
  return `<dl><dt>${esc(t("preset"))}</dt><dd>${esc(t("natural"))} · 35%</dd><dt>${esc(t("cli"))}</dt><dd><code>node scripts/retouch.mjs portrait.jpg --preset natural --strength 35</code></dd><dt>Policy</dt><dd>${esc(t("noOverwriting"))}</dd></dl>`;
}

function bindEvents() {
  app.querySelectorAll("[data-route]").forEach((button) =>
    button.addEventListener("click", () => {
      setSidebarOpen(false);
      routeTo(button.dataset.route);
    }),
  );
  app
    .querySelectorAll("[data-candidate]")
    .forEach((button) => button.addEventListener("click", () => routeTo(state.route.view, button.dataset.candidate)));
  app.querySelector("[data-open-sidebar]")?.addEventListener("click", () => setSidebarOpen(true));
  app
    .querySelector("[data-collapse]")
    ?.addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
  app.querySelector("[data-back]")?.addEventListener("click", () => routeTo(state.route.view));
  app.querySelectorAll("[data-compare-mode]").forEach((button) =>
    button.addEventListener("click", () => {
      state.compareMode = button.dataset.compareMode;
      render();
    }),
  );
  app.querySelector("[data-reveal]")?.addEventListener("input", (event) => {
    state.reveal = Number(event.target.value);
    event.target.closest(".compare").style.setProperty("--reveal", `${state.reveal}%`);
  });
  app.querySelector("[data-strength]")?.addEventListener("input", (event) => {
    state.draftStrength = Number(event.target.value);
    event.target.previousElementSibling.querySelector("output").textContent = `${state.draftStrength}%`;
  });
  app.querySelector("[data-local-file]")?.addEventListener("change", (event) => {
    state.localFileName = event.target.files?.[0]?.name || "";
    render();
  });
  app.querySelector("[data-copy-cli]")?.addEventListener("click", copyCli);
  app
    .querySelectorAll("[data-decision]")
    .forEach((button) => button.addEventListener("click", () => submitDecision(button.dataset.decision)));
  app.querySelectorAll("[data-settings-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      state.settingsTab = button.dataset.settingsTab;
      render();
    }),
  );
  app.querySelector("[data-close-settings]")?.addEventListener("click", () => routeTo("queue"));
}

async function copyCli() {
  const name = state.localFileName || "portrait.jpg";
  const command = `node scripts/retouch.mjs ${JSON.stringify(name)} --preset natural --strength 35 --compare ${JSON.stringify(name.replace(/\.[^.]+$/, "-proof.jpg"))}`;
  await navigator.clipboard.writeText(command).catch(() => null);
}

async function submitDecision(action) {
  if (state.busy) return;
  const candidate = selectedCandidate();
  const comment = app.querySelector("#reviewNote")?.value || "";
  state.busy = true;
  try {
    const provider = await getProvider();
    const result = await provider.submitDecision({
      candidate_id: candidate.candidate_id,
      action,
      comment,
      strength: state.draftStrength ?? candidate.strength,
    });
    state.draftStrength = null;
    state.pendingDecision = { candidate_id: candidate.candidate_id, ...result };
    render();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    state.busy = false;
  }
}

async function loadState() {
  const provider = await getProvider();
  state.data = await provider.getState();
  if (!state.data.demo && state.data.readiness?.runtime !== "ready") {
    const context = state.data.readiness?.safe_context || {};
    renderSetupRequired(
      new Error(`${context.error_code || "SETUP_REQUIRED"}: ${context.reason || "portrait workspace"}`),
      loadState,
    );
    return;
  }
  if (!state.data.demo && state.data.readiness?.onboarding !== "complete") {
    renderProductOnboarding(state.data, loadState);
    return;
  }
  closeConnectGate();
  render();
}

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).includes("SETUP_")) renderSetupRequired(error, boot);
    else throw error;
  }
}

scrim.addEventListener("click", () => setSidebarOpen(false));
window.addEventListener("hashchange", () => {
  state.draftStrength = null;
  render();
});
window.addEventListener("resize", () => {
  if (!isMobile()) setSidebarOpen(false);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (state.route.view === "settings") routeTo("queue");
    else setSidebarOpen(false);
  }
});

boot().catch((error) => {
  app.innerHTML = `<main class="fatal"><h1>Portrait Retouch</h1><p>${esc(error instanceof Error ? error.message : error)}</p></main>`;
});
