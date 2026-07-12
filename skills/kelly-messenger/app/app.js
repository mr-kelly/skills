import { messages } from "./i18n/messages.js";
import {
  decideAction,
  queueReplyAction,
  renderAccounts,
  renderInbox,
  renderOutbox,
  renderSettings,
} from "./js/message-views.js";

const FEATURED_DEMO_CONVERSATION = "wa-lena-pricing";
const PENDING_STATUSES = ["needs_review", "changes_requested", "approved"];

export const state = {
  snapshot: null,
  outbox: null,
  settings: null,
  route: parseRoute(),
  query: "",
  drafts: {},
  notes: {},
  edits: {},
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-messenger-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoRef: 100,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-messenger.sidebarCollapsed";

export const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  notice: document.querySelector("#notice"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  needsReplyCount: document.querySelector("#count-needs-reply"),
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

function setMobileDetailOpen(open) {
  document.body.classList.toggle("mobile-detail-open", Boolean(open));
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
  if (minutes < 60) return `${minutes}${activeLang() === "zh" ? " 分钟" : "m"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${activeLang() === "zh" ? " 小时" : "h"}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const zh = activeLang() === "zh";
  return rest ? `${days}${zh ? " 天 " : "d "}${rest}${zh ? " 小时" : "h"}` : `${days}${zh ? " 天" : "d"}`;
}

function parseRoute() {
  const parts = (location.hash || "#/inbox").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "inbox", id: parts.slice(1).join("/") || "" };
}

function setRoute() {
  state.route = parseRoute();
  render();
}

export async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.outbox = data.outbox;
  state.settings = data;
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "inbox"
      ? "#/inbox"
      : scenario === "chat"
        ? `#/inbox/${FEATURED_DEMO_CONVERSATION}`
        : scenario === "outbox"
          ? "#/outbox"
          : scenario === "accounts"
            ? "#/accounts"
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

function conversations() {
  return state.snapshot?.conversations || [];
}

export function outboxReplies() {
  return state.outbox?.replies || [];
}

export function pendingRepliesFor(conversationId) {
  return outboxReplies().filter(
    (reply) => reply.conversation_id === conversationId && PENDING_STATUSES.includes(reply.status),
  );
}

export function conversationById(id) {
  return conversations().find((item) => item.conversation_id === id);
}

export function awaitingConversations() {
  return conversations().filter((item) => item.awaiting_reply);
}

function oldestWaiting() {
  return (
    awaitingConversations()
      .filter((item) => item.last_incoming_at)
      .sort((a, b) => String(a.last_incoming_at).localeCompare(String(b.last_incoming_at)))[0] || null
  );
}

export function isLocked() {
  return Boolean(state.settings?.lock);
}

function renderShell() {
  applyI18n();
  const awaiting = awaitingConversations().length;
  const approved = outboxReplies().filter((reply) => reply.status === "approved").length;
  const blocked = outboxReplies().filter((reply) => reply.status === "blocked").length;
  const unread = conversations().filter((item) => item.unread).length;
  els.syncStatus.textContent = conversations().length
    ? `${conversations().length} ${t("conversationCount")} · ${unread} ${t("unread")}`
    : t("empty");
  if (els.needsReplyCount) els.needsReplyCount.textContent = awaiting;
  if (els.approvedCount) els.approvedCount.textContent = approved;
  if (els.blockedCount) els.blockedCount.textContent = blocked;
  if (els.mobileViewTitle) {
    const conversation = state.route.view === "inbox" && state.route.id ? conversationById(state.route.id) : null;
    els.mobileViewTitle.textContent = conversation ? conversation.title : viewLabel(state.route.view);
  }
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = awaiting
      ? `${awaiting} ${t("needsReply")}`
      : `${conversations().length} ${t("conversationCount")}`;
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
  setMobileDetailOpen(state.route.view === "inbox" && state.route.id);
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

function viewLabel(view) {
  if (view === "overview") return t("overview");
  if (view === "outbox") return t("outbox");
  if (view === "accounts") return t("accounts");
  if (view === "settings") return t("settings");
  return t("inbox");
}

export function platformBadge(platform) {
  return `<span class="platform-badge ${escapeHtml(platform)}"><span class="dot"></span>${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

export function statusChip(status) {
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function conversationActivityAt(item) {
  const fromMessages = (item.messages || []).reduce(
    (latest, message) => (String(message.sent_at) > latest ? String(message.sent_at) : latest),
    "",
  );
  return item.last_message_at || fromMessages || "";
}

export function filteredConversations() {
  return conversations()
    .filter((item) =>
      matchesQuery([
        item.title,
        item.channel,
        item.workspace,
        item.platform,
        ...(item.participants || []),
        ...(item.messages || []).slice(-6).map((message) => message.text),
      ]),
    )
    .sort((a, b) => conversationActivityAt(b).localeCompare(conversationActivityAt(a)));
}

function warningsHtml() {
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

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const accounts = state.snapshot?.accounts || [];
  const awaiting = awaitingConversations().length;
  const approved = outboxReplies().filter((reply) => reply.status === "approved").length;
  const blocked = outboxReplies().filter((reply) => reply.status === "blocked").length;
  const unread = conversations().filter((item) => item.unread).length;
  const oldest = oldestWaiting();
  const recent = conversations()
    .flatMap((item) => (item.messages || []).map((message) => ({ ...message, conversation: item })))
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
    .slice(0, 8);
  els.content.innerHTML = `
    <div class="metrics">
      <a class="metric" href="#/inbox"><span>${t("needsReply")}</span><strong>${awaiting}</strong></a>
      <a class="metric" href="#/outbox"><span>${t("approvedWaiting")}</span><strong>${approved}</strong></a>
      <a class="metric" href="#/outbox"><span>${t("blocked")}</span><strong>${blocked}</strong></a>
      <a class="metric ${oldest ? "warn" : ""}" href="${oldest ? `#/inbox/${encodeURIComponent(oldest.conversation_id)}` : "#/inbox"}">
        <span>${t("oldestWaiting")}</span>
        <strong>${oldest ? waitingLabel(oldest.last_incoming_at) : "—"}</strong>
        ${oldest ? `<small>${escapeHtml(oldest.title)}</small>` : `<small>${unread} ${t("unread")}</small>`}
      </a>
    </div>
    ${warningsHtml()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("platforms")}</h2>
        ${accounts
          .map(
            (account) => `
          <a class="platform-row" href="#/accounts">
            <span class="platform-row-head">
              ${platformBadge(account.platform)}
              <strong>${escapeHtml(account.display_name)}</strong>
              <small>${escapeHtml(enumLabel(account.connector, "connector"))}</small>
            </span>
            <span class="platform-row-stats">
              <span><strong>${account.unread_count ?? 0}</strong> ${t("unread")}</span>
              <span><strong>${account.conversation_count ?? 0}</strong> ${t("conversationCount")}</span>
              <small>${t("lastSync")} ${account.last_sync_at ? dateTime(account.last_sync_at) : "—"}</small>
            </span>
          </a>
        `,
          )
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("recentActivity")}</h2>
        ${recent
          .map(
            (message) => `
          <a class="activity-row" href="#/inbox/${encodeURIComponent(message.conversation.conversation_id)}">
            <span class="activity-copy">
              <strong>${escapeHtml(message.sender)}</strong>
              <span>${escapeHtml(message.text)}</span>
            </span>
            <span class="activity-meta">
              ${platformBadge(message.conversation.platform)}
              <small>${dateTime(message.sent_at)}</small>
            </span>
          </a>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

export function conversationPreview(conversation) {
  const last = (conversation.messages || [])[conversation.messages.length - 1];
  if (!last) return "";
  return `${last.sender}: ${last.text}`;
}

export function render() {
  renderShell();
  if (state.route.view === "overview") renderOverview();
  else if (state.route.view === "outbox") renderOutbox();
  else if (state.route.view === "accounts") renderAccounts();
  else if (state.route.view === "settings") renderSettings();
  else renderInbox();
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
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-messenger-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
    return;
  }
  render();
});
els.content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "back") {
    location.hash = "#/inbox";
    return;
  }
  if (button.dataset.action === "queue-reply") {
    queueReplyAction(button.dataset.conversation);
    return;
  }
  if (button.dataset.action === "decide") {
    decideAction(button.dataset.reply, button.dataset.decision, button.closest("[data-reply-card]"));
  }
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
