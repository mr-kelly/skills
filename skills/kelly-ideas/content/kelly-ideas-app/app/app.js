import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { DOC_KINDS, NORMALIZE_ROW_BY_KEY } from "./js/ideas-model.js?v=0.1.0";
import { renderDocumentView, renderIdeaDetail, renderIdeas, renderSettings } from "./js/ideas-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

export const state = {
  snapshot: null,
  settings: null,
  // Client-side pager for the Bases that have their own browsed list
  // (ideas, questions). records.list only exposes a forward keyset cursor, so
  // pageCursors[key] caches every cursor learned so far (index i = the
  // cursor needed to fetch page i+1); jumping to a page beyond what's cached
  // walks forward through the intermediate pages once to learn their
  // cursors (see goToPage), and every page visited is then a single direct
  // fetch on every later visit, including going back. A Base with no entry
  // here isn't paginated (the active provider doesn't page it, or it fit on
  // one page) -- that's what hides the pager; see pagerControl().
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  route: parseRoute(),
  query: "",
  ideaFilter: "all",
  selectedIdeaId: "",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-ideas-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-ideas.sidebarCollapsed";

export const els = {
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
  ideaCount: document.querySelector("#count-ideas"),
  needsAnswerCount: document.querySelector("#count-needs-answer"),
  readyCount: document.querySelector("#count-ready"),
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

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: decodeURIComponent(parts[1] || ""), tab: parts[2] || "" };
}

function setRoute() {
  state.route = parseRoute();
  // Opening an idea makes it the subject of the sidebar's BRD/MRD/PRD entries.
  if (state.route.view === "ideas" && state.route.id) state.selectedIdeaId = state.route.id;
  state.notice = "";
  render();
}

export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  // Seed each paginated Base's cursor cache with page 1 (no cursor) and the
  // page-2 cursor getState() already learned while fetching page 1, so
  // clicking straight to page 2 costs one fetch instead of two.
  state.pageCursors = {};
  state.currentPage = {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  window.dispatchEvent(new CustomEvent("kelly-ideas:state", { detail: data }));
  applyDemoRoute();
  render();
}

// The configured page size for a paginated Base, straight from config.js --
// the one place readLimit is declared -- so the pager's page-count math can
// never drift from what the provider actually requests per page.
function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 100;
}

// Maps a paginated Base to the metrics field carrying its REAL total (from
// records.count, not "however many rows happen to be loaded" -- see
// busabase-provider.js#countRecords). Total pages is derived from that, not
// from state.snapshot[key].length, which is capped at one page's worth.
const TOTAL_COUNT_KEY = { ideas: "total" };

export function pageCount(key) {
  if (!state.pageCursors[key]) return 1;
  const total = state.snapshot?.counts?.[TOTAL_COUNT_KEY[key]] ?? 0;
  return Math.max(1, Math.ceil(total / pageSize(key)));
}

