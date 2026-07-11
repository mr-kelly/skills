import { messages } from "./i18n/messages.js";
import {
  decideAction,
  queueReplyAction,
  renderApprovals,
  renderProductDetail,
  renderProducts,
  renderQuoteDetail,
  renderQuotes,
  renderSettings,
  saveFollowUpAction,
  saveQuoteAction,
} from "./js/commerce-views.js";

const FEATURED_DEMO_INQUIRY = "wa-mueller-led-panels";
const PENDING_STATUSES = ["needs_review", "changes_requested", "approved"];
const ACTIVE_STAGES = ["new", "replied", "quoted", "negotiating"];
const FUNNEL_STAGES = ["new", "replied", "quoted", "negotiating", "won"];

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
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
  approvalsCount: document.querySelector("#count-approvals"),
  newCount: document.querySelector("#count-new"),
  staleCount: document.querySelector("#count-stale"),
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

function waitingLabel(since) {
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

function flagEmoji(country) {
  const code = String(country || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

export function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts.slice(1).join("/") || "" };
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
  state.settings = data;
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

function pendingApprovalsFor(inquiryId) {
  return approvals().filter((item) => item.inquiry_id === inquiryId && PENDING_STATUSES.includes(item.status));
}

function unansweredNew() {
  return inquiries().filter(
    (item) => item.stage === "new" && !(item.messages || []).some((message) => message.direction === "outgoing"),
  );
}

function oldestUnanswered() {
  return (
    unansweredNew()
      .filter((item) => item.last_incoming_at)
      .sort((a, b) => String(a.last_incoming_at).localeCompare(String(b.last_incoming_at)))[0] || null
  );
}

function staleDeals() {
  const today = new Date(referenceNow()).toISOString().slice(0, 10);
  return inquiries()
    .filter((item) => ACTIVE_STAGES.includes(item.stage) && item.next_follow_up && item.next_follow_up < today)
    .sort((a, b) => String(a.next_follow_up).localeCompare(String(b.next_follow_up)));
}

function isFollowUpOverdue(inquiry) {
  if (!inquiry.next_follow_up) return false;
  const today = new Date(referenceNow()).toISOString().slice(0, 10);
  return ACTIVE_STAGES.includes(inquiry.stage) && inquiry.next_follow_up < today;
}

export function isLocked() {
  return Boolean(state.settings?.lock);
}

function renderShell() {
  applyI18n();
  const needsReview = approvals().filter((item) => item.status === "needs_review").length;
  const unanswered = unansweredNew().length;
  const stale = staleDeals().length;
  els.syncStatus.textContent = inquiries().length
    ? `${inquiries().length} ${t("inquiryCount")} · ${quotes().length} ${t("quoteCount")}`
    : t("empty");
  if (els.approvalsCount) els.approvalsCount.textContent = needsReview;
  if (els.newCount) els.newCount.textContent = unanswered;
  if (els.staleCount) els.staleCount.textContent = stale;
  if (els.mobileViewTitle) {
    const inquiry = state.route.view === "inquiries" && state.route.id ? inquiryById(state.route.id) : null;
    const quote = state.route.view === "quotes" && state.route.id ? quoteById(state.route.id) : null;
    els.mobileViewTitle.textContent = inquiry
      ? inquiry.customer?.name || inquiry.inquiry_id
      : quote
        ? quote.quote_no
        : viewLabel(state.route.view);
  }
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = needsReview
      ? `${needsReview} ${t("awaitingApproval")}`
      : `${inquiries().length} ${t("inquiryCount")}`;
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
  setMobileDetailOpen(Boolean(state.route.id) && ["inquiries", "quotes", "products"].includes(state.route.view));
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
  if (view === "inquiries") return t("inquiries");
  if (view === "quotes") return t("quotes");
  if (view === "approvals") return t("approvals");
  if (view === "products") return t("products");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function channelBadge(channel) {
  return `<span class="channel-badge ${escapeHtml(channel)}"><span class="dot"></span>${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

function stageChip(stage) {
  return `<span class="stage-chip ${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

export function statusChip(status) {
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function countryCell(country) {
  return `<span class="country">${flagEmoji(country)} ${escapeHtml(String(country || "").toUpperCase())}</span>`;
}

export function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredInquiries() {
  return inquiries().filter((item) =>
    matchesQuery([
      item.customer?.name,
      item.customer?.company,
      item.customer?.country,
      item.channel,
      item.stage,
      item.product_interest,
      item.owner,
      ...(item.messages || []).slice(-4).map((message) => message.text),
    ]),
  );
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

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const needsReview = approvals().filter((item) => item.status === "needs_review").length;
  const unanswered = unansweredNew().length;
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
  els.content.innerHTML = `
    <div class="metrics">
      <a class="metric ${needsReview ? "warn" : ""}" href="#/approvals"><span>${t("awaitingApproval")}</span><strong>${needsReview}</strong></a>
      <a class="metric" href="#/inquiries"><span>${t("newInquiries")}</span><strong>${unanswered}</strong></a>
      <a class="metric ${stale.length ? "warn" : ""}" href="#/inquiries"><span>${t("staleDeals")}</span><strong>${stale.length}</strong></a>
      <a class="metric ${oldest ? "warn" : ""}" href="${oldest ? `#/inquiries/${encodeURIComponent(oldest.inquiry_id)}` : "#/inquiries"}">
        <span>${t("oldestUnanswered")}</span>
        <strong>${oldest ? waitingLabel(oldest.last_incoming_at) : "—"}</strong>
        ${oldest ? `<small>${escapeHtml(oldest.customer?.name || "")} · ${escapeHtml(oldest.customer?.company || "")}</small>` : ""}
      </a>
    </div>
    <div class="metrics kpis">
      <div class="metric"><span>${t("inquiriesThisWeek")}</span><strong>${week.total || 0}</strong><small class="channel-mix">${channelBits}</small></div>
      <div class="metric"><span>${t("replyMedian")}</span><strong>${medianLabel}</strong></div>
      <div class="metric"><span>${t("quotesSent")}</span><strong>${metrics.quotes_sent || 0}</strong></div>
      <div class="metric"><span>${t("winRate")}</span><strong>${Math.round((metrics.win_rate || 0) * 100)}%</strong></div>
    </div>
    ${warningsHtml()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("funnel")}</h2>
        ${funnelSvg()}
      </div>
      <div class="overview-panel">
        <h2>${t("staleDealsTitle")}</h2>
        ${
          stale.length
            ? stale
                .map(
                  (item) => `
          <a class="stale-row" href="#/inquiries/${encodeURIComponent(item.inquiry_id)}">
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

/* ----- inquiries ----- */

function renderInquiries() {
  els.title.textContent = t("inquiries");
  const list = filteredInquiries();
  els.subtitle.textContent = `${list.length} ${t("inquiryCount")} · ${unansweredNew().length} ${t("newInquiries")}`;
  els.content.innerHTML = list.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("customer")}</th><th>${t("country")}</th><th>${t("channel")}</th><th>${t("productInterest")}</th><th>${t("stage")}</th><th class="num">${t("value")}</th><th>${t("lastMessage")}</th><th>${t("followUp")}</th><th>${t("owner")}</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (item) => `
            <tr class="row-link" data-href="#/inquiries/${encodeURIComponent(item.inquiry_id)}">
              <td>
                <a href="#/inquiries/${encodeURIComponent(item.inquiry_id)}"><strong>${escapeHtml(item.customer?.name || "")}</strong></a>
                ${item.unread ? '<span class="unread-dot" aria-hidden="true"></span>' : ""}
                <div class="muted">${escapeHtml(item.customer?.company || "")}</div>
              </td>
              <td>${countryCell(item.customer?.country)}</td>
              <td>${channelBadge(item.channel)}</td>
              <td class="interest">${escapeHtml(item.product_interest || "")}</td>
              <td>${stageChip(item.stage)}</td>
              <td class="num">${money(item.value_estimate, item.currency)}</td>
              <td><span class="muted">${waitingLabel(item.last_message_at)}</span></td>
              <td>${item.next_follow_up ? `<span class="${isFollowUpOverdue(item) ? "overdue" : "muted"}">${dateOnly(item.next_follow_up)}${isFollowUpOverdue(item) ? ` · ${t("followUpOverdue")}` : ""}</span>` : "—"}</td>
              <td>${escapeHtml(item.owner || "")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

function renderInquiryDetail() {
  const inquiry = inquiryById(state.route.id);
  if (!inquiry) {
    renderInquiries();
    return;
  }
  els.title.textContent = `${inquiry.customer?.name || inquiry.inquiry_id}`;
  els.subtitle.textContent = [
    inquiry.customer?.company,
    enumLabel(inquiry.channel, "channel"),
    enumLabel(inquiry.stage, "stage"),
  ]
    .filter(Boolean)
    .join(" · ");
  const pending = pendingApprovalsFor(inquiry.inquiry_id);
  const draft = state.drafts[inquiry.inquiry_id];
  const prefill =
    draft !== undefined ? draft : !pending.length && inquiry.suggested_reply ? inquiry.suggested_reply : "";
  const showSuggestedNote = draft === undefined && !pending.length && Boolean(inquiry.suggested_reply);
  const locked = isLocked();
  const linkedQuotes = (inquiry.quote_ids || []).map((id) => quoteById(id)).filter(Boolean);
  const linkedProducts = (inquiry.product_ids || []).map((id) => productById(id)).filter(Boolean);
  const followUpValue =
    state.followUps[inquiry.inquiry_id] !== undefined
      ? state.followUps[inquiry.inquiry_id]
      : inquiry.next_follow_up || "";
  els.content.innerHTML = `
    <button class="back-to-list" type="button" data-action="back" data-target="inquiries">← ${t("backToInquiries")}</button>
    <section class="detail">
      <div class="detail-main conv-detail">
        <div class="transcript">
          ${(inquiry.messages || [])
            .map(
              (message) => `
            <div class="bubble-row ${message.direction === "outgoing" ? "out" : "in"}">
              <div class="bubble">
                <div class="bubble-meta"><strong>${escapeHtml(message.sender)}</strong><span>${dateTime(message.sent_at)}</span></div>
                <div class="bubble-text">${escapeHtml(message.text)}</div>
                ${message.attachment ? `<div class="bubble-attachment">${escapeHtml(message.attachment)}</div>` : ""}
              </div>
            </div>
          `,
            )
            .join("")}
          ${pending
            .map(
              (item) => `
            <div class="bubble-row out">
              <div class="bubble queued-bubble">
                <div class="bubble-meta">
                  <strong>${escapeHtml(enumLabel(item.kind, "kind"))} #${item.ref}</strong>
                  <span class="status-chip ${escapeHtml(item.status)}">${t("queued")} · ${escapeHtml(enumLabel(item.status))}</span>
                </div>
                <div class="bubble-text">${escapeHtml(item.text)}</div>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
        <div class="composer">
          ${showSuggestedNote ? `<div class="composer-hint">${t("agentSuggestedPrefill")}</div>` : ""}
          <textarea id="composer-text" rows="4" placeholder="${escapeHtml(t("replyPlaceholder"))}" ${locked ? "disabled" : ""}>${escapeHtml(prefill)}</textarea>
          <input id="composer-note" type="text" placeholder="${escapeHtml(t("notePlaceholder"))}" value="${escapeHtml(state.notes[inquiry.inquiry_id] || "")}" ${locked ? "disabled" : ""}>
          <div class="composer-actions">
            <div class="follow-up-field">
              <label for="follow-up-date">${t("followUp")}</label>
              <input id="follow-up-date" type="date" value="${escapeHtml(followUpValue)}" ${locked ? "disabled" : ""}>
              <button type="button" data-action="save-follow-up" data-inquiry="${escapeHtml(inquiry.inquiry_id)}" ${locked ? "disabled" : ""}>${t("saveFollowUp")}</button>
            </div>
            <button type="button" class="primary" data-action="queue-reply" data-inquiry="${escapeHtml(inquiry.inquiry_id)}" ${locked ? "disabled" : ""}>${t("queueReply")}</button>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("customer")}</h2>
        <dl>
          <dt>${t("company")}</dt><dd>${escapeHtml(inquiry.customer?.company || "")}</dd>
          <dt>${t("country")}</dt><dd>${countryCell(inquiry.customer?.country)}</dd>
          <dt>${t("source")}</dt><dd>${escapeHtml(inquiry.customer?.source || "")}</dd>
          <dt>${t("channel")}</dt><dd>${channelBadge(inquiry.channel)}</dd>
          <dt>${t("stage")}</dt><dd>${stageChip(inquiry.stage)}</dd>
          <dt>${t("value")}</dt><dd>${money(inquiry.value_estimate, inquiry.currency)}</dd>
          <dt>${t("owner")}</dt><dd>${escapeHtml(inquiry.owner || "")}</dd>
          <dt>${t("followUp")}</dt><dd>${inquiry.next_follow_up ? `${dateOnly(inquiry.next_follow_up)}${isFollowUpOverdue(inquiry) ? ` <span class="overdue">· ${t("followUpOverdue")}</span>` : ""}` : "—"}</dd>
        </dl>
        <h2>${t("linkedProducts")}</h2>
        ${
          linkedProducts.length
            ? linkedProducts
                .map(
                  (product) => `
          <a class="side-row" href="#/products/${encodeURIComponent(product.product_id)}">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="muted">${escapeHtml(product.sku)} · ${t("moq")} ${product.moq} · ${money(product.price_min, product.currency)}–${money(product.price_max, product.currency)}</span>
          </a>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
        <h2>${t("quoteHistory")}</h2>
        ${
          linkedQuotes.length
            ? linkedQuotes
                .map(
                  (quote) => `
          <a class="side-row" href="#/quotes/${encodeURIComponent(quote.quote_id)}">
            <strong>${escapeHtml(quote.quote_no)} ${statusChip(quote.status)}</strong>
            <span class="muted">${money(quote.total, quote.currency)} · ${t("validity")} ${dateOnly(quote.valid_until)}</span>
          </a>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
      </aside>
    </section>
  `;
  const composer = els.content.querySelector("#composer-text");
  composer?.addEventListener("input", () => {
    state.drafts[inquiry.inquiry_id] = composer.value;
  });
  const note = els.content.querySelector("#composer-note");
  note?.addEventListener("input", () => {
    state.notes[inquiry.inquiry_id] = note.value;
  });
  const followUp = els.content.querySelector("#follow-up-date");
  followUp?.addEventListener("input", () => {
    state.followUps[inquiry.inquiry_id] = followUp.value;
  });
}

export function render() {
  renderShell();
  if (state.route.view === "inquiries" && state.route.id) renderInquiryDetail();
  else if (state.route.view === "inquiries") renderInquiries();
  else if (state.route.view === "quotes" && state.route.id) renderQuoteDetail();
  else if (state.route.view === "quotes") renderQuotes();
  else if (state.route.view === "approvals") renderApprovals();
  else if (state.route.view === "products" && state.route.id) renderProductDetail();
  else if (state.route.view === "products") renderProducts();
  else if (state.route.view === "settings") renderSettings();
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
  state.query = els.search.value;
  render();
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
els.content.addEventListener("click", (event) => {
  const row = event.target.closest(".row-link");
  if (row && !event.target.closest("a") && !event.target.closest("button")) {
    location.hash = row.dataset.href.replace(/^#/, "");
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "back") {
    location.hash = `#/${button.dataset.target || "inquiries"}`;
    return;
  }
  if (button.dataset.action === "queue-reply") {
    queueReplyAction(button.dataset.inquiry);
    return;
  }
  if (button.dataset.action === "save-follow-up") {
    saveFollowUpAction(button.dataset.inquiry);
    return;
  }
  if (button.dataset.action === "save-quote") {
    saveQuoteAction(button.dataset.quote);
    return;
  }
  if (button.dataset.action === "decide") {
    decideAction(button.dataset.item, button.dataset.decision, button.closest("[data-item-card]"));
  }
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
