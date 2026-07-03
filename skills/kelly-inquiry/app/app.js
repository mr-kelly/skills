import { messages } from "./i18n/messages.js";

const FEATURED_DEMO_INQUIRY = "wa-mueller-led-panels";
const PENDING_STATUSES = ["needs_review", "changes_requested", "approved"];
const ACTIVE_STAGES = ["new", "replied", "quoted", "negotiating"];
const FUNNEL_STAGES = ["new", "replied", "quoted", "negotiating", "won"];

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  drafts: {},
  notes: {},
  followUps: {},
  edits: {},
  quoteEdits: {},
  lang: normalizeLang(new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-inquiry-language") || "auto"),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoRef: 100
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-inquiry.sidebarCollapsed";

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
  approvalsCount: document.querySelector("#count-approvals"),
  newCount: document.querySelector("#count-new"),
  staleCount: document.querySelector("#count-stale"),
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

function money(value, currency = state.snapshot?.base_currency || "USD") {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function dateOnly(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
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

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts.slice(1).join("/") || "" };
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
  state.settings = data;
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = scenario === "inquiries"
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

function inquiries() {
  return state.snapshot?.inquiries || [];
}

function quotes() {
  return state.snapshot?.quotes || [];
}

function products() {
  return state.snapshot?.products || [];
}

function approvals() {
  return state.snapshot?.approvals || [];
}

function inquiryById(id) {
  return inquiries().find((item) => item.inquiry_id === id);
}

function quoteById(id) {
  return quotes().find((item) => item.quote_id === id);
}

function productById(id) {
  return products().find((item) => item.product_id === id);
}

function pendingApprovalsFor(inquiryId) {
  return approvals().filter((item) => item.inquiry_id === inquiryId && PENDING_STATUSES.includes(item.status));
}

function unansweredNew() {
  return inquiries().filter((item) => item.stage === "new" && !(item.messages || []).some((message) => message.direction === "outgoing"));
}

function oldestUnanswered() {
  return unansweredNew()
    .filter((item) => item.last_incoming_at)
    .sort((a, b) => String(a.last_incoming_at).localeCompare(String(b.last_incoming_at)))[0] || null;
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

function isLocked() {
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
  if (view === "inquiries") return t("inquiries");
  if (view === "quotes") return t("quotes");
  if (view === "approvals") return t("approvals");
  if (view === "products") return t("products");
  if (view === "settings") return t("settings");
  return t("overview");
}

function channelBadge(channel) {
  return `<span class="channel-badge ${escapeHtml(channel)}"><span class="dot"></span>${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

function stageChip(stage) {
  return `<span class="stage-chip ${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

function statusChip(status) {
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function countryCell(country) {
  return `<span class="country">${flagEmoji(country)} ${escapeHtml(String(country || "").toUpperCase())}</span>`;
}

function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function filteredInquiries() {
  return inquiries().filter((item) => matchesQuery([
    item.customer?.name,
    item.customer?.company,
    item.customer?.country,
    item.channel,
    item.stage,
    item.product_interest,
    item.owner,
    ...(item.messages || []).slice(-4).map((message) => message.text)
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
  els.subtitle.textContent = state.snapshot?.generated_at ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}` : t("empty");
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
  const medianLabel = metrics.reply_median_minutes >= 60
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
        ${stale.length ? stale.map((item) => `
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
        `).join("") : `<div class="empty-inline">—</div>`}
      </div>
    </section>
  `;
}

/* ----- inquiries ----- */

function renderInquiries() {
  els.title.textContent = t("inquiries");
  const list = filteredInquiries();
  els.subtitle.textContent = `${list.length} ${t("inquiryCount")} · ${unansweredNew().length} ${t("newInquiries")}`;
  els.content.innerHTML = list.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("customer")}</th><th>${t("country")}</th><th>${t("channel")}</th><th>${t("productInterest")}</th><th>${t("stage")}</th><th class="num">${t("value")}</th><th>${t("lastMessage")}</th><th>${t("followUp")}</th><th>${t("owner")}</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((item) => `
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
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<div class="empty">${t("empty")}</div>`;
}

function renderInquiryDetail() {
  const inquiry = inquiryById(state.route.id);
  if (!inquiry) {
    renderInquiries();
    return;
  }
  els.title.textContent = `${inquiry.customer?.name || inquiry.inquiry_id}`;
  els.subtitle.textContent = [inquiry.customer?.company, enumLabel(inquiry.channel, "channel"), enumLabel(inquiry.stage, "stage")].filter(Boolean).join(" · ");
  const pending = pendingApprovalsFor(inquiry.inquiry_id);
  const draft = state.drafts[inquiry.inquiry_id];
  const prefill = draft !== undefined ? draft : (!pending.length && inquiry.suggested_reply ? inquiry.suggested_reply : "");
  const showSuggestedNote = draft === undefined && !pending.length && Boolean(inquiry.suggested_reply);
  const locked = isLocked();
  const linkedQuotes = (inquiry.quote_ids || []).map((id) => quoteById(id)).filter(Boolean);
  const linkedProducts = (inquiry.product_ids || []).map((id) => productById(id)).filter(Boolean);
  const followUpValue = state.followUps[inquiry.inquiry_id] !== undefined ? state.followUps[inquiry.inquiry_id] : (inquiry.next_follow_up || "");
  els.content.innerHTML = `
    <button class="back-to-list" type="button" data-action="back" data-target="inquiries">← ${t("backToInquiries")}</button>
    <section class="detail">
      <div class="detail-main conv-detail">
        <div class="transcript">
          ${(inquiry.messages || []).map((message) => `
            <div class="bubble-row ${message.direction === "outgoing" ? "out" : "in"}">
              <div class="bubble">
                <div class="bubble-meta"><strong>${escapeHtml(message.sender)}</strong><span>${dateTime(message.sent_at)}</span></div>
                <div class="bubble-text">${escapeHtml(message.text)}</div>
                ${message.attachment ? `<div class="bubble-attachment">${escapeHtml(message.attachment)}</div>` : ""}
              </div>
            </div>
          `).join("")}
          ${pending.map((item) => `
            <div class="bubble-row out">
              <div class="bubble queued-bubble">
                <div class="bubble-meta">
                  <strong>${escapeHtml(enumLabel(item.kind, "kind"))} #${item.ref}</strong>
                  <span class="status-chip ${escapeHtml(item.status)}">${t("queued")} · ${escapeHtml(enumLabel(item.status))}</span>
                </div>
                <div class="bubble-text">${escapeHtml(item.text)}</div>
              </div>
            </div>
          `).join("")}
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
        ${linkedProducts.length ? linkedProducts.map((product) => `
          <a class="side-row" href="#/products/${encodeURIComponent(product.product_id)}">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="muted">${escapeHtml(product.sku)} · ${t("moq")} ${product.moq} · ${money(product.price_min, product.currency)}–${money(product.price_max, product.currency)}</span>
          </a>
        `).join("") : `<div class="empty-inline">—</div>`}
        <h2>${t("quoteHistory")}</h2>
        ${linkedQuotes.length ? linkedQuotes.map((quote) => `
          <a class="side-row" href="#/quotes/${encodeURIComponent(quote.quote_id)}">
            <strong>${escapeHtml(quote.quote_no)} ${statusChip(quote.status)}</strong>
            <span class="muted">${money(quote.total, quote.currency)} · ${t("validity")} ${dateOnly(quote.valid_until)}</span>
          </a>
        `).join("") : `<div class="empty-inline">—</div>`}
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

/* ----- quotes ----- */

function renderQuotes() {
  els.title.textContent = t("quotes");
  const list = quotes().filter((quote) => matchesQuery([
    quote.quote_no,
    quote.customer,
    quote.status,
    quote.terms,
    ...(quote.items || []).map((item) => item.sku)
  ]));
  els.subtitle.textContent = `${list.length} ${t("quoteCount")} · ${state.snapshot?.metrics?.quotes_sent || 0} ${t("quotesSent").toLowerCase()}`;
  els.content.innerHTML = list.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("quotes")}</th><th>${t("customer")}</th><th>${t("items")}</th><th>${t("currency")}</th><th class="num">${t("total")}</th><th>${t("issueDate")}</th><th>${t("validity")}</th><th>${t("status")}</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((quote) => `
            <tr class="row-link" data-href="#/quotes/${encodeURIComponent(quote.quote_id)}">
              <td><a href="#/quotes/${encodeURIComponent(quote.quote_id)}"><strong>${escapeHtml(quote.quote_no)}</strong></a></td>
              <td class="interest">${escapeHtml(quote.customer || "")}</td>
              <td>${(quote.items || []).length}</td>
              <td>${escapeHtml(quote.currency)}</td>
              <td class="num">${money(quote.total, quote.currency)}</td>
              <td>${dateOnly(quote.issue_date)}</td>
              <td>${dateOnly(quote.valid_until)}</td>
              <td>${statusChip(quote.status)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<div class="empty">${t("empty")}</div>`;
}

function quoteGuardHtml(quote) {
  const alerts = quote.pricing_alerts || [];
  if (!alerts.length) return `<div class="guard ok">${t("minPriceGuard")}: ${t("guardOk")}</div>`;
  return `<div class="guard tripped">${t("minPriceGuard")}: ${alerts.map((alert) => escapeHtml(alert.message)).join(" ")}</div>`;
}

function renderQuoteDetail() {
  const quote = quoteById(state.route.id);
  if (!quote) {
    renderQuotes();
    return;
  }
  els.title.textContent = quote.quote_no;
  els.subtitle.textContent = `${quote.customer || ""} · ${enumLabel(quote.status)}`;
  const locked = isLocked();
  const editable = quote.status === "draft" && !locked;
  const edits = state.quoteEdits[quote.quote_id] || { lines: {} };
  const inquiry = inquiryById(quote.inquiry_id);
  const productsById = new Map(products().map((product) => [product.product_id, product]));
  let liveSubtotal = 0;
  const rows = (quote.items || []).map((line) => {
    const patch = edits.lines[line.line_id] || {};
    const qty = patch.qty !== undefined ? Number(patch.qty) : line.qty;
    const unit = patch.unit_price !== undefined ? Number(patch.unit_price) : line.unit_price;
    const total = (Number(qty) || 0) * (Number(unit) || 0);
    liveSubtotal += total;
    const product = productsById.get(line.product_id);
    const below = product && typeof product.price_min === "number" && Number(unit) < product.price_min;
    return `
      <tr>
        <td><strong>${escapeHtml(line.sku)}</strong>${product ? `<div class="muted"><a href="#/products/${encodeURIComponent(product.product_id)}">${escapeHtml(product.name)}</a></div>` : ""}</td>
        <td class="interest">${escapeHtml(line.description || "")}</td>
        <td class="num">${editable
          ? `<input class="line-input" type="number" min="0" step="1" value="${qty}" data-line="${escapeHtml(line.line_id)}" data-field="qty">`
          : qty}</td>
        <td class="num">${editable
          ? `<input class="line-input" type="number" min="0" step="0.01" value="${unit}" data-line="${escapeHtml(line.line_id)}" data-field="unit_price">`
          : money(unit, quote.currency)}
          ${below ? `<div class="overdue guard-inline">${t("guardTripped")} (${money(product.price_min, quote.currency)})</div>` : ""}
        </td>
        <td class="num">${money(total, quote.currency)}</td>
      </tr>
    `;
  }).join("");
  els.content.innerHTML = `
    <button class="back-to-list" type="button" data-action="back" data-target="quotes">← ${t("backToQuotes")}</button>
    <section class="detail">
      <div class="detail-main">
        ${editable ? `<div class="composer-hint">${t("quoteEditHint")}</div>` : `<div class="muted quote-lock-hint">${quote.status === "draft" ? "" : t("quoteReadOnly")}</div>`}
        <div class="table-wrap quote-items">
          <table>
            <thead>
              <tr><th>${t("sku")}</th><th>${t("description")}</th><th class="num">${t("qty")}</th><th class="num">${t("unitPrice")}</th><th class="num">${t("total")}</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr><td colspan="4" class="num"><strong>${t("total")}</strong></td><td class="num"><strong id="quote-live-total">${money(liveSubtotal, quote.currency)}</strong></td></tr>
            </tfoot>
          </table>
        </div>
        ${quoteGuardHtml(quote)}
        ${editable ? `
          <div class="composer-actions">
            <div class="follow-up-field">
              <label for="quote-validity">${t("validity")}</label>
              <input id="quote-validity" type="date" value="${escapeHtml(edits.valid_until !== undefined ? edits.valid_until : quote.valid_until || "")}">
            </div>
            <button type="button" class="primary" data-action="save-quote" data-quote="${escapeHtml(quote.quote_id)}">${t("saveQuote")}</button>
          </div>
        ` : ""}
      </div>
      <aside class="detail-side">
        <h2>${t("quoteDetail")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${statusChip(quote.status)}</dd>
          <dt>${t("customer")}</dt><dd>${escapeHtml(quote.customer || "")}</dd>
          <dt>${t("issueDate")}</dt><dd>${dateOnly(quote.issue_date)}</dd>
          <dt>${t("validity")}</dt><dd>${dateOnly(quote.valid_until)}</dd>
          <dt>${t("subtotal")}</dt><dd>${money(quote.subtotal, quote.currency)}</dd>
          <dt>${t("total")}</dt><dd>${money(quote.total, quote.currency)}</dd>
          <dt>${t("linkedInquiry")}</dt><dd>${inquiry ? `<a href="#/inquiries/${encodeURIComponent(inquiry.inquiry_id)}">${escapeHtml(inquiry.customer?.name || inquiry.inquiry_id)}</a>` : "—"}</dd>
        </dl>
        <h2>${t("terms")}</h2>
        <p class="side-text">${escapeHtml(quote.terms || "—")}</p>
        <h2>${t("pricingNotes")}</h2>
        <p class="side-text">${escapeHtml(quote.pricing_notes || "—")}</p>
      </aside>
    </section>
  `;
  els.content.querySelectorAll(".line-input").forEach((input) => {
    input.addEventListener("input", () => {
      const entry = state.quoteEdits[quote.quote_id] || (state.quoteEdits[quote.quote_id] = { lines: {} });
      const line = entry.lines[input.dataset.line] || (entry.lines[input.dataset.line] = {});
      line[input.dataset.field] = input.value;
      const totalEl = els.content.querySelector("#quote-live-total");
      if (totalEl) {
        let subtotal = 0;
        for (const item of quote.items || []) {
          const patch = entry.lines[item.line_id] || {};
          const qty = patch.qty !== undefined ? Number(patch.qty) : item.qty;
          const unit = patch.unit_price !== undefined ? Number(patch.unit_price) : item.unit_price;
          subtotal += (Number(qty) || 0) * (Number(unit) || 0);
        }
        totalEl.textContent = money(subtotal, quote.currency);
      }
    });
  });
  const validity = els.content.querySelector("#quote-validity");
  validity?.addEventListener("input", () => {
    const entry = state.quoteEdits[quote.quote_id] || (state.quoteEdits[quote.quote_id] = { lines: {} });
    entry.valid_until = validity.value;
  });
}

/* ----- approvals ----- */

function renderApprovals() {
  els.title.textContent = t("approvals");
  const list = approvals().filter((item) => matchesQuery([
    item.text,
    item.reason,
    item.customer,
    item.channel,
    item.status,
    item.kind,
    `#${item.ref}`
  ]));
  const needsReview = approvals().filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${approvals().length} · ${needsReview} ${enumLabel("needs_review")}`;
  const locked = isLocked();
  els.content.innerHTML = list.length ? `
    <div class="approval-list">
      ${list.map((item) => {
        const editable = item.status !== "done";
        const value = state.edits[item.item_id] !== undefined ? state.edits[item.item_id] : item.text;
        const quote = item.quote_id ? quoteById(item.quote_id) : null;
        return `
          <article class="approval-card" data-item-card="${escapeHtml(item.item_id)}">
            <header class="approval-head">
              <strong>${escapeHtml(enumLabel(item.kind, "kind"))} #${item.ref}</strong>
              ${statusChip(item.status)}
              ${channelBadge(item.channel)}
              <a class="approval-target" href="#/inquiries/${encodeURIComponent(item.inquiry_id)}">${escapeHtml(item.customer || item.inquiry_id)}</a>
              ${quote ? `<a class="badge" href="#/quotes/${encodeURIComponent(quote.quote_id)}">${escapeHtml(quote.quote_no)}</a>` : ""}
              <small class="muted">${dateTime(item.created_at)}</small>
            </header>
            ${item.reason ? `<div class="approval-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</div>` : ""}
            ${item.note ? `<div class="approval-reason"><span class="muted">${t("note")}:</span> ${escapeHtml(item.note)}</div>` : ""}
            ${editable
              ? `<textarea class="approval-text" data-item-text rows="4" ${locked ? "disabled" : ""}>${escapeHtml(value)}</textarea>`
              : `<div class="approval-sent-text">${escapeHtml(item.text)}</div>`}
            ${item.decision?.comment ? `<div class="approval-reason"><span class="muted">${t("comment")}:</span> ${escapeHtml(item.decision.comment)} <small class="muted">(${t("decidedAt")} ${dateTime(item.decision.decided_at)})</small></div>` : ""}
            ${item.status === "approved" ? `<div class="approval-waiting">${t("waitingForSend")}</div>` : ""}
            ${item.execution ? `<div class="approval-execution">${t("sentVia")} ${escapeHtml(enumLabel(item.execution.connector, "connector"))} · ${t("target")} ${escapeHtml(item.execution.target || "")} · ${escapeHtml(enumLabel(item.execution.status))} ${item.execution.executed_at ? `· ${dateTime(item.execution.executed_at)}` : ""}</div>` : ""}
            ${editable ? `
              <div class="approval-actions">
                <input type="text" data-item-comment placeholder="${escapeHtml(t("commentPlaceholder"))}" ${locked ? "disabled" : ""}>
                <div class="approval-buttons">
                  <button type="button" class="primary" data-action="decide" data-item="${escapeHtml(item.item_id)}" data-decision="approve" ${locked ? "disabled" : ""}>${t("approve")}</button>
                  <button type="button" data-action="decide" data-item="${escapeHtml(item.item_id)}" data-decision="request_changes" ${locked ? "disabled" : ""}>${t("requestChanges")}</button>
                  <button type="button" data-action="decide" data-item="${escapeHtml(item.item_id)}" data-decision="revise" ${locked ? "disabled" : ""}>${t("saveEdit")}</button>
                  <button type="button" class="danger" data-action="decide" data-item="${escapeHtml(item.item_id)}" data-decision="block" ${locked ? "disabled" : ""}>${t("block")}</button>
                </div>
              </div>
            ` : ""}
          </article>
        `;
      }).join("")}
    </div>
  ` : `<div class="empty">${t("noApprovals")}</div>`;
  els.content.querySelectorAll("[data-item-text]").forEach((textarea) => {
    const card = textarea.closest("[data-item-card]");
    textarea.addEventListener("input", () => {
      state.edits[card.dataset.itemCard] = textarea.value;
    });
  });
}

/* ----- products ----- */

function renderProducts() {
  els.title.textContent = t("products");
  const list = products().filter((product) => matchesQuery([product.name, product.sku, product.category]));
  els.subtitle.textContent = `${list.length} ${t("productCount")}`;
  els.content.innerHTML = list.length ? `
    <div class="product-grid">
      ${list.map((product) => `
        <a class="product-card" href="#/products/${encodeURIComponent(product.product_id)}">
          <div class="row between">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="badge">${escapeHtml(product.sku)}</span>
          </div>
          <div class="muted">${escapeHtml(product.category || "")}</div>
          <dl class="product-meta">
            <dt>${t("moq")}</dt><dd>${product.moq}</dd>
            <dt>${t("priceRange")}</dt><dd>${money(product.price_min, product.currency)} – ${money(product.price_max, product.currency)}</dd>
            <dt>${t("leadTime")}</dt><dd>${product.lead_time_days} ${t("days")}</dd>
            <dt>${t("faq")}</dt><dd>${(product.faq || []).length} ${t("faqCount")}</dd>
          </dl>
        </a>
      `).join("")}
    </div>
  ` : `<div class="empty">${t("empty")}</div>`;
}

function renderProductDetail() {
  const product = productById(state.route.id);
  if (!product) {
    renderProducts();
    return;
  }
  els.title.textContent = product.name;
  els.subtitle.textContent = `${product.sku} · ${product.category || ""}`;
  const relatedInquiries = inquiries().filter((item) => (item.product_ids || []).includes(product.product_id));
  els.content.innerHTML = `
    <button class="back-to-list" type="button" data-action="back" data-target="products">← ${t("backToProducts")}</button>
    <section class="detail">
      <div class="detail-main">
        <div class="metrics kpis">
          <div class="metric"><span>${t("moq")}</span><strong>${product.moq}</strong></div>
          <div class="metric"><span>${t("priceRange")}</span><strong>${money(product.price_min, product.currency)} – ${money(product.price_max, product.currency)}</strong></div>
          <div class="metric"><span>${t("leadTime")}</span><strong>${product.lead_time_days} ${t("days")}</strong></div>
          <div class="metric"><span>${t("faq")}</span><strong>${(product.faq || []).length}</strong></div>
        </div>
        <div class="overview-panel faq-panel">
          <h2>${t("faq")}</h2>
          ${(product.faq || []).map((entry) => `
            <div class="faq-row">
              <strong>${escapeHtml(entry.q)}</strong>
              <p>${escapeHtml(entry.a)}</p>
            </div>
          `).join("") || `<div class="empty-inline">—</div>`}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("specs")}</h2>
        <dl>
          ${Object.entries(product.specs || {}).map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}
        </dl>
        <h2>${t("inquiries")}</h2>
        ${relatedInquiries.length ? relatedInquiries.map((item) => `
          <a class="side-row" href="#/inquiries/${encodeURIComponent(item.inquiry_id)}">
            <strong>${escapeHtml(item.customer?.name || "")}</strong>
            <span class="muted">${escapeHtml(item.customer?.company || "")} · ${escapeHtml(enumLabel(item.stage, "stage"))}</span>
          </a>
        `).join("") : `<div class="empty-inline">—</div>`}
      </aside>
    </section>
  `;
}

/* ----- settings ----- */

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const syncLog = state.snapshot?.sync_log || [];
  const report = state.settings?.execution_report;
  const guard = summary.quote_defaults?.min_price_guard;
  const sla = summary.follow_up?.sla_days;
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("productKb")}</dt><dd>${escapeHtml(summary.product_kb?.source_path || "—")}</dd>
          ${summary.reply_style ? `<dt>${t("replyStyle")}</dt><dd>${escapeHtml(summary.reply_style.tone || "")}</dd>` : ""}
        </dl>
      </section>
      <section>
        <h2>${t("quoteDefaults")}</h2>
        <dl>
          <dt>${t("currency")}</dt><dd>${escapeHtml(summary.quote_defaults?.currency || "—")}</dd>
          <dt>${t("validityDays")}</dt><dd>${escapeHtml(String(summary.quote_defaults?.validity_days ?? "—"))}</dd>
          <dt>${t("terms")}</dt><dd>${escapeHtml([summary.quote_defaults?.incoterm, summary.quote_defaults?.payment_terms].filter(Boolean).join(" · ") || "—")}</dd>
          <dt>${t("minPriceGuard")}</dt><dd>${guard ? (guard.enabled ? t("on") : t("off")) : "—"}</dd>
          <dt>${t("followUpSla")}</dt><dd>${sla ? Object.entries(sla).map(([stage, days]) => `${enumLabel(stage, "stage")}: ${days} ${t("days")}`).join(" · ") : "—"}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("accounts")}</h2>
        ${(summary.accounts || []).map((account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.channel, "channel"))} · ${escapeHtml(enumLabel(account.connector, "connector"))} ${account.handle ? `· ${escapeHtml(account.handle)}` : ""}</span>
            <span>${account.secret_envs.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
          </div>
        `).join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`}
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${syncLog.length ? syncLog.slice(-8).reverse().map((entry) => `
          <div class="settings-account">
            <strong>${escapeHtml(entry.account_id)}</strong>
            <span>${escapeHtml(enumLabel(entry.method, "connector"))} · ${dateTime(entry.at)}</span>
            <span>${escapeHtml(entry.message || "")}</span>
          </div>
        `).join("") : `<div class="empty-inline">—</div>`}
      </section>
      ${report ? `
        <section>
          <h2>${t("executionReport")}</h2>
          ${(report.results || []).map((result) => `
            <div class="settings-account">
              <strong>${escapeHtml(enumLabel(result.kind || "reply", "kind"))} #${result.ref}</strong>
              <span>${escapeHtml(enumLabel(result.status))} · ${escapeHtml(enumLabel(result.connector, "connector"))}</span>
              <span>${escapeHtml(result.detail || result.target || "")}</span>
            </div>
          `).join("")}
        </section>
      ` : ""}
    </div>
  `;
}

/* ----- actions ----- */

async function queueReplyAction(inquiryId) {
  const text = String(state.drafts[inquiryId] !== undefined
    ? state.drafts[inquiryId]
    : (els.content.querySelector("#composer-text")?.value || "")).trim();
  const note = String(state.notes[inquiryId] || "").trim();
  if (!text) return;
  if (state.settings?.demo) {
    const inquiry = inquiryById(inquiryId);
    state.demoRef += 1;
    state.snapshot.approvals.push({
      item_id: `approval-demo-local-${state.demoRef}`,
      ref: approvals().reduce((max, item) => Math.max(max, item.ref || 0), 0) + 1,
      kind: "reply",
      inquiry_id: inquiryId,
      quote_id: "",
      account_id: inquiry?.account_id || "",
      channel: inquiry?.channel || "",
      customer: [inquiry?.customer?.name, inquiry?.customer?.company].filter(Boolean).join(" · "),
      text,
      note,
      reason: "Queued from the inquiry composer.",
      suggested_by: "human",
      status: "needs_review",
      decision: null,
      execution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    delete state.drafts[inquiryId];
    delete state.notes[inquiryId];
    flashNotice(`${t("queuedNotice")} ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/approvals/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inquiry_id: inquiryId, text, note })
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Queue failed: ${res.status}`);
    return;
  }
  delete state.drafts[inquiryId];
  delete state.notes[inquiryId];
  flashNotice(t("queuedNotice"));
  await loadState();
}

async function decideAction(itemId, action, card) {
  const comment = String(card?.querySelector("[data-item-comment]")?.value || "").trim();
  const text = state.edits[itemId];
  if (state.settings?.demo) {
    const item = approvals().find((entry) => entry.item_id === itemId);
    if (!item) return;
    if (typeof text === "string" && text.trim()) item.text = text.trim();
    if (action === "approve") item.status = "approved";
    else if (action === "request_changes") item.status = "changes_requested";
    else if (action === "block") item.status = "blocked";
    item.decision = { action, comment, decided_at: new Date().toISOString() };
    delete state.edits[itemId];
    flashNotice(t("demoNotice"));
    render();
    return;
  }
  const res = await fetch("/api/approvals/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item_id: itemId, action, comment, text })
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Decision failed: ${res.status}`);
    return;
  }
  delete state.edits[itemId];
  await loadState();
}

async function saveFollowUpAction(inquiryId) {
  const value = String(els.content.querySelector("#follow-up-date")?.value || "");
  if (state.settings?.demo) {
    const inquiry = inquiryById(inquiryId);
    if (inquiry) inquiry.next_follow_up = value;
    delete state.followUps[inquiryId];
    flashNotice(`${t("followUpSaved")} ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/inquiries/followup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inquiry_id: inquiryId, next_follow_up: value })
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Save failed: ${res.status}`);
    return;
  }
  delete state.followUps[inquiryId];
  flashNotice(t("followUpSaved"));
  await loadState();
}

async function saveQuoteAction(quoteId) {
  const entry = state.quoteEdits[quoteId] || { lines: {} };
  const items = Object.entries(entry.lines).map(([line_id, patch]) => ({ line_id, ...patch }));
  const payload = { quote_id: quoteId, items };
  if (entry.valid_until !== undefined) payload.valid_until = entry.valid_until;
  if (state.settings?.demo) {
    const quote = quoteById(quoteId);
    if (quote) {
      for (const patch of items) {
        const line = (quote.items || []).find((item) => item.line_id === patch.line_id);
        if (!line) continue;
        if (patch.qty !== undefined) line.qty = Number(patch.qty) || 0;
        if (patch.unit_price !== undefined) line.unit_price = Number(patch.unit_price) || 0;
        line.total = Number((line.qty * line.unit_price).toFixed(2));
      }
      if (entry.valid_until !== undefined && entry.valid_until) quote.valid_until = entry.valid_until;
      quote.subtotal = Number((quote.items || []).reduce((sum, item) => sum + item.total, 0).toFixed(2));
      quote.total = quote.subtotal;
      quote.pricing_alerts = [];
      const productsById = new Map(products().map((product) => [product.product_id, product]));
      for (const line of quote.items || []) {
        const product = productsById.get(line.product_id);
        if (product && typeof product.price_min === "number" && line.unit_price < product.price_min) {
          quote.pricing_alerts.push({
            product_id: product.product_id,
            sku: product.sku,
            unit_price: line.unit_price,
            price_min: product.price_min,
            message: `${product.sku}: unit price ${line.unit_price} is below the KB floor ${product.price_min}.`
          });
        }
      }
    }
    delete state.quoteEdits[quoteId];
    flashNotice(`${t("quoteSaved")} ${t("demoNotice")}`);
    render();
    return;
  }
  const res = await fetch("/api/quotes/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    flashNotice(data.error || `Save failed: ${res.status}`);
    return;
  }
  delete state.quoteEdits[quoteId];
  flashNotice(t("quoteSaved"));
  await loadState();
}

function render() {
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
