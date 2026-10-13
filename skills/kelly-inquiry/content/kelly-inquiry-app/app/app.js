import { messages } from "./i18n/messages.js";
import { renderRecordView, renderSettings, submitDecision } from "./js/commerce-views.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  FUNNEL_STAGES,
  isFollowUpOverdue as isFollowUpOverdueModel,
  oldestUnanswered as oldestUnansweredModel,
  staleInquiries,
  unansweredNew as unansweredNewModel,
} from "./js/inquiry-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const FEATURED_DEMO_INQUIRY = "wa-mueller-led-panels";
const PENDING_STATUSES = ["needs_review", "changes_requested", "approved"];

// Where a record opens, per view — see js/config.js `ui.detail_modes` for the
// business reasoning. `/record` always opens the full page; `?peek=` drives
// drawer/split. On a phone every mode becomes a page (base-ui.css handles it).
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

export const state = {
  pageCursors: {},
  currentPage: {},
  pageLoading: {},
  totals: {},
  snapshot: null,
  settings: null,
  route: parseRoute(),
  drafts: {},
  notes: {},
  followUps: {},
  edits: {},
  quoteEdits: {},
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-inquiry-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoRef: 100,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-inquiry.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
  overviewPage: byId("overviewPage"),
  overviewTitle: byId("overviewTitle"),
  overviewSummary: byId("overviewSummary"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  listPanel: byId("listPanel"),
  detailPanel: byId("detailPanel"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  settingsPage: byId("settingsPage"),
  settingsTitle: byId("settingsTitle"),
  settingsContent: byId("settingsContent"),
  notice: byId("notice"),
  search: byId("search"),
  refresh: byId("refresh"),
  mobileRefresh: byId("mobileRefresh"),
  sidebarToggle: byId("sidebarToggle"),
  mobileSidebarToggle: byId("mobileSidebarToggle"),
  sidebarScrim: byId("sidebarScrim"),
  mobileViewTitle: byId("mobileViewTitle"),
  mobileViewMeta: byId("mobileViewMeta"),
  syncStatus: byId("sync-status"),
  approvalsCount: byId("count-approvals"),
  newCount: byId("count-new"),
  staleCount: byId("count-stale"),
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

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function dateOnly(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function referenceNow() {
  if (state.settings?.demo && state.snapshot?.generated_at) return new Date(state.snapshot.generated_at).getTime();
  return Date.now();
}

export function waitingLabel(since) {
  if (!since) return "";
  const ms = Math.max(0, referenceNow() - new Date(since).getTime());
  const minutes = Math.floor(ms / 60000);
  const zh = activeLang() === "zh";
  if (minutes < 60) return `${minutes}${zh ? " 分钟" : "m"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${zh ? " 小时" : "h"}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}${zh ? " 天 " : "d "}${rest}${zh ? " 小时" : "h"}` : `${days}${zh ? " 天" : "d"}`;
}

export function flagEmoji(country) {
  const code = String(country || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&peek=…]`. Search and the peeked record live in
// the URL so refresh, shared links and Back restore the same context.
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

export const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
export const detailUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
};
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // Mark a detail entry opened from its list so Back/Close/Escape step back to
  // that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
}

// Replace the current entry without a hashchange: search keystrokes should
// not each become a Back step.
export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const previousWasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = previousWasList;
  render();
}

export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  state.pageCursors = {};
  state.currentPage = {};
  state.pageLoading = {};
  state.totals = data.totals || {};
  for (const [key, nextCursor] of Object.entries(data.pagination || {})) {
    state.pageCursors[key] = [undefined, nextCursor];
    state.currentPage[key] = 1;
  }
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("kelly-inquiry:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "inquiries"
      ? "#/inquiries"
      : scenario === "detail"
        ? `#/inquiries/${FEATURED_DEMO_INQUIRY}`
        : scenario === "quotes"
          ? "#/quotes"
          : scenario === "approvals"
            ? "#/approvals"
            : scenario === "products"
              ? "#/products"
              : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
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
  els.overviewTitle.textContent = t("overview");
  els.settingsTitle.textContent = t("settings");
  els.detailExpand.textContent = t("openFullPage");
}

export function inquiries() {
  return state.snapshot?.inquiries || [];
}

export function quotes() {
  return state.snapshot?.quotes || [];
}

export function products() {
  return state.snapshot?.products || [];
}

export function approvals() {
  return state.snapshot?.approvals || [];
}

export function inquiryById(id) {
  return inquiries().find((item) => item.inquiry_id === id);
}

export function quoteById(id) {
  return quotes().find((item) => item.quote_id === id);
}

export function productById(id) {
  return products().find((item) => item.product_id === id);
}

export function approvalById(id) {
  return approvals().find((item) => item.item_id === id);
}

export function pendingApprovalsFor(inquiryId) {
  return approvals().filter((item) => item.inquiry_id === inquiryId && PENDING_STATUSES.includes(item.status));
}

export function unansweredNew() {
  return unansweredNewModel(inquiries());
}

export function oldestUnanswered() {
  return oldestUnansweredModel(inquiries());
}

export function staleDeals() {
  return staleInquiries(inquiries(), new Date(referenceNow()).toISOString());
}

export function isFollowUpOverdue(inquiry) {
  return isFollowUpOverdueModel(inquiry, new Date(referenceNow()).toISOString());
}

export function isLocked() {
  return Boolean(state.settings?.lock);
}

function viewLabel(view) {
  if (view === "inquiries") return t("inquiries");
  if (view === "quotes") return t("quotes");
  if (view === "approvals") return t("approvals");
  if (view === "products") return t("products");
  if (view === "settings") return t("settings");
  return t("overview");
}

export const VIEW_HINT = {
  inquiries: "viewHintInquiries",
  quotes: "viewHintQuotes",
  approvals: "viewHintApprovals",
  products: "viewHintProducts",
};

export { viewLabel };

function renderShell() {
  applyI18n();
  const needsReview = approvals().filter((item) => item.status === "needs_review").length;
  const unanswered = unansweredNew().length;
  const stale = staleDeals().length;
  els.syncStatus.textContent = inquiries().length
    ? `${recordCountLabel("inquiries", inquiries().length)} ${t("inquiryCount")} · ${recordCountLabel("quotes", quotes().length)} ${t("quoteCount")}`
    : t("empty");
  if (els.approvalsCount) els.approvalsCount.textContent = needsReview;
  if (els.newCount) els.newCount.textContent = unanswered;
  if (els.staleCount) els.staleCount.textContent = stale;
  if (els.mobileViewTitle) {
    const { view, id } = state.route;
    const record =
      id && view === "inquiries"
        ? inquiryById(id)?.customer?.name
        : id && view === "quotes"
          ? quoteById(id)?.quote_no
          : null;
    els.mobileViewTitle.textContent = record || viewLabel(view);
  }
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = needsReview
      ? `${needsReview} ${t("awaitingApproval")}`
      : `${recordCountLabel("inquiries", inquiries().length)} ${t("inquiryCount")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  if (els.notice && !els.notice.dataset.flash) {
    if (isLocked()) {
      els.notice.textContent = t("lockNotice");
      els.notice.hidden = false;
      els.notice.className = "notice locked";
    } else if (state.settings?.demo) {
      els.notice.textContent = t("demoNotice");
      els.notice.hidden = false;
      els.notice.className = "notice demo";
    } else {
      els.notice.hidden = true;
    }
  }
}

export function flashNotice(text) {
  if (!els.notice) return;
  els.notice.dataset.flash = "1";
  els.notice.textContent = text;
  els.notice.className = "notice flash";
  els.notice.hidden = false;
  setTimeout(() => {
    delete els.notice.dataset.flash;
    renderShell();
  }, 3500);
}

export function channelBadge(channel) {
  return `<span class="channel-badge ${escapeHtml(channel)}"><span class="dot"></span>${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

export function stageChip(stage) {
  return `<span class="stage-chip ${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

export function statusChip(status) {
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function countryCell(country) {
  return `<span class="country">${flagEmoji(country)} ${escapeHtml(String(country || "").toUpperCase())}</span>`;
}

export function matchesQuery(values) {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

export function warningsHtml() {
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

/* ----- overview ----- */

function funnelSvg() {
  const counts = FUNNEL_STAGES.map((stage) => inquiries().filter((item) => item.stage === stage).length);
  const max = Math.max(1, ...counts);
  const rowH = 34;
  const labelW = 108;
  const countW = 34;
  const barMax = 320;
  const width = labelW + barMax + countW;
  const height = FUNNEL_STAGES.length * rowH;
  const fills = ["#94a3b8", "#7c96b8", "#5f89bb", "#3f7cbe", "#2f7d5c"];
  const rows = FUNNEL_STAGES.map((stage, index) => {
    const y = index * rowH;
    const barW = Math.max(3, Math.round((counts[index] / max) * barMax));
    return `
      <text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" class="funnel-label">${escapeHtml(enumLabel(stage, "stage"))}</text>
      <rect x="${labelW}" y="${y + 7}" width="${barMax}" height="${rowH - 14}" rx="5" class="funnel-track"></rect>
      <rect x="${labelW}" y="${y + 7}" width="${barW}" height="${rowH - 14}" rx="5" fill="${fills[index]}"></rect>
      <text x="${labelW + barW + 8}" y="${y + rowH / 2 + 4}" class="funnel-count">${counts[index]}</text>
    `;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("funnel"))}" class="funnel-svg">${rows}</svg>`;
}

// Overview is the only page with a hero + metrics band, and the band carries
// at most 3 numbers that are NOT already in the sidebar's "needs attention"
// panel (awaiting approval / new / stale are there already). Those three stay
// as the sidebar's job; the band here surfaces the numbers the sidebar never
// shows — reply speed and win rate — plus the oldest single thing waiting.
function renderOverview() {
  els.overviewSummary.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const stale = staleDeals();
  const oldest = oldestUnanswered();
  const week = metrics.inquiries_this_week || { total: 0, by_channel: {} };
  const channelBits = Object.entries(week.by_channel || {})
    .map(([channel, count]) => `${channelBadge(channel)} <strong class="channel-count">${count}</strong>`)
    .join(" ");
  const zh = activeLang() === "zh";
  const medianLabel =
    metrics.reply_median_minutes >= 60
      ? `${Math.round(metrics.reply_median_minutes / 6) / 10}${zh ? " 小时" : "h"}`
      : `${metrics.reply_median_minutes || 0}${zh ? " 分钟" : "m"}`;
  els.overviewMetrics.innerHTML = `
    <div><span>${t("replyMedian")}</span><strong>${medianLabel}</strong></div>
    <div><span>${t("winRate")}</span><strong>${Math.round((metrics.win_rate || 0) * 100)}%</strong></div>
    <div><span>${t("oldestUnanswered")}</span><strong>${oldest ? waitingLabel(oldest.last_incoming_at) : "—"}</strong></div>
  `;
  els.overviewBody.innerHTML = `
    ${warningsHtml()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("inquiriesThisWeek")}</h2>
        <div class="metric-inline"><strong>${week.total || 0}</strong><span class="channel-mix">${channelBits}</span></div>
        <div class="muted">${t("quotesSent")}: ${metrics.quotes_sent || 0}</div>
      </div>
      <div class="overview-panel">
        <h2>${t("funnel")}</h2>
        ${funnelSvg()}
      </div>
      <div class="overview-panel span-2">
        <h2>${t("staleDealsTitle")}</h2>
        ${
          stale.length
            ? stale
                .map(
                  (item) => `
          <a class="stale-row" href="${recordUrl(item.inquiry_id, "inquiries")}">
            <span class="stale-copy">
              <strong>${escapeHtml(item.customer?.name || "")} · ${escapeHtml(item.customer?.company || "")}</strong>
              <span>${escapeHtml(item.product_interest || "")}</span>
            </span>
            <span class="stale-meta">
              ${stageChip(item.stage)}
              <small class="overdue">${t("followUp")} ${dateOnly(item.next_follow_up)} · ${t("followUpOverdue")}</small>
            </span>
          </a>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
      </div>
    </section>
  `;
}

/* ----- render dispatch ----- */

export function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.snapshot);
  const onRecordView = ready && RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  els.settingsPage.hidden = !ready || view !== "settings";
  if (!ready) return;
  if (onRecordView) renderRecordView();
  else if (view === "settings") renderSettings();
  else renderOverview();
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
  localStorage.setItem("kelly-inquiry-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
    return;
  }
  render();
});
els.detailBack.addEventListener("click", closeDetail);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a draft only leaves the field; a second Escape closes.
  if (event.target.closest?.("textarea, input")) {
    event.target.blur();
    return;
  }
  if (state.route.selectedId && state.route.presentation && state.route.presentation !== "page") closeDetail();
});
els.listPanel.addEventListener("click", (event) => {
  const pager = event.target.closest("[data-goto-page]");
  if (pager) {
    const [key, page] = pager.dataset.gotoPage.split(":");
    goToPage(key, Number(page));
    return;
  }
  if (event.target.closest("a, button, input, textarea")) return;
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
els.detailBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "queue-reply") {
    submitDecision.queueReply(button.dataset.inquiry);
    return;
  }
  if (button.dataset.action === "save-follow-up") {
    submitDecision.saveFollowUp(button.dataset.inquiry);
    return;
  }
  if (button.dataset.action === "save-quote") {
    submitDecision.saveQuote(button.dataset.quote);
    return;
  }
  if (button.dataset.action === "decide") {
    submitDecision.decide(button.dataset.item, button.dataset.decision, button.closest("[data-item-card]"));
  }
});
els.detailBody.addEventListener("input", (event) => {
  const composer = event.target.closest("#composer-text");
  if (composer) {
    const inquiryId = event.target.closest("[data-inquiry]")?.dataset.inquiry;
    if (inquiryId) state.drafts[inquiryId] = composer.value;
  }
  const note = event.target.closest("#composer-note");
  if (note) {
    const inquiryId = event.target.closest("[data-inquiry]")?.dataset.inquiry;
    if (inquiryId) state.notes[inquiryId] = note.value;
  }
  const followUp = event.target.closest("#follow-up-date");
  if (followUp) {
    const inquiryId = event.target.closest("[data-inquiry]")?.dataset.inquiry;
    if (inquiryId) state.followUps[inquiryId] = followUp.value;
  }
  const lineInput = event.target.closest(".line-input");
  if (lineInput) submitDecision.editQuoteLine(lineInput);
  const validity = event.target.closest("#quote-validity");
  if (validity) submitDecision.editQuoteValidity(validity);
  const textarea = event.target.closest("[data-item-text]");
  if (textarea) {
    const card = textarea.closest("[data-item-card]");
    if (card) state.edits[card.dataset.itemCard] = textarea.value;
  }
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
    els.listPanel.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

els.search.value = state.route.query;
previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();

const PAGE_BINDINGS = {
  inquiries: { key: "inquiries", path: "snapshot.inquiries" },
  quotes: { key: "quotes", path: "snapshot.quotes" },
  approvals: { key: "approvals", path: "snapshot.approvals" },
  products: { key: "products", path: "snapshot.products" },
};

function pageSize(key) {
  return appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;
}

function pageCount(key) {
  const total = state.totals?.[key];
  return total == null ? null : Math.max(1, Math.ceil(total / pageSize(key)));
}

function replacePageRows(path, rows) {
  const parts = path.split(".");
  let target = state;
  for (const part of parts.slice(0, -1)) {
    target = target?.[part];
    if (!target) return;
  }
  target[parts.at(-1)] = rows;
}

export async function goToPage(key, targetPage) {
  if (state.pageLoading[key] || !state.pageCursors[key]) return;
  const binding = Object.values(PAGE_BINDINGS).find((entry) => entry.key === key);
  if (!binding) return;
  const totalPages = pageCount(key);
  const page = totalPages == null ? Math.max(1, targetPage) : Math.min(Math.max(1, targetPage), totalPages);
  if (page === state.currentPage[key]) return;
  state.pageLoading[key] = true;
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
    replacePageRows(binding.path, result.rows);
    state.currentPage[key] = page;
  } finally {
    state.pageLoading[key] = false;
    render();
  }
}

export function recordCountLabel(key, loadedCount, filtered = false) {
  if (filtered) return loadedCount;
  const total = state.totals?.[key];
  if (total != null) return total;
  const current = state.currentPage?.[key] || 1;
  return `${loadedCount}${state.pageCursors?.[key]?.[current] ? "+" : ""}`;
}

export function pagerControl(key) {
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

boot();
