import { messages } from "./i18n/messages.js";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const state = {
  batch: null,
  bootstrap: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") ||
      localStorage.getItem("kelly-real-estate-intel-language") ||
      "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  saving: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-real-estate-intel.sidebarCollapsed";
const KIND_VIEWS = { signal: "signals", action: "actions", draft: "drafts" };
const VIEW_KINDS = { signals: "signal", actions: "action", drafts: "draft" };

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

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  render();
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.batch = data.batch;
  state.bootstrap = data;
  window.dispatchEvent(new CustomEvent("kelly-real-estate-intel:state", { detail: data }));
  applyDemoRoute();
  render();
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
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function allItems() {
  const b = state.batch || {};
  return [...(b.signals || []), ...(b.actions || []), ...(b.drafts || [])];
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

function itemLabel(item) {
  return item.title || item.channel || item.id;
}

function itemSummary(item) {
  return item.summary || item.effective_body || item.body || "";
}

function itemRow(view, item) {
  const active = state.route.view === view && state.route.id === item.id ? "active" : "";
  return `
    <a class="item-row ${active}" href="#/${view}/${encodeURIComponent(item.id)}">
      <span class="item-row-ref">#${item.ref}</span>
      <span class="item-row-main">
        <strong>${escapeHtml(itemLabel(item))}</strong>
        <span>${escapeHtml(itemSummary(item))}</span>
      </span>
      ${statusBadge(item.status)}
    </a>
  `;
}

/* ---------- Overview ---------- */

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.batch?.generated_at
    ? `${t("generated")} ${new Date(state.batch.generated_at).toLocaleString()}`
    : t("empty");
  if (!isConnected()) {
    els.content.innerHTML = `<div class="empty">${t("setupNeeded")}</div>`;
    return;
  }
  const b = state.batch;
  const topSignals = (b.signals || []).slice(0, 4);
  const readyActions = (b.actions || []).filter((item) => item.status === "approved").slice(0, 4);
  const actionsToShow = readyActions.length ? readyActions : (b.actions || []).slice(0, 4);
  els.content.innerHTML = `
    ${demoBanner()}
    <div class="metrics">
      <a class="metric" href="#/signals"><span>${t("signals")}</span><strong>${b.signals.length}</strong></a>
      <a class="metric" href="#/actions"><span>${t("actions")}</span><strong>${b.actions.length}</strong></a>
      <a class="metric" href="#/drafts"><span>${t("drafts")}</span><strong>${b.drafts.length}</strong></a>
      <div class="metric"><span>${t("buyer")}</span><strong class="muted">${escapeHtml(b.buyer || "")}</strong></div>
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("topSignals")}</h2>
        <div class="item-list">${topSignals.map((item) => itemRow("signals", item)).join("") || `<div class="empty">${t("empty")}</div>`}</div>
      </div>
      <div class="overview-panel">
        <h2>${t("readyActions")}</h2>
        <div class="item-list">${actionsToShow.map((item) => itemRow("actions", item)).join("") || `<div class="empty">${t("empty")}</div>`}</div>
      </div>
    </section>
  `;
}

/* ---------- Signals / Actions / Drafts list ---------- */

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

function renderList(view) {
  els.title.textContent = viewLabel(view);
  const items = filteredItems(view);
  const needs = items.filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${items.length} ${viewLabel(view).toLowerCase()} · ${needs} ${t("needsReview")}`;
  els.content.innerHTML = `
    ${demoBanner()}
    <div class="item-list">${items.map((item) => itemRow(view, item)).join("")}</div>
    ${items.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

/* ---------- Item detail + decision panel ---------- */

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

function decisionActions(kind) {
  const disabled = state.saving ? "disabled" : "";
  const buttons = [
    `<button type="button" class="primary" data-action="approve" ${disabled}>${t("approve")}</button>`,
    `<button type="button" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>`,
    `<button type="button" class="danger" data-action="block" ${disabled}>${t("block")}</button>`,
  ];
  if (kind === "draft") buttons.push(`<button type="button" data-action="revise" ${disabled}>${t("revise")}</button>`);
  return buttons.join("");
}

function renderDetail(view) {
  const kind = VIEW_KINDS[view];
  const item = findItem(view, state.route.id);
  if (!item) {
    renderList(view);
    return;
  }
  els.title.textContent = itemLabel(item);
  els.subtitle.textContent = `#${item.ref} · ${enumLabel(item.status)}`;
  const fields =
    kind === "signal"
      ? signalDetailFields(item)
      : kind === "action"
        ? actionDetailFields(item)
        : draftDetailFields(item);
  els.content.innerHTML = `
    ${demoBanner()}
    <section class="item-detail">
      <div class="item-list">${itemsForView(view)
        .map((entry) => itemRow(view, entry))
        .join("")}</div>
      <div class="item-panel">
        <a class="back-link" href="#/${view}">← ${t("back")}</a>
        <div class="item-panel-head">
          ${statusBadge(item.status)}
          ${riskBadges(item.risk)}
        </div>
        <h2>${escapeHtml(itemLabel(item))}</h2>
        ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
        ${fields}
        <label class="field"><span>${t("reviewNote")}</span><textarea data-review-note>${escapeHtml(item.decision?.comment || "")}</textarea></label>
        <div class="actions-bar" data-decision-actions>${decisionActions(kind)}</div>
        <div class="decision-feedback" data-decision-feedback></div>
      </div>
    </section>
  `;
  bindDecisionForm(view, kind, item);
}

function bindDecisionForm(view, kind, item) {
  const panel = els.content.querySelector("[data-decision-actions]");
  if (!panel) return;
  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const note = els.content.querySelector("[data-review-note]")?.value || "";
      const editedBody = els.content.querySelector("[data-edited-body]")?.value || "";
      const feedback = els.content.querySelector("[data-decision-feedback]");
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
        location.hash = `#/${view}/${encodeURIComponent(item.id)}`;
        const again = els.content.querySelector("[data-decision-feedback]");
        if (again) {
          again.textContent = t("decisionSaved");
          again.className = "decision-feedback positive";
        }
      } catch (error) {
        state.saving = false;
        render();
        const again = els.content.querySelector("[data-decision-feedback]");
        if (again) {
          again.textContent = error instanceof Error ? error.message : String(error);
          again.className = "decision-feedback negative";
        } else if (feedback) {
          feedback.textContent = error instanceof Error ? error.message : String(error);
          feedback.className = "decision-feedback negative";
        }
      } finally {
        state.saving = false;
      }
    });
  });
}

