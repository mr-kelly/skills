import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("legal-app-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  edits: { note: {}, draft: {} },
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "legal-app.sidebarCollapsed";
const AUTO_REFRESH_MS = 15_000;
const STATUS_ROUTES = new Set(["approved", "done", "blocked"]);

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
  countNeeds: document.querySelector("#count-needs"),
  countReady: document.querySelector("#count-ready"),
  countBlocked: document.querySelector("#count-blocked"),
  language: document.querySelector("#language"),
};

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    return;
  }
  setMobileSidebarOpen(false);
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
}

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "review"
      ? "#/review"
      : scenario === "items"
        ? "#/items"
        : scenario === "checks"
          ? "#/checks"
          : scenario === "entities"
            ? "#/entities"
            : scenario === "detail"
              ? `#/items/${encodeURIComponent(items()[0]?.id || "")}`
              : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  render();
}

function shouldSkipAutoRefresh() {
  const active = document.activeElement;
  if (!active) return false;
  return active.matches("textarea, input:not([type='search']), select");
}

function scheduleAutoRefresh() {
  window.setInterval(() => {
    if (shouldSkipAutoRefresh()) return;
    loadState().catch(() => {});
  }, AUTO_REFRESH_MS);
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  if (els.search) els.search.placeholder = t("search");
  if (els.refresh) els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.language) {
    els.language.value = state.lang;
    const labels =
      activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
    for (const option of els.language.options) option.textContent = labels[option.value] || option.textContent;
  }
}

function items() {
  return (state.snapshot?.items || []).map(effectiveItem);
}

function entities() {
  return state.snapshot?.entities || [];
}

function checks() {
  return state.snapshot?.checks || [];
}

function decisions() {
  return state.settings?.decisions?.decisions || {};
}

function effectiveItem(item) {
  const decision = decisions()[item.id];
  if (!decision) return item;
  const statusByAction = {
    approve: "approved",
    request_changes: "changes_requested",
    block: "blocked",
    revise: "needs_review",
  };
  return {
    ...item,
    status: statusByAction[decision.action] || item.status,
    review_note: decision.comment || item.review_note,
    draft: typeof decision.draft === "string" ? decision.draft : item.draft,
    decided_at: decision.decided_at || item.decided_at,
  };
}

