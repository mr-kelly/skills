import { messages } from "./i18n/messages.js";
import {
  decideAction,
  renderKbDetail,
  renderKnowledge,
  renderSettings,
  renderSla,
  saveReplyAction,
  saveSlaAction,
  toLocalDatetime,
} from "./js/service-views.js";

const FEATURED_DEMO_TICKET = "tk-ochoa-refund";
const OPEN_STATUSES = ["needs_review", "changes_requested", "approved"];
const WORKFLOW_FILTERS = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  drafts: {},
  notes: {},
  slas: {},
  edits: {},
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-support-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoRef: 100,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-support.sidebarCollapsed";

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
  slaCount: document.querySelector("#count-sla"),
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

export function activeLang() {
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

export function referenceNow() {
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

export function slaCountdown(dueBy) {
  if (!dueBy) return { text: "—", overdue: false };
  const diff = new Date(dueBy).getTime() - referenceNow();
  const overdue = diff < 0;
  const minutes = Math.floor(Math.abs(diff) / 60000);
  const zh = activeLang() === "zh";
  let magnitude;
  if (minutes < 60) magnitude = `${minutes}${zh ? " 分钟" : "m"}`;
  else if (minutes < 1440) magnitude = `${Math.floor(minutes / 60)}${zh ? " 小时" : "h"}`;
  else magnitude = `${Math.floor(minutes / 1440)}${zh ? " 天" : "d"}`;
  return { text: overdue ? `${magnitude} ${t("slaBreached")}` : `${magnitude} ${t("slaDue")}`, overdue };
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
    scenario === "tickets"
      ? "#/tickets"
      : scenario === "detail"
        ? `#/tickets/${FEATURED_DEMO_TICKET}`
        : scenario === "knowledge"
          ? "#/knowledge"
          : scenario === "sla"
            ? "#/sla"
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

/* ----- accessors ----- */

export function tickets() {
  return state.snapshot?.tickets || [];
}

export function knowledge() {
  return state.snapshot?.knowledge_base || [];
}

export function ticketById(id) {
  return tickets().find((item) => item.ticket_id === id);
}

export function kbById(id) {
  return knowledge().find((item) => item.article_id === id);
}

export function breachingTickets() {
  return tickets().filter((item) => item.sla?.breached);
}

function gateBlockedTickets() {
  return tickets().filter((item) => item.quality_gate?.verdict === "block" && item.status !== "blocked");
}

function isLocked() {
  return Boolean(state.settings?.lock);
}

function customerLabel(customer) {
  if (!customer) return "";
  return [customer.name, customer.company].filter(Boolean).join(" · ");
}

/* ----- shell ----- */

function renderShell() {
  applyI18n();
  const needsReview = tickets().filter((item) => item.status === "needs_review").length;
  const breaching = breachingTickets().length;
  const blocked = gateBlockedTickets().length;
  els.syncStatus.textContent = tickets().length
    ? `${tickets().length} ${t("ticketCount")} · ${knowledge().length} KB`
    : t("empty");
  if (els.approvalsCount) els.approvalsCount.textContent = needsReview;
  if (els.slaCount) els.slaCount.textContent = breaching;
  if (els.blockedCount) els.blockedCount.textContent = blocked;
  if (els.mobileViewTitle) {
    const ticket = state.route.view === "tickets" && state.route.id ? ticketById(state.route.id) : null;
    els.mobileViewTitle.textContent = ticket ? ticket.customer?.name || ticket.ticket_id : viewLabel(state.route.view);
  }
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = needsReview
      ? `${needsReview} ${t("awaitingApproval")}`
      : `${tickets().length} ${t("ticketCount")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  const filterActive = state.route.view === "tickets" ? state.route.id || "all" : "";
  document.querySelectorAll("[data-filter]").forEach((link) => {
    link.classList.toggle("active", link.dataset.filter === filterActive);
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
  setMobileDetailOpen(
    Boolean(state.route.id) && state.route.view === "tickets" && !WORKFLOW_FILTERS.includes(state.route.id),
  );
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
  if (view === "tickets") return t("tickets");
  if (view === "knowledge") return t("knowledge");
  if (view === "sla") return t("sla");
  if (view === "settings") return t("settings");
  return t("overview");
}

/* ----- chips ----- */

function channelBadge(channel) {
  return `<span class="channel-badge ${escapeHtml(channel)}"><span class="dot"></span>${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

function categoryChip(category) {
  return `<span class="category-chip ${escapeHtml(category)}">${escapeHtml(enumLabel(category, "category"))}</span>`;
}

export function priorityChip(priority) {
  return `<span class="priority-chip ${escapeHtml(priority)}">${escapeHtml(enumLabel(priority, "priority"))}</span>`;
}

function statusChip(status) {
  return `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function actionChip(action) {
  const risky = action === "refund" || action === "escalate";
  return `<span class="action-chip ${risky ? "risky" : ""}">${escapeHtml(enumLabel(action, "action"))}${risky ? " ⚑" : ""}</span>`;
}

function gateBadge(gate) {
  if (!gate) return "";
  const verdict = gate.verdict || "ship";
  return `<span class="gate-badge ${escapeHtml(verdict)}" title="${escapeHtml(gate.summary || "")}">⛩ ${escapeHtml(enumLabel(verdict, "verdict"))} · ${gate.score}</span>`;
}

function countryCell(country) {
  return `<span class="country">${flagEmoji(country)} ${escapeHtml(String(country || "").toUpperCase())}</span>`;
}

export function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
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

function barsSvg(entries, { colorFor } = {}) {
  const rows = entries.filter(([, count]) => count >= 0);
  const max = Math.max(1, ...rows.map(([, count]) => count));
  const rowH = 30;
  const labelW = 96;
  const barMax = 240;
  const width = labelW + barMax + 40;
  const height = Math.max(1, rows.length) * rowH;
  const body = rows
    .map(([label, count], index) => {
      const y = index * rowH;
      const barW = Math.max(3, Math.round((count / max) * barMax));
      const fill = colorFor ? colorFor(label) : "#4b6bfb";
      return `
        <text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" class="bar-label">${escapeHtml(label)}</text>
        <rect x="${labelW}" y="${y + 6}" width="${barMax}" height="${rowH - 12}" rx="5" class="bar-track"></rect>
        <rect x="${labelW}" y="${y + 6}" width="${barW}" height="${rowH - 12}" rx="5" fill="${fill}"></rect>
        <text x="${labelW + barW + 8}" y="${y + rowH / 2 + 4}" class="bar-count">${count}</text>
      `;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="bar-svg" role="img" aria-label="bars">${body}</svg>`;
}

export function csatTrendSvg(trend) {
  if (!trend?.length) return `<div class="empty-inline">—</div>`;
  const width = 320;
  const height = 90;
  const padX = 24;
  const padY = 14;
  const min = 1;
  const max = 5;
  const stepX = trend.length > 1 ? (width - padX * 2) / (trend.length - 1) : 0;
  const points = trend.map((point, index) => {
    const x = padX + index * stepX;
    const y = padY + (1 - (point.score - min) / (max - min)) * (height - padY * 2);
    return [x, y, point];
  });
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const dots = points
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="trend-dot"></circle>`)
    .join("");
  const labels = points
    .map(
      ([x], index) =>
        `<text x="${x.toFixed(1)}" y="${height - 1}" text-anchor="middle" class="trend-label">${escapeHtml(trend[index].label)}</text>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="trend-svg" role="img" aria-label="${escapeHtml(t("csatTrend"))}">
    <path d="${path}" class="trend-line" fill="none"></path>${dots}${labels}
  </svg>`;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const needsReview = tickets().filter((item) => item.status === "needs_review").length;
  const breaching = breachingTickets().length;
  const blocked = gateBlockedTickets().length;
  const week = metrics.tickets_this_week || { total: 0, by_channel: {} };
  const zh = activeLang() === "zh";
  const frMedian =
    metrics.first_response_median_minutes >= 60
      ? `${Math.round(metrics.first_response_median_minutes / 6) / 10}${zh ? " 小时" : "h"}`
      : `${metrics.first_response_median_minutes || 0}${zh ? " 分钟" : "m"}`;
  const channelBits = Object.entries(week.by_channel || {})
    .map(([channel, count]) => `${channelBadge(channel)} <strong class="channel-count">${count}</strong>`)
    .join(" ");
  els.content.innerHTML = `
    <div class="metrics">
      <a class="metric ${needsReview ? "warn" : ""}" href="#/tickets/needs_review"><span>${t("awaitingApproval")}</span><strong>${needsReview}</strong></a>
      <a class="metric" href="#/tickets"><span>${t("open")}</span><strong>${metrics.open_count || 0}</strong></a>
      <a class="metric ${breaching ? "bad" : ""}" href="#/sla"><span>${t("breachingSla")}</span><strong>${breaching}</strong></a>
      <a class="metric ${blocked ? "bad" : ""}" href="#/tickets/needs_review"><span>${t("gateBlocked")}</span><strong>${blocked}</strong></a>
    </div>
    <div class="metrics kpis">
      <div class="metric"><span>${t("ticketsThisWeek")}</span><strong>${week.total || 0}</strong><small class="channel-mix">${channelBits}</small></div>
      <div class="metric"><span>${t("firstResponse")}</span><strong>${frMedian}</strong></div>
      <a class="metric" href="#/sla"><span>${t("csatAverage")}</span><strong>${metrics.csat_average || 0} <small class="inline-muted">/ 5</small></strong><small>${metrics.csat_responses || 0} ${t("csatResponses")}</small></a>
      <a class="metric" href="#/sla"><span>${t("resolved")}</span><strong>${metrics.resolved_count || 0}</strong></a>
    </div>
    ${warningsHtml()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("volumeByChannel")}</h2>
        ${barsSvg(
          Object.entries(week.by_channel || {}).map(([ch, n]) => [enumLabel(ch, "channel"), n]),
          { colorFor: () => "#4b6bfb" },
        )}
      </div>
      <div class="overview-panel">
        <h2>${t("byCategory")}</h2>
        ${barsSvg(
          Object.entries(metrics.by_category || {}).map(([cat, n]) => [enumLabel(cat, "category"), n]),
          { colorFor: () => "#7c5cfc" },
        )}
      </div>
      <div class="overview-panel">
        <h2>${t("csatTrend")}</h2>
        ${csatTrendSvg(metrics.csat_trend)}
      </div>
    </section>
  `;
}

/* ----- tickets ----- */

function filteredTickets() {
  const filter = WORKFLOW_FILTERS.includes(state.route.id) ? state.route.id : "all";
  return tickets()
    .filter((item) => (filter === "all" ? true : item.status === filter))
    .filter((item) =>
      matchesQuery([
        item.customer?.name,
        item.customer?.company,
        item.subject,
        item.category,
        item.channel,
        item.priority,
        item.status,
        `#${item.ref}`,
        ...(item.messages || []).slice(-3).map((m) => m.text),
      ]),
    );
}

function renderTickets() {
  const filter = WORKFLOW_FILTERS.includes(state.route.id) ? state.route.id : "all";
  els.title.textContent = filter === "all" ? t("tickets") : `${t("tickets")} · ${enumLabel(filter)}`;
  const list = filteredTickets();
  const needsReview = tickets().filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${list.length} ${t("ticketCount")} · ${needsReview} ${t("needsReviewFilter")}`;
  els.content.innerHTML = list.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("ref")}</th><th>${t("customer")}</th><th>${t("subject")}</th><th>${t("channel")}</th><th>${t("category")}</th><th>${t("priority")}</th><th>${t("proposedAction")}</th><th>${t("gate")}</th><th>${t("status")}</th><th>SLA</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map((item) => {
              const sla = item.sla?.breached
                ? slaCountdown(item.sla.due_by)
                : { text: waitingLabel(item.last_message_at), overdue: false };
              return `
            <tr class="row-link" data-href="#/tickets/${encodeURIComponent(item.ticket_id)}">
              <td class="num">#${item.ref}</td>
              <td>
                <a href="#/tickets/${encodeURIComponent(item.ticket_id)}"><strong>${escapeHtml(item.customer?.name || "")}</strong></a>
                ${item.unread ? '<span class="unread-dot" aria-hidden="true"></span>' : ""}
                <div class="muted">${countryCell(item.customer?.country)}</div>
              </td>
              <td class="subject-cell">${escapeHtml(item.subject || "")}</td>
              <td>${channelBadge(item.channel)}</td>
              <td>${categoryChip(item.category)}</td>
              <td>${priorityChip(item.priority)}</td>
              <td>${actionChip(item.proposed_action)}</td>
              <td>${gateBadge(item.quality_gate)}</td>
              <td>${statusChip(item.status)}</td>
              <td><span class="${item.sla?.breached ? "overdue" : "muted"}">${escapeHtml(sla.text)}</span></td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("noTickets")}</div>`;
}

function gateHtml(gate) {
  if (!gate) return "";
  const verdict = gate.verdict || "ship";
  return `
    <div class="gate-panel ${escapeHtml(verdict)}">
      <div class="gate-head">
        <strong>⛩ support-qa</strong>
        <span class="gate-badge ${escapeHtml(verdict)}">${escapeHtml(enumLabel(verdict, "verdict"))} · ${gate.score}</span>
      </div>
      <div class="gate-summary">${escapeHtml(gate.summary || "")}</div>
      <ul class="gate-checks">
        ${(gate.checks || [])
          .map(
            (check) =>
              `<li class="${check.ok ? "ok" : "fail"}"><span aria-hidden="true">${check.ok ? "✓" : "✗"}</span> ${escapeHtml(check.message)}</li>`,
          )
          .join("")}
      </ul>
    </div>
  `;
}

function renderTicketDetail() {
  const ticket = ticketById(state.route.id);
  if (!ticket) {
    renderTickets();
    return;
  }
  els.title.textContent = ticket.subject || ticket.ticket_id;
  els.subtitle.textContent = [
    ticket.customer?.name,
    enumLabel(ticket.channel, "channel"),
    enumLabel(ticket.category, "category"),
    enumLabel(ticket.status),
  ]
    .filter(Boolean)
    .join(" · ");
  const locked = isLocked();
  const editable = ticket.status !== "done" && ticket.status !== "blocked";
  const draft = state.drafts[ticket.ticket_id];
  const replyValue = draft !== undefined ? draft : ticket.suggested_reply || "";
  const kbRefs = (ticket.kb_refs || []).map((id) => kbById(id)).filter(Boolean);
  const danglingRefs = (ticket.kb_refs || []).filter((id) => !kbById(id));
  const slaValue =
    state.slas[ticket.ticket_id] !== undefined ? state.slas[ticket.ticket_id] : toLocalDatetime(ticket.sla?.due_by);
  els.content.innerHTML = `
    <button class="back-to-list" type="button" data-action="back">← ${t("backToTickets")}</button>
    <section class="detail">
      <div class="detail-main conv-detail">
        <div class="transcript">
          ${(ticket.messages || [])
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
        </div>
        ${ticket.reason ? `<div class="approval-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(ticket.reason)}</div>` : ""}
        ${gateHtml(ticket.quality_gate)}
        <div class="composer">
          ${editable ? `<div class="composer-hint">${t("agentSuggestedReply")}</div>` : ""}
          ${
            editable
              ? `<textarea id="composer-text" rows="5" placeholder="${escapeHtml(t("agentSuggestedReply"))}" ${locked ? "disabled" : ""}>${escapeHtml(replyValue)}</textarea>`
              : `<div class="approval-sent-text">${escapeHtml(ticket.suggested_reply || "—")}</div>`
          }
          ${
            kbRefs.length || danglingRefs.length
              ? `<div class="kb-ref-row"><span class="muted">${t("kbRefs")}:</span> ${kbRefs
                  .map(
                    (a) =>
                      `<a class="badge" href="#/knowledge/${encodeURIComponent(a.article_id)}">${escapeHtml(a.title)}</a>`,
                  )
                  .join(
                    " ",
                  )} ${danglingRefs.map((id) => `<span class="badge bad">${escapeHtml(id)} ✗</span>`).join(" ")}</div>`
              : `<div class="kb-ref-row muted">${t("noKbRefs")}</div>`
          }
          ${
            editable
              ? `
            <input id="composer-note" type="text" placeholder="${escapeHtml(t("notePlaceholder"))}" value="${escapeHtml(state.notes[ticket.ticket_id] || "")}" ${locked ? "disabled" : ""}>
            <div class="composer-actions">
              <input type="text" id="decision-comment" placeholder="${escapeHtml(t("commentPlaceholder"))}" ${locked ? "disabled" : ""}>
              <div class="approval-buttons">
                <button type="button" data-action="save-reply" data-ticket="${escapeHtml(ticket.ticket_id)}" ${locked ? "disabled" : ""}>${t("queueReply")}</button>
                <button type="button" class="primary" data-action="decide" data-ticket="${escapeHtml(ticket.ticket_id)}" data-decision="approve" ${locked ? "disabled" : ""}>${t("approve")}</button>
                <button type="button" data-action="decide" data-ticket="${escapeHtml(ticket.ticket_id)}" data-decision="request_changes" ${locked ? "disabled" : ""}>${t("requestChanges")}</button>
                <button type="button" class="danger" data-action="decide" data-ticket="${escapeHtml(ticket.ticket_id)}" data-decision="block" ${locked ? "disabled" : ""}>${t("block")}</button>
              </div>
            </div>
          `
              : ""
          }
          ${ticket.status === "approved" ? `<div class="approval-waiting">${t("waitingForSend")}</div>` : ""}
          ${ticket.decision?.comment ? `<div class="approval-reason"><span class="muted">${t("comment")}:</span> ${escapeHtml(ticket.decision.comment)} <small class="muted">(${t("decidedAt")} ${dateTime(ticket.decision.decided_at)})</small></div>` : ""}
          ${ticket.execution && ticket.execution.status === "executed" ? `<div class="approval-execution">${t("sentVia")} ${escapeHtml(enumLabel(ticket.execution.connector, "connector"))} · ${escapeHtml(ticket.execution.target || "")} ${ticket.execution.executed_at ? `· ${dateTime(ticket.execution.executed_at)}` : ""}</div>` : ""}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("customer")}</h2>
        <dl>
          <dt>${t("company")}</dt><dd>${escapeHtml(ticket.customer?.company || "—")}</dd>
          <dt>${t("source")}</dt><dd>${escapeHtml(ticket.customer?.email || ticket.customer?.handle || "—")}</dd>
          <dt>${t("plan")}</dt><dd>${escapeHtml(ticket.customer?.plan || "—")}</dd>
          <dt>${t("channel")}</dt><dd>${channelBadge(ticket.channel)}</dd>
          <dt>${t("category")}</dt><dd>${categoryChip(ticket.category)}</dd>
          <dt>${t("priority")}</dt><dd>${priorityChip(ticket.priority)}</dd>
          <dt>${t("proposedAction")}</dt><dd>${actionChip(ticket.proposed_action)}</dd>
          <dt>${t("owner")}</dt><dd>${escapeHtml(ticket.owner || "")}</dd>
        </dl>
        <h2>SLA</h2>
        <dl>
          <dt>${t("dueBy")}</dt><dd class="${ticket.sla?.breached ? "overdue" : ""}">${ticket.sla?.due_by ? `${dateTime(ticket.sla.due_by)}${ticket.sla?.breached ? ` · ${t("slaBreached")}` : ""}` : "—"}</dd>
        </dl>
        ${
          editable
            ? `
          <div class="sla-field">
            <input id="sla-due" type="datetime-local" value="${escapeHtml(slaValue)}" ${locked ? "disabled" : ""}>
            <button type="button" data-action="save-sla" data-ticket="${escapeHtml(ticket.ticket_id)}" ${locked ? "disabled" : ""}>${t("saveSla")}</button>
          </div>
        `
            : ""
        }
        ${ticket.csat ? `<h2>${t("csat")}</h2><div class="csat-side">${csatStars(ticket.csat.score)} ${ticket.csat.comment ? `<p class="side-text">"${escapeHtml(ticket.csat.comment)}"</p>` : ""}</div>` : ""}
      </aside>
    </section>
  `;
  const composer = els.content.querySelector("#composer-text");
  composer?.addEventListener("input", () => {
    state.drafts[ticket.ticket_id] = composer.value;
  });
  const note = els.content.querySelector("#composer-note");
  note?.addEventListener("input", () => {
    state.notes[ticket.ticket_id] = note.value;
  });
  const sla = els.content.querySelector("#sla-due");
  sla?.addEventListener("input", () => {
    state.slas[ticket.ticket_id] = sla.value;
  });
}

export function csatStars(score) {
  const full = Math.round(Number(score) || 0);
  return `<span class="csat-stars" title="${full}/5">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

export function render() {
  renderShell();
  if (state.route.view === "tickets" && state.route.id && !WORKFLOW_FILTERS.includes(state.route.id))
    renderTicketDetail();
  else if (state.route.view === "tickets") renderTickets();
  else if (state.route.view === "knowledge" && state.route.id) renderKbDetail();
  else if (state.route.view === "knowledge") renderKnowledge();
  else if (state.route.view === "sla") renderSla();
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
  localStorage.setItem("kelly-support-language", state.lang);
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
    location.hash = `#/${button.dataset.target || "tickets"}`;
    return;
  }
  if (button.dataset.action === "save-reply") {
    saveReplyAction(button.dataset.ticket);
    return;
  }
  if (button.dataset.action === "save-sla") {
    saveSlaAction(button.dataset.ticket);
    return;
  }
  if (button.dataset.action === "decide") {
    decideAction(button.dataset.ticket, button.dataset.decision);
  }
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
