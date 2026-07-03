import { messages } from "./i18n/messages.js";

const FEATURED_DEMO_CONVERSATION = "wa-lena-pricing";
const PENDING_STATUSES = ["needs_review", "changes_requested", "approved"];

const state = {
  snapshot: null,
  outbox: null,
  settings: null,
  route: parseRoute(),
  query: "",
  drafts: {},
  notes: {},
  edits: {},
  lang: normalizeLang(new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-messenger-language") || "auto"),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoRef: 100
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-messenger.sidebarCollapsed";

const els = {
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
  language: document.querySelector("#language")
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
  return String(lang || "auto").toLowerCase().startsWith("zh") ? "zh" : (lang || "auto");
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key]
    || messages.en.enum?.[group]?.[key]
    || key.replaceAll("_", " ");
}

function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function referenceNow() {
  if (state.settings?.demo && state.snapshot?.generated_at) return new Date(state.snapshot.generated_at).getTime();
  return Date.now();
}

function waitingLabel(since) {
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

async function loadState() {
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
  const route = scenario === "inbox"
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
  const languageLabels = activeLang() === "zh"
    ? { auto: "自动", en: "English", zh: "中文" }
    : { auto: "Auto", en: "English", zh: "中文" };
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

function outboxReplies() {
  return state.outbox?.replies || [];
}

function pendingRepliesFor(conversationId) {
  return outboxReplies().filter((reply) => reply.conversation_id === conversationId && PENDING_STATUSES.includes(reply.status));
}

function conversationById(id) {
  return conversations().find((item) => item.conversation_id === id);
}

function awaitingConversations() {
  return conversations().filter((item) => item.awaiting_reply);
}

function oldestWaiting() {
  return awaitingConversations()
    .filter((item) => item.last_incoming_at)
    .sort((a, b) => String(a.last_incoming_at).localeCompare(String(b.last_incoming_at)))[0] || null;
}

function isLocked() {
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

function flashNotice(text) {
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

function platformBadge(platform) {
  return `<span class="platform-badge ${escapeHtml(platform)}"><span class="dot"></span>${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

function statusChip(status) {
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredConversations() {
  return conversations().filter((item) => matchesQuery([
    item.title,
    item.channel,
    item.workspace,
    item.platform,
    ...(item.participants || []),
    ...(item.messages || []).slice(-6).map((message) => message.text)
  ]));
}

function warningsHtml() {
  const items = state.snapshot?.warnings || [];
  if (!items.length) return "";
  return `<div class="warnings">${items.map((item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `).join("")}</div>`;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}` : t("empty");
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
        ${accounts.map((account) => `
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
        `).join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("recentActivity")}</h2>
        ${recent.map((message) => `
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
        `).join("")}
      </div>
    </section>
  `;
}

function conversationPreview(conversation) {
  const last = (conversation.messages || [])[conversation.messages.length - 1];
  if (!last) return "";
  return `${last.sender}: ${last.text}`;
}

function renderInbox() {
  const selected = state.route.id ? conversationById(state.route.id) : null;
  els.title.textContent = selected ? selected.title : t("inbox");
  els.subtitle.textContent = selected
    ? [enumLabel(selected.platform, "platform"), selected.channel, selected.workspace].filter(Boolean).join(" · ")
    : `${filteredConversations().length} ${t("conversationCount")} · ${awaitingConversations().length} ${t("needsReply")}`;
  const list = filteredConversations();
  els.content.innerHTML = `
    <section class="inbox">
      <div class="conv-list list-panel">
        ${list.length ? list.map((conversation) => `
          <a class="conv-row ${selected?.conversation_id === conversation.conversation_id ? "active" : ""}" href="#/inbox/${encodeURIComponent(conversation.conversation_id)}">
            <span class="conv-row-top">
              ${platformBadge(conversation.platform)}
              <strong class="conv-title">${escapeHtml(conversation.title)}</strong>
              ${conversation.unread ? '<span class="unread-dot" aria-hidden="true"></span>' : ""}
              <small class="conv-time">${dateTime(conversation.last_message_at)}</small>
            </span>
            <span class="conv-row-mid">${escapeHtml([conversation.channel, conversation.workspace].filter(Boolean).join(" · "))}</span>
            <span class="conv-row-bottom">
              <span class="conv-preview">${escapeHtml(conversationPreview(conversation))}</span>
              ${conversation.awaiting_reply ? `<span class="wait-chip">${t("waited")} ${waitingLabel(conversation.last_incoming_at)}</span>` : ""}
            </span>
          </a>
        `).join("") : `<div class="empty">${t("empty")}</div>`}
      </div>
      <div class="conv-detail detail-panel">
        ${selected ? conversationDetail(selected) : `<div class="empty">${t("noConversation")}</div>`}
      </div>
    </section>
  `;
  const composer = els.content.querySelector("#composer-text");
  if (composer) {
    composer.addEventListener("input", () => {
      state.drafts[selected.conversation_id] = composer.value;
    });
  }
  const note = els.content.querySelector("#composer-note");
  if (note) {
    note.addEventListener("input", () => {
      state.notes[selected.conversation_id] = note.value;
    });
  }
}

function conversationDetail(conversation) {
  const pending = pendingRepliesFor(conversation.conversation_id);
  const draft = state.drafts[conversation.conversation_id];
  const prefill = draft !== undefined ? draft : (!pending.length && conversation.suggested_reply ? conversation.suggested_reply : "");
  const showSuggestedNote = draft === undefined && !pending.length && Boolean(conversation.suggested_reply);
  const locked = isLocked();
  return `
    <button class="back-to-list" type="button" data-action="back">← ${t("backToList")}</button>
    <div class="conv-head">
      <div class="conv-head-copy">
        ${platformBadge(conversation.platform)}
        <span class="badge">${escapeHtml(enumLabel(conversation.kind, "kind"))}</span>
        ${conversation.channel ? `<span class="badge">${escapeHtml(conversation.channel)}</span>` : ""}
        ${conversation.workspace ? `<span class="muted">${escapeHtml(conversation.workspace)}</span>` : ""}
      </div>
      <div class="muted">${t("participants")}: ${escapeHtml((conversation.participants || []).join(", "))}</div>
    </div>
    <div class="transcript">
      ${(conversation.messages || []).map((message) => `
        <div class="bubble-row ${message.direction === "outgoing" ? "out" : "in"}">
          <div class="bubble">
            <div class="bubble-meta"><strong>${escapeHtml(message.sender)}</strong><span>${dateTime(message.sent_at)}</span></div>
            <div class="bubble-text">${escapeHtml(message.text)}</div>
            ${message.attachment ? `<div class="bubble-attachment">${escapeHtml(message.attachment)}</div>` : ""}
          </div>
        </div>
      `).join("")}
      ${pending.map((reply) => `
        <div class="bubble-row out">
          <div class="bubble queued-bubble">
            <div class="bubble-meta">
              <strong>${t("reply")} #${reply.ref}</strong>
              <span class="status-chip ${escapeHtml(reply.status)}">${t("queued")} · ${escapeHtml(enumLabel(reply.status))}</span>
            </div>
            <div class="bubble-text">${escapeHtml(reply.text)}</div>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="composer">
      ${showSuggestedNote ? `<div class="composer-hint">${t("agentSuggestedPrefill")}</div>` : ""}
      <textarea id="composer-text" rows="4" placeholder="${escapeHtml(t("replyPlaceholder"))}" ${locked ? "disabled" : ""}>${escapeHtml(prefill)}</textarea>
      <input id="composer-note" type="text" placeholder="${escapeHtml(t("notePlaceholder"))}" value="${escapeHtml(state.notes[conversation.conversation_id] || "")}" ${locked ? "disabled" : ""}>
      <div class="composer-actions">
        <button type="button" class="primary" data-action="queue-reply" data-conversation="${escapeHtml(conversation.conversation_id)}" ${locked ? "disabled" : ""}>${t("queueReply")}</button>
      </div>
    </div>
  `;
}

function renderOutbox() {
  els.title.textContent = t("outbox");
  const replies = outboxReplies().filter((reply) => matchesQuery([
    reply.text,
    reply.reason,
    reply.conversation_title,
    reply.platform,
    reply.status,
    `#${reply.ref}`
  ]));
  const needsReview = outboxReplies().filter((reply) => reply.status === "needs_review").length;
  els.subtitle.textContent = `${outboxReplies().length} ${t("replies")} · ${needsReview} ${enumLabel("needs_review")}`;
  const locked = isLocked();
  els.content.innerHTML = replies.length ? `
    <div class="outbox-list">
      ${replies.map((reply) => {
        const editable = reply.status !== "done";
        const value = state.edits[reply.reply_id] !== undefined ? state.edits[reply.reply_id] : reply.text;
        return `
          <article class="outbox-card" data-reply-card="${escapeHtml(reply.reply_id)}">
            <header class="outbox-head">
              <strong>${t("reply")} #${reply.ref}</strong>
              ${statusChip(reply.status)}
              ${platformBadge(reply.platform)}
              <a class="outbox-conv" href="#/inbox/${encodeURIComponent(reply.conversation_id)}">${escapeHtml(reply.conversation_title || reply.conversation_id)}</a>
              <small class="muted">${dateTime(reply.created_at)}</small>
            </header>
            ${reply.reason ? `<div class="outbox-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(reply.reason)}</div>` : ""}
            ${reply.note ? `<div class="outbox-reason"><span class="muted">${t("note")}:</span> ${escapeHtml(reply.note)}</div>` : ""}
            ${editable
              ? `<textarea class="outbox-text" data-reply-text rows="4" ${locked ? "disabled" : ""}>${escapeHtml(value)}</textarea>`
              : `<div class="outbox-sent-text">${escapeHtml(reply.text)}</div>`}
            ${reply.decision?.comment ? `<div class="outbox-reason"><span class="muted">${t("comment")}:</span> ${escapeHtml(reply.decision.comment)} <small class="muted">(${t("decidedAt")} ${dateTime(reply.decision.decided_at)})</small></div>` : ""}
            ${reply.status === "approved" ? `<div class="outbox-waiting">${t("waitingForSend")}</div>` : ""}
            ${reply.execution ? `<div class="outbox-execution">${t("sentVia")} ${escapeHtml(enumLabel(reply.execution.connector, "connector"))} · ${t("target")} ${escapeHtml(reply.execution.target || "")} · ${escapeHtml(enumLabel(reply.execution.status))} ${reply.execution.executed_at ? `· ${dateTime(reply.execution.executed_at)}` : ""}</div>` : ""}
            ${editable ? `
              <div class="outbox-actions">
                <input type="text" data-reply-comment placeholder="${escapeHtml(t("commentPlaceholder"))}" ${locked ? "disabled" : ""}>
                <div class="outbox-buttons">
                  <button type="button" class="primary" data-action="decide" data-reply="${escapeHtml(reply.reply_id)}" data-decision="approve" ${locked ? "disabled" : ""}>${t("approve")}</button>
                  <button type="button" data-action="decide" data-reply="${escapeHtml(reply.reply_id)}" data-decision="request_changes" ${locked ? "disabled" : ""}>${t("requestChanges")}</button>
                  <button type="button" data-action="decide" data-reply="${escapeHtml(reply.reply_id)}" data-decision="revise" ${locked ? "disabled" : ""}>${t("saveEdit")}</button>
                  <button type="button" class="danger" data-action="decide" data-reply="${escapeHtml(reply.reply_id)}" data-decision="block" ${locked ? "disabled" : ""}>${t("block")}</button>
                </div>
              </div>
            ` : ""}
          </article>
        `;
      }).join("")}
    </div>
  ` : `<div class="empty">${t("noOutbox")}</div>`;
  els.content.querySelectorAll("[data-reply-text]").forEach((textarea) => {
    const card = textarea.closest("[data-reply-card]");
    textarea.addEventListener("input", () => {
      state.edits[card.dataset.replyCard] = textarea.value;
    });
  });
}

function renderAccounts() {
  els.title.textContent = t("accounts");
  const accounts = state.snapshot?.accounts || [];
  const configAccounts = state.settings?.config_summary?.accounts || [];
  els.subtitle.textContent = `${accounts.length || configAccounts.length} ${t("configured") || ""}`.trim() || t("accounts");
  const rows = accounts.length ? accounts : configAccounts.map((account) => ({ ...account, unread_count: 0, conversation_count: 0, last_sync_at: "" }));
  els.content.innerHTML = rows.length ? `
    <div class="account-grid">
      ${rows.map((account) => {
        const config = configAccounts.find((item) => item.account_id === account.account_id);
        const warningsFor = (state.snapshot?.warnings || []).filter((item) => item.account_id === account.account_id);
        return `
          <div class="account-card">
            <div class="row between">
              <strong>${escapeHtml(account.display_name)}</strong>
              ${platformBadge(account.platform)}
            </div>
            <div class="muted">${escapeHtml(account.workspace || account.account_id)}</div>
            <div class="account-stats">
              <span><strong>${account.conversation_count ?? 0}</strong> ${t("conversationCount")}</span>
              <span><strong>${account.unread_count ?? 0}</strong> ${t("unread")}</span>
            </div>
            <dl class="account-meta">
              <dt>${t("connector")}</dt><dd>${escapeHtml(enumLabel(account.connector, "connector"))}</dd>
              <dt>${t("lastSync")}</dt><dd>${account.last_sync_at ? dateTime(account.last_sync_at) : "—"}</dd>
            </dl>
            ${config ? `<div class="env-ready ${config.secrets_ready ? "ok" : "missing"}">${config.secrets_ready ? t("secretsReady") : (config.secret_envs.length ? t("missingSecrets") : enumLabel(account.connector, "connector"))}</div>` : ""}
            ${warningsFor.map((item) => `<div class="account-warning">${escapeHtml(item.message)}</div>`).join("")}
          </div>
        `;
      }).join("")}
    </div>
  ` : `<div class="empty">${t("setupNeeded")}</div>`;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const syncLog = state.snapshot?.sync_log || [];
  const report = state.settings?.execution_report;
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          ${summary.reply_style ? `<dt>${t("replyStyle")}</dt><dd>${escapeHtml(summary.reply_style.tone || "")}</dd>` : ""}
          ${summary.sync?.cadence_minutes ? `<dt>${t("syncCadence")}</dt><dd>${escapeHtml(String(summary.sync.cadence_minutes))} ${t("minutes")}</dd>` : ""}
        </dl>
      </section>
      <section>
        <h2>${t("accounts")}</h2>
        ${(summary.accounts || []).map((account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.platform, "platform"))} · ${escapeHtml(enumLabel(account.connector, "connector"))}</span>
            <span>${account.secret_envs.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
          </div>
        `).join("") || `<div class="empty">${t("setupNeeded")}</div>`}
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${syncLog.length ? syncLog.slice(-8).reverse().map((entry) => `
          <div class="settings-account">
            <strong>${escapeHtml(entry.account_id)}</strong>
            <span>${escapeHtml(enumLabel(entry.method, "connector"))} · ${dateTime(entry.at)}</span>
            <span>${escapeHtml(entry.message || "")}</span>
          </div>
        `).join("") : `<div class="empty">—</div>`}
      </section>
      ${report ? `
        <section>
          <h2>${t("executionReport")}</h2>
          ${(report.results || []).map((result) => `
            <div class="settings-account">
              <strong>${t("reply")} #${result.ref}</strong>
              <span>${escapeHtml(enumLabel(result.status))} · ${escapeHtml(enumLabel(result.connector, "connector"))}</span>
              <span>${escapeHtml(result.detail || result.target || "")}</span>
            </div>
          `).join("")}
        </section>
      ` : ""}
    </div>
  `;
}

async function queueReplyAction(conversationId) {
  const text = String(state.drafts[conversationId] !== undefined
    ? state.drafts[conversationId]
    : (els.content.querySelector("#composer-text")?.value || "")).trim();
  const note = String(state.notes[conversationId] || "").trim();
  if (!text) return;
  if (state.settings?.demo) {
    const conversation = conversationById(conversationId);
    state.demoRef += 1;
    state.outbox.replies.push({
      reply_id: `reply-demo-local-${state.demoRef}`,
      ref: outboxReplies().reduce((max, reply) => Math.max(max, reply.ref || 0), 0) + 1,
      conversation_id: conversationId,
      account_id: conversation?.account_id || "",
      platform: conversation?.platform || "",
      conversation_title: conversation?.title || "",
      text,
      note,
      reason: "Queued from the inbox composer.",
      suggested_by: "human",
      status: "needs_review",
      decision: null,
      execution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    delete state.drafts[conversationId];
    delete state.notes[conversationId];
    flashNotice(`${t("queuedNotice")} ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/outbox/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, text, note })
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Queue failed: ${res.status}`);
    return;
  }
  delete state.drafts[conversationId];
  delete state.notes[conversationId];
  flashNotice(t("queuedNotice"));
  await loadState();
}

async function decideAction(replyId, action, card) {
  const comment = String(card?.querySelector("[data-reply-comment]")?.value || "").trim();
  const text = state.edits[replyId];
  if (state.settings?.demo) {
    const reply = outboxReplies().find((item) => item.reply_id === replyId);
    if (!reply) return;
    if (typeof text === "string" && text.trim()) reply.text = text.trim();
    if (action === "approve") reply.status = "approved";
    else if (action === "request_changes") reply.status = "changes_requested";
    else if (action === "block") reply.status = "blocked";
    reply.decision = { action, comment, decided_at: new Date().toISOString() };
    delete state.edits[replyId];
    flashNotice(t("demoNotice"));
    render();
    return;
  }
  const res = await fetch("/api/outbox/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reply_id: replyId, action, comment, text })
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Decision failed: ${res.status}`);
    return;
  }
  delete state.edits[replyId];
  await loadState();
}

function render() {
  renderShell();
  if (state.route.view === "overview") renderOverview();
  else if (state.route.view === "outbox") renderOutbox();
  else if (state.route.view === "accounts") renderAccounts();
  else if (state.route.view === "settings") renderSettings();
  else renderInbox();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
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
