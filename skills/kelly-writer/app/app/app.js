import { messages } from "./i18n/messages.js";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  draftFilter: "all",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-writer-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-writer.sidebarCollapsed";
const CHANNELS = ["official_blog", "xiaohongshu", "wechat", "newsletter", "linkedin", "x"];

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
  reviewCount: document.querySelector("#count-review"),
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
  return { view: parts[0] || "overview", id: parts[1] || "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  render();
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("kelly-writer:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = scenario === "drafts" ? "#/drafts" : scenario === "settings" ? "#/settings" : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
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
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function drafts() {
  return state.snapshot?.drafts || [];
}

function channels() {
  return state.snapshot?.channels || [];
}

function draftById(id) {
  return drafts().find((entry) => entry.draft_id === id) || null;
}

function renderShell() {
  applyI18n();
  const reviewCount = drafts().filter((item) => item.status === "needs_review").length;
  const approvedCount = drafts().filter((item) => item.status === "approved").length;
  const blockedCount = drafts().filter((item) => item.status === "blocked").length;
  const source = state.settings?.snapshot?.source || "";
  els.syncStatus.textContent = drafts().length ? `${drafts().length} ${t("drafts")}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount;
  if (els.blockedCount) els.blockedCount.textContent = blockedCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount ? `${reviewCount} ${t("needsReview")}` : source;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "drafts") return t("drafts");
  if (view === "settings") return t("settings");
  return t("overview");
}

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function channelBadge(channel) {
  if (!channel) return "";
  return `<span class="badge">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

function lockBanner() {
  if (!state.settings?.lock?.locked) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("needsReview")}</span><strong>${metrics.needs_review || 0}</strong></div>
      <div class="metric"><span>${t("approved")}</span><strong>${metrics.approved || 0}</strong></div>
      <div class="metric"><span>${t("done")}</span><strong>${metrics.done || 0}</strong></div>
      <div class="metric"><span>${t("blocked")}</span><strong>${metrics.blocked || 0}</strong></div>
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = t("overviewSubtitle");
  els.content.innerHTML = `
    ${metricCards()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("channelBreakdown")}</h2>
        ${
          channels()
            .map(
              (entry) => `
          <div class="activity-row channel-row">
            <span class="badge">${escapeHtml(enumLabel(entry.channel, "channel"))}</span>
            <span class="muted">${escapeHtml(entry.channel)}</span>
            <span class="num">${entry.count}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("needsReview")}</h2>
        ${
          drafts()
            .filter((item) => item.status === "needs_review")
            .slice(0, 6)
            .map(
              (item) => `
          <a class="due-row" href="#/drafts">
            <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(enumLabel(item.channel, "channel"))}</small></span>
            <span class="due-meta">${statusBadge(item.status)}</span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noItems")}</div>`
        }
      </div>
    </section>
  `;
}

function draftFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count = value === "all" ? drafts().length : drafts().filter((item) => item.status === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.draftFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

function filteredDrafts() {
  const query = state.query.trim().toLowerCase();
  return drafts().filter((item) => {
    if (state.draftFilter !== "all" && item.status !== state.draftFilter) return false;
    if (!query) return true;
    return [item.title, item.summary, item.body, item.channel, item.hook]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderDrafts() {
  els.title.textContent = t("drafts");
  const list = filteredDrafts();
  const reviewCount = drafts().filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  const locked = Boolean(state.settings?.lock?.locked);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${draftFilters()}
    <div class="queue">
      ${
        list
          .map((item) => {
            const edits = state.edits[item.draft_id] || {};
            const title = edits.title ?? item.title ?? "";
            const body = edits.body ?? item.body ?? "";
            const note = edits.note ?? item.decision_note ?? "";
            return `
          <article class="queue-card status-${escapeHtml(item.status)}" data-item="${escapeHtml(item.draft_id)}">
            <header class="queue-head">
              <span class="queue-ref">#${item.ref}</span>
              ${channelBadge(item.channel)}
              ${statusBadge(item.status)}
              ${item.format ? `<span class="badge">${escapeHtml(item.format)}</span>` : ""}
            </header>
            <div class="queue-subject strong">${escapeHtml(title)}</div>
            <label class="queue-label">${t("title")}</label>
            <input class="queue-title" data-field="title" value="${escapeAttr(title)}" ${disabled}>
            <label class="queue-label">${t("draft")}</label>
            <textarea class="queue-draft" data-field="body" rows="9" ${disabled}>${escapeHtml(body)}</textarea>
            <div class="queue-meta">
              ${item.cta ? `<span class="muted">${escapeHtml(t("cta"))}: ${escapeHtml(item.cta)}</span>` : ""}
              ${item.hashtags?.length ? `<span class="muted">${item.hashtags.map(escapeHtml).join(" ")}</span>` : ""}
            </div>
            ${item.media_brief ? `<p class="queue-reason"><span class="muted">${escapeHtml(t("mediaBrief"))}:</span> ${escapeHtml(item.media_brief)}</p>` : ""}
            ${item.title_options?.length ? `<p class="queue-reason"><span class="muted">${escapeHtml(t("titleOptions"))}:</span> ${item.title_options.map(escapeHtml).join(" · ")}</p>` : ""}
            <label class="queue-label">${t("reviewNote")}</label>
            <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${item.decided_at ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(item.status, "action"))} · ${escapeHtml(new Date(item.decided_at).toLocaleString())}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noItems")}</div>`
      }
    </div>
  `;
  bindDraftEvents();
}

function bindDraftEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.draftFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card input, .queue-card textarea").forEach((field) => {
    field.addEventListener("input", () => {
      const id = field.closest(".queue-card").dataset.item;
      const key = field.dataset.field;
      state.edits[id] = { ...state.edits[id], [key]: field.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.item, button.dataset.action, card);
    });
  });
}

async function submitDecision(draftId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const title = card.querySelector('[data-field="title"]')?.value ?? "";
  const body = card.querySelector('[data-field="body"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  try {
    const provider = await getProvider();
    await provider.applyDecision(draftId, { action, comment: note, title, body });
  } catch (error) {
    state.notice = error.message || "Decision failed";
    render();
    return;
  }
  delete state.edits[draftId];
  state.notice = t("saved");
  await loadState();
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("settingsSubtitle");
  const summary = state.settings?.config_summary || {};
  const brand = summary.brand || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("brand")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(brand.name || "")}</dd>
          <dt>${t("audience")}</dt><dd>${escapeHtml(summary.audience || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(brand.voice || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("channels")}</h2>
        ${
          Object.keys(summary.channels || {})
            .map(
              (channel) => `
          <div class="settings-channel">
            <strong>${escapeHtml(enumLabel(channel, "channel"))}</strong>
            <span>${escapeHtml(summary.channels[channel]?.language || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("exportStep")}</h2>
        <p class="muted">${t("exportStepBody")}</p>
        <pre class="patch">node scripts/generate_batch.mjs --source &lt;path-or-text&gt; --apply
node scripts/export_decisions.mjs --apply</pre>
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "drafts") renderDrafts();
  else if (state.route.view === "settings") renderSettings();
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, " ");
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
  localStorage.setItem("kelly-writer-language", state.lang);
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