function filteredItems(status) {
  const q = state.query.trim().toLowerCase();
  return items().filter((item) => {
    if (status && item.status !== status) return false;
    if (!q) return true;
    return [item.title, item.summary, item.category, item.owner, item.body, item.recommendation]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

function itemsForRoute() {
  if (state.route.view === "review") return filteredItems("needs_review");
  if (STATUS_ROUTES.has(state.route.view)) return filteredItems(state.route.view);
  return filteredItems();
}

function renderShell() {
  applyI18n();
  const all = items();
  const needs = all.filter((item) => item.status === "needs_review").length;
  const ready = all.filter((item) => item.status === "approved" || item.status === "done").length;
  const blocked = all.filter((item) => item.status === "blocked").length;
  if (els.countNeeds) els.countNeeds.textContent = needs;
  if (els.countReady) els.countReady.textContent = ready;
  if (els.countBlocked) els.countBlocked.textContent = blocked;
  if (els.syncStatus)
    els.syncStatus.textContent = state.snapshot
      ? `${all.length} ${t("allItems")} · ${checks().length} ${t("checks").toLowerCase()}`
      : t("empty");
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta)
    els.mobileViewMeta.textContent = needs ? `${needs} ${t("needsReview")}` : `${all.length} ${t("allItems")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "review") return t("needsReview");
  if (view === "approved") return t("approved");
  if (view === "done") return t("done");
  if (view === "blocked") return t("blocked");
  if (view === "items") return t("allItems");
  if (view === "checks") return t("checks");
  if (view === "entities") return t("entities");
  if (view === "settings") return t("settings");
  return t("overview");
}

function render() {
  renderShell();
  document.body.classList.toggle("route-detail", Boolean(state.route.id));
  if (!state.snapshot) {
    els.content.innerHTML = `<div class="empty">${escapeHtml(t("empty"))}</div>`;
    return;
  }
  if (state.route.view === "review" || STATUS_ROUTES.has(state.route.view)) renderReview();
  else if (state.route.view === "items") renderItems();
  else if (state.route.view === "checks") renderChecks();
  else if (state.route.view === "entities") renderEntities();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

function lockBanner() {
  if (!state.settings?.lock) return "";
  return `<div class="lock-banner">${escapeHtml(t("lockActive"))}${state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : ""}</div>`;
}

function renderOverview() {
  const metrics = state.snapshot.metrics || {};
  const review = filteredItems("needs_review").slice(0, 5);
  els.title.textContent = state.snapshot.workspace?.title || t("appTitle");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || t("appSubtitle");
  els.content.innerHTML = `
    ${lockBanner()}
    <div class="overview-grid">
      ${metricCard(t("needsReview"), metrics.needs_review || 0)}
      ${metricCard(t("approved"), metrics.approved || 0)}
      ${metricCard(t("done"), metrics.done || 0)}
      ${metricCard(t("blocked"), metrics.blocked || 0)}
    </div>
    <section class="panel">
      <div class="panel-head"><h2>${escapeHtml(t("review"))}</h2><a href="#/review">${escapeHtml(t("allItems"))}</a></div>
      <div class="list compact">${review.map(rowHtml).join("") || emptyText()}</div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>${escapeHtml(t("activity"))}</h2><span>${escapeHtml(t("generated"))}: ${escapeHtml(dateTime(state.snapshot.generated_at))}</span></div>
      <div class="activity-list">${(state.snapshot.activity_log || [])
        .slice(-5)
        .map((entry) => `<div><b>${escapeHtml(entry.action)}</b><span>${escapeHtml(entry.detail || "")}</span></div>`)
        .join("")}</div>
    </section>`;
}

function metricCard(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderReview() {
  els.title.textContent = viewLabel(state.route.view);
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  const list = itemsForRoute();
  const selected = itemById(state.route.id) || list[0] || items()[0];
  els.content.innerHTML = splitLayout(list, selected);
}

function renderItems() {
  els.title.textContent = t("items");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  const list = filteredItems();
  const selected = itemById(state.route.id) || list[0];
  els.content.innerHTML = splitLayout(list, selected);
}

function splitLayout(list, selected) {
  return `
    ${lockBanner()}
    <div class="split">
      <section class="list-panel">
        <div class="list-head"><strong>${list.length} ${escapeHtml(t("allItems"))}</strong></div>
        <div class="list">${list.map(rowHtml).join("") || emptyText()}</div>
      </section>
      <aside class="detail-panel">${selected ? detailHtml(selected) : `<div class="empty">${escapeHtml(t("noSelection"))}</div>`}</aside>
    </div>`;
}

function rowHtml(item) {
  const base = state.route.view === "review" || STATUS_ROUTES.has(state.route.view) ? state.route.view : "items";
  const href = `#/${base}/${encodeURIComponent(item.id)}`;
  return `<a class="row ${state.route.id === item.id ? "active" : ""}" href="${href}">
    <div class="row-top"><strong>${escapeHtml(item.ref || item.title)}</strong><span class="status ${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span></div>
    <div class="row-title">${escapeHtml(item.title)}</div>
    <p>${escapeHtml(item.summary || "")}</p>
    <div class="badges">${badge(item.category)}${(item.risk || []).map(badge).join("")}</div>
  </a>`;
}

function detailHtml(item) {
  const noteValue = state.edits.note[item.id] ?? item.review_note ?? "";
  const draftValue = state.edits.draft[item.id] ?? item.draft ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  return `
    <div class="detail-actions">
      <a class="back-link" href="#/${state.route.view || "items"}">← ${escapeHtml(viewLabel(state.route.view))}</a>
      <button type="button" data-action="approve" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("approve"))}" ${disabled}>${escapeHtml(t("approve"))}</button>
      <button type="button" data-action="request_changes" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("requestChanges"))}" ${disabled}>${escapeHtml(t("requestChanges"))}</button>
      <button type="button" data-action="block" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("block"))}" ${disabled}>${escapeHtml(t("block"))}</button>
    </div>
    <article class="detail">
      <div class="detail-kicker">${escapeHtml(item.ref || "")} · ${escapeHtml(statusLabel(item.status))}</div>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="summary">${escapeHtml(item.summary || "")}</p>
      <dl class="meta">
        <div><dt>${escapeHtml(t("owner"))}</dt><dd>${escapeHtml(item.owner || "")}</dd></div>
        <div><dt>${escapeHtml(t("category"))}</dt><dd>${escapeHtml(item.category || "")}</dd></div>
        <div><dt>${escapeHtml(t("risk"))}</dt><dd>${escapeHtml((item.risk || []).join(", "))}</dd></div>
      </dl>
      ${item.body ? `<section><h3>Context</h3><p>${escapeHtml(item.body)}</p></section>` : ""}
      ${item.recommendation ? `<section><h3>${escapeHtml(t("recommendation"))}</h3><p>${escapeHtml(item.recommendation)}</p></section>` : ""}
      ${(item.evidence || []).length ? `<section><h3>${escapeHtml(t("evidence"))}</h3><ul>${item.evidence.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>` : ""}
      <label class="field"><span>${escapeHtml(t("editableDraft"))}</span><textarea data-draft="${escapeAttr(item.id)}">${escapeHtml(draftValue)}</textarea></label>
      <label class="field"><span>${escapeHtml(t("reviewNote"))}</span><textarea data-note="${escapeAttr(item.id)}">${escapeHtml(noteValue)}</textarea></label>
      <button class="secondary" type="button" data-action="revise" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("saveRevision"))}" ${disabled}>${escapeHtml(t("saveRevision"))}</button>
    </article>`;
}

function renderChecks() {
  els.title.textContent = t("checks");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  els.content.innerHTML = `<section class="panel checks">${
    checks()
      .map(
        (check) =>
          `<div class="check ${escapeHtml(check.status)}"><strong>${escapeHtml(check.label)}</strong><span>${escapeHtml(t(check.status))}</span><p>${escapeHtml(check.detail || "")}</p></div>`,
      )
      .join("") || emptyText()
  }</section>`;
}

function renderEntities() {
  els.title.textContent = t("entities");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  els.content.innerHTML = `<section class="entity-grid">${
    entities()
      .map(
        (entity) =>
          `<article class="entity"><div class="entity-meta">${escapeHtml(entity.meta || "")}</div><h2>${escapeHtml(entity.title)}</h2><p>${escapeHtml(entity.summary || "")}</p><div class="badges">${(entity.tags || []).map(badge).join("")}</div></article>`,
      )
      .join("") || emptyText()
  }</section>`;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  const config = state.settings?.config_summary || {};
  els.content.innerHTML = `
    <section class="panel settings">
      <h2>${escapeHtml(t("config"))}</h2>
      ${jsonBlock(config)}
    </section>
    <section class="panel settings">
      <h2>${escapeHtml(t("onboarding"))}</h2>
      ${jsonBlock(state.settings?.onboarding || {})}
    </section>
    <section class="panel settings">
      <h2>${escapeHtml(t("executionReport"))}</h2>
      ${jsonBlock(state.settings?.execution_report || {})}
    </section>`;
}

function itemById(id) {
  return items().find((item) => item.id === id);
}

function statusLabel(status) {
  const labels = {
    needs_review: t("needsReview"),
    changes_requested: t("changesRequested"),
    approved: t("approved"),
    done: t("done"),
    blocked: t("blocked"),
  };
  return labels[status] || status;
}

function badge(value) {
  return value ? `<span class="badge">${escapeHtml(value)}</span>` : "";
}

function emptyText() {
  return `<div class="empty">${escapeHtml(t("empty"))}</div>`;
}

function jsonBlock(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function submitDecision(id, action) {
  const payload = {
    id,
    action,
    comment: document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.value || "",
    draft: document.querySelector(`[data-draft="${CSS.escape(id)}"]`)?.value || "",
  };
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Decision failed: ${res.status}`);
  }
  await loadState();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  render();
});

els.search?.addEventListener("input", (event) => {
  state.query = event.target.value || "";
  render();
});

els.refresh?.addEventListener("click", loadState);
els.mobileRefresh?.addEventListener("click", loadState);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.language?.addEventListener("change", (event) => {
  state.lang = normalizeLang(event.target.value);
  localStorage.setItem("legal-app-language", state.lang);
  render();
});

document.addEventListener("input", (event) => {
  const draftId = event.target?.dataset?.draft;
  const noteId = event.target?.dataset?.note;
  if (draftId) state.edits.draft[draftId] = event.target.value;
  if (noteId) state.edits.note[noteId] = event.target.value;
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action][data-id]");
  if (!button) return;
  event.preventDefault();
  button.disabled = true;
  try {
    await submitDecision(button.dataset.id, button.dataset.action);
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

window.addEventListener("resize", syncResponsiveShell);
syncResponsiveShell();
scheduleAutoRefresh();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