/* ---------- Sources ---------- */

function renderSources() {
  els.title.textContent = t("sources");
  const sources = state.batch?.sources || [];
  els.subtitle.textContent = `${sources.length} ${t("sources").toLowerCase()}`;
  els.content.innerHTML = `
    ${demoBanner()}
    <div class="source-list">
      ${
        sources
          .map(
            (source) => `
        <div class="source-row">
          <div class="source-row-head">
            <strong>${escapeHtml(source.label)}</strong>
            ${statusBadge(source.status)}
          </div>
          <p class="muted">${escapeHtml(source.coverage || "")}</p>
          <span class="muted">${t("freshness")}: ${escapeHtml(source.freshness || "")}</span>
        </div>
      `,
          )
          .join("") || `<div class="empty">${t("empty")}</div>`
      }
    </div>
  `;
}

/* ---------- Settings ---------- */

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = state.batch?.vertical || "";
  const b = state.batch || {};
  els.content.innerHTML = `
    <div class="settings-grid">
      <section class="item-panel">
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
  const { view, id } = state.route;
  if ((view === "signals" || view === "actions" || view === "drafts") && id) renderDetail(view);
  else if (view === "signals" || view === "actions" || view === "drafts") renderList(view);
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
  localStorage.setItem("kelly-real-estate-intel-language", state.lang);
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
    els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

syncResponsiveShell();
boot();