// Replaces the displayed page for `key` -- never appends, so state.snapshot[key]
// always holds exactly one page's rows and every deal/contact-derived figure
// on screen (search, the row table, metricCards()) is scoped to that one
// page once a Base crosses a page boundary. Called only from a page-number
// or prev/next click, so a fetch is always the direct result of a user
// action, matching the same rule readPage's own comment states.
export async function goToPage(key, targetPage) {
  if (state.pageLoading[key]) return;
  const cursors = state.pageCursors[key];
  if (!cursors) return; // Base isn't paginated -- provider doesn't page it, or the active provider (e.g. the static demo provider) never seeded a cursor cache.
  const page = Math.min(Math.max(1, targetPage), pageCount(key));
  if (page === state.currentPage[key]) return;
  state.pageLoading[key] = true;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const normalize = NORMALIZE_ROW_BY_KEY[key];
    // Walk forward until this page's cursor is known. Each step here fetches
    // an intermediate page only to learn its nextCursor -- its rows are
    // thrown away -- because records.list's keyset cursor has no "skip N
    // pages" equivalent; a page visited this way is cached afterward, so
    // this cost is paid at most once per page, ever, including on revisits.
    while (cursors.length < page) {
      const { nextCursor } = await provider.fetchPage(key, cursors[cursors.length - 1]);
      cursors.push(nextCursor);
    }
    const { rows, nextCursor } = await provider.fetchPage(key, cursors[page - 1]);
    // Same per-row normalization buildSnapshot() ran on page 1 -- without
    // it, a later page keeps raw field shapes (e.g. tags as a JSON string
    // instead of an array) and crashes the first render that touches it.
    state.snapshot[key] = normalize ? rows.map(normalize) : rows;
    if (cursors.length === page) cursors.push(nextCursor);
    state.currentPage[key] = page;
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "needs-answer"
      ? "#/ideas/idea-vague/questions"
      : scenario === "ready"
        ? "#/ideas/idea-email/prd"
        : scenario === "parked"
          ? "#/ideas/idea-parked"
          : "#/overview";
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

export function ideas() {
  return state.snapshot?.ideas || [];
}

export function ideaById(recordId) {
  return ideas().find((item) => item.record_id === recordId) || null;
}

function renderShell() {
  applyI18n();
  const counts = state.snapshot?.counts || {};
  const needsAnswer = counts.needsAnswer ?? 0;
  const readyForAgent = counts.readyForAgent ?? 0;
  // Prefer the real total (records.count, unaffected by which page is loaded)
  // over the in-memory length, which is only correct while everything fits on
  // one page. Falls back for providers that never populate it (demo, or a
  // permission-denied records.count call).
  const total = counts.total ?? ideas().length;
  els.syncStatus.textContent = total ? `${total} ${t("ideasUnit")}` : t("empty");
  if (els.needsAnswerCount) els.needsAnswerCount.textContent = needsAnswer;
  if (els.readyCount) els.readyCount.textContent = readyForAgent;
  if (els.ideaCount) els.ideaCount.textContent = total;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = needsAnswer ? `${needsAnswer} ${t("needAnswer")}` : `${total} ${t("ideasUnit")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "ideas") return t("ideasTitle");
  if (DOC_KINDS.includes(view)) return view.toUpperCase();
  if (view === "settings") return t("settings");
  return t("overview");
}

export function stageBadge(stage) {
  return `<span class="stage-badge stage-${escapeHtml(stage)}">${escapeHtml(t(`stage_${stage}`))}</span>`;
}

// Task language, not data-model language: the badge says what the operator can
// do about this idea, which is what the human attention panel is for.
export function attentionBadge(idea) {
  const key = idea.attention;
  return `<span class="attention-badge attention-${escapeHtml(key)}">${escapeHtml(t(`attention_${key}`))}</span>`;
}

export function clarityBar(idea) {
  const value = Math.max(0, Math.min(100, Number(idea.clarity) || 0));
  return `
    <div class="clarity" title="${escapeHtml(t("clarityHint"))}">
      <span class="clarity-label">${escapeHtml(t("clarity"))}</span>
      <span class="clarity-track"><span class="clarity-fill" style="width:${value}%"></span></span>
      <span class="clarity-value">${value}</span>
    </div>
  `;
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function warnings() {
  const items = state.snapshot?.warnings || [];
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

export function metricCards() {
  const counts = state.snapshot?.counts || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("metricTotal")}</span><strong>${counts.total ?? ideas().length}</strong></div>
      <div class="metric"><span>${t("metricNeedsAnswer")}</span><strong>${counts.needsAnswer ?? 0}</strong></div>
      <div class="metric"><span>${t("metricReady")}</span><strong>${counts.readyForAgent ?? 0}</strong></div>
      <div class="metric"><span>${t("metricParked")}</span><strong>${counts.parked ?? 0}</strong></div>
    </div>
  `;
}

// Workflow filters are attention states, not data states -- "needs_answer"
// is something the operator can act on, "打磨中" is not.
export function filteredIdeas() {
  const query = state.query.trim().toLowerCase();
  return ideas().filter((item) => {
    if (state.ideaFilter !== "all" && item.attention !== state.ideaFilter) return false;
    if (!query) return true;
    return [item.title, item.one_liner, item.who, item.problem, item.source, ...(item.tags || [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

// The first screen answers "what do I need to do?" -- per the UI contract it
// leads with the ideas waiting on the operator, not with a data dashboard.
function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = t("overviewSubtitle");
  const all = ideas();
  const needsAnswer = all.filter((item) => item.attention === "needs_answer");
  const ready = all.filter((item) => item.attention === "ready_for_agent");
  const parked = all.filter((item) => item.attention === "parked");

  const ideaLink = (idea, meta) => `
    <a class="due-row" href="#/ideas/${encodeURIComponent(idea.record_id)}">
      <span>
        <strong>${escapeHtml(idea.title)}</strong>
        <small>${escapeHtml(idea.one_liner || t("noOneLiner"))}</small>
      </span>
      <span class="due-meta">${stageBadge(idea.stage)}<small>${escapeHtml(meta)}</small></span>
    </a>
  `;

  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("panelNeedsAnswer")}</h2>
        ${
          needsAnswer
            .map((idea) =>
              ideaLink(
                idea,
                idea.open_questions
                  ? t("openQuestionsCount").replace("{count}", String(idea.open_questions))
                  : t("missingFields"),
              ),
            )
            .join("") || `<div class="empty-inline">${t("nothingToAnswer")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("panelReady")}</h2>
        ${
          ready
            .map((idea) =>
              ideaLink(idea, t("readyFor").replace("{stage}", t(`stage_${idea.advance.target || idea.stage}`))),
            )
            .join("") || `<div class="empty-inline">${t("nothingReady")}</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("panelParked")}</h2>
        ${
          parked.map((idea) => ideaLink(idea, t("attention_parked"))).join("") ||
          `<div class="empty-inline">${t("nothingParked")}</div>`
        }
      </div>
    </section>
  `;
}

export function render() {
  renderShell();
  if (state.route.view === "ideas" && state.route.id) renderIdeaDetail();
  else if (state.route.view === "ideas") renderIdeas();
  else if (DOC_KINDS.includes(state.route.view)) renderDocumentView(state.route.view);
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

// A numbered pager: Prev / page numbers (every page up to 7 total, else
// windowed to first, last, and current ±1 with "…" gaps) / Next. Rendered
// only for a Base state.pageCursors actually tracks (see goToPage) and only
// once it has more than one page -- a fully-loaded (or non-paginating, e.g.
// demo) list shows nothing here.
export function pagerControl(key) {
  if (!state.pageCursors[key]) return "";
  const total = pageCount(key);
  if (total <= 1) return "";
  const current = state.currentPage[key] || 1;
  const loading = Boolean(state.pageLoading[key]);
  const pageButton = (page) => `
    <button type="button" class="pager-page ${page === current ? "active" : ""}" data-goto-page="${key}:${page}" ${loading || page === current ? "disabled" : ""}>${page}</button>
  `;
  // Below the ellipsis threshold, show every page -- windowing to just the
  // current page's neighbors would otherwise hide a page number that's both
  // reachable and in range (e.g. landing on page 4 of 4 must still offer a
  // button back to page 2, not just Prev/Next).
  const pageWindow =
    total <= 7
      ? Array.from({ length: total }, (_, index) => index + 1)
      : [...new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))].sort(
          (a, b) => a - b,
        );
  const sorted = pageWindow;
  const items = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) items.push(`<span class="pager-ellipsis">…</span>`);
    items.push(pageButton(page));
    previous = page;
  }
  return `
    <div class="pager">
      <button type="button" class="pager-nav" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      ${items.join("")}
      <button type="button" class="pager-nav" data-goto-page="${key}:${current + 1}" ${loading || current >= total ? "disabled" : ""}>${t("nextPage")}</button>
      <span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", total)}</span>
    </div>
  `;
}

export function escapeHtml(value) {
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

els.content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-goto-page]");
  if (!button) return;
  const [key, page] = button.dataset.gotoPage.split(":");
  goToPage(key, Number(page));
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
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-ideas-language", state.lang);
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
