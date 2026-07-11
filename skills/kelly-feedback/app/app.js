import { messages } from "./i18n/messages.js";
import {
  renderInbox,
  renderInboxDetail,
  renderRequestDetail,
  renderRequests,
  renderRoadmap,
  renderSettings,
} from "./js/feedback-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-feedback-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  edits: { draft: {}, note: {}, effort: {}, assign: {} },
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-feedback.sidebarCollapsed";

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
  decisionCount: document.querySelector("#count-decisions"),
  newCount: document.querySelector("#count-new"),
  needsInfoCount: document.querySelector("#count-needsinfo"),
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

function relativeTime(value) {
  if (!value) return t("notAvailable");
  const ref = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at) : new Date();
  const diffMs = ref.getTime() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  const rtf = new Intl.RelativeTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", { numeric: "always" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
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
    scenario === "inbox"
      ? "#/inbox"
      : scenario === "requests"
        ? "#/requests"
        : scenario === "roadmap"
          ? "#/roadmap"
          : scenario === "detail"
            ? "#/requests/req-csv-export"
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

export function feedbackItems() {
  return (state.snapshot?.feedback || []).map(effectiveFeedback);
}

export function requests() {
  return state.snapshot?.requests || [];
}

export function proposals() {
  return (state.snapshot?.proposals || []).map(effectiveProposal);
}

export function decisions() {
  return state.settings?.decisions || { proposals: {}, feedback: {}, requests: {} };
}

function effectiveProposal(proposal) {
  const decision = decisions().proposals?.[proposal.proposal_id];
  if (!decision) return proposal;
  const statusByAction = { approve: "approved", request_changes: "changes_requested", block: "blocked" };
  return {
    ...proposal,
    status: statusByAction[decision.action] || proposal.status,
    review_note: decision.review_note || proposal.review_note,
    draft: typeof decision.draft === "string" ? decision.draft : proposal.draft,
    decided_at: decision.decided_at || proposal.decided_at,
  };
}

function effectiveFeedback(item) {
  const decision = decisions().feedback?.[item.feedback_id];
  if (!decision) return item;
  const triageByAction = { assign: "clustered", ignore: "ignored", insight: "insight" };
  return {
    ...item,
    triage: triageByAction[decision.action] || item.triage,
    request_id: decision.action === "assign" ? decision.request_id || item.request_id : item.request_id,
  };
}

function decisionsWaiting() {
  return proposals().filter((item) => item.status === "needs_review").length;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const waiting = decisionsWaiting();
  const fresh = feedbackItems().filter((item) => item.triage === "new").length;
  const needsInfo = requests().filter((item) => item.status === "needs_info").length;
  const total = feedbackItems().length;
  els.syncStatus.textContent =
    snapshot && total ? `${total} ${t("items")} · ${requests().length} ${t("requests").toLowerCase()}` : t("empty");
  if (els.decisionCount) els.decisionCount.textContent = waiting;
  if (els.newCount) els.newCount.textContent = fresh;
  if (els.needsInfoCount) els.needsInfoCount.textContent = needsInfo;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = waiting
      ? `${waiting} ${t("decisionsWaiting")}`
      : fresh
        ? `${fresh} ${t("newUncategorized")}`
        : `${total} ${t("items")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "inbox") return t("inbox");
  if (view === "requests") return t("requests");
  if (view === "roadmap") return t("roadmap");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  return `<div class="lock-banner">${escapeHtml(t("lockActive"))}${state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : ""}</div>`;
}

export function channelBadge(channel) {
  return `<span class="channel-badge channel-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

export function sentimentBadge(sentiment) {
  return `<span class="sentiment ${escapeHtml(sentiment)}">${escapeHtml(enumLabel(sentiment, "sentiment"))}</span>`;
}

export function triageBadge(triage) {
  return `<span class="triage-badge triage-${escapeHtml(triage)}">${escapeHtml(enumLabel(triage, "triage"))}</span>`;
}

export function statusBadge(status) {
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function trendArrow(trend) {
  const glyph = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return `<span class="trend trend-${escapeHtml(trend)}" title="${escapeHtml(enumLabel(trend, "trend"))}">${glyph} ${escapeHtml(enumLabel(trend, "trend"))}</span>`;
}

export function productName(productId) {
  return state.snapshot?.products?.find((product) => product.product_id === productId)?.display_name || productId;
}

function requestById(requestId) {
  return requests().find((item) => item.request_id === requestId);
}

export function requestLink(requestId) {
  const request = requestById(requestId);
  if (!request) return `<span class="muted">${escapeHtml(t("noRequest"))}</span>`;
  return `<a class="request-link" href="#/requests/${encodeURIComponent(request.request_id)}">${escapeHtml(request.title)}</a>`;
}

export function preview(text, length = 110) {
  const value = String(text || "");
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

// ---------- Overview ----------

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const waiting = decisionsWaiting();
  const fresh = feedbackItems().filter((item) => item.triage === "new").length;
  const needsInfo = requests().filter((item) => item.status === "needs_info").length;
  els.content.innerHTML = `
    ${lockBanner()}
    <div class="metrics attention-cards">
      <a class="metric attention-card" href="#/roadmap"><span>${t("decisionsWaiting")}</span><strong>${waiting}</strong></a>
      <a class="metric attention-card" href="#/inbox"><span>${t("newUncategorized")}</span><strong>${fresh}</strong></a>
      <a class="metric attention-card" href="#/requests"><span>${t("needsInfo")}</span><strong>${needsInfo}</strong></a>
      <a class="metric attention-card" href="#/inbox"><span>${t("feedback")}</span><strong>${metrics.feedback_count ?? feedbackItems().length}</strong></a>
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("inflowThisWeek")}</h2>
        ${inflowPanel()}
      </div>
      <div class="overview-panel">
        <h2>${t("sentimentSplit")}</h2>
        ${sentimentPanel()}
      </div>
      <div class="overview-panel">
        <h2>${t("topClusters")}</h2>
        ${topClustersPanel()}
      </div>
      <div class="overview-panel">
        <h2>${t("freshnessBySource")}</h2>
        ${freshnessPanel()}
      </div>
    </section>
  `;
}

function inflowPanel() {
  const inflow = state.snapshot?.metrics?.week_inflow || {};
  const entries = Object.entries(inflow).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty">${t("empty")}</div>`;
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return entries
    .map(
      ([channel, count]) => `
    <div class="inflow-row">
      ${channelBadge(channel)}
      <span class="inflow-bar"><span style="width:${Math.round((count / max) * 100)}%"></span></span>
      <strong class="num">${count}</strong>
    </div>
  `,
    )
    .join("");
}

function sentimentPanel() {
  const sentiment = state.snapshot?.metrics?.sentiment || {};
  const rows = [
    ["positive", "#1f7a4d", sentiment.positive || 0],
    ["neutral", "#64748b", sentiment.neutral || 0],
    ["negative", "#b42318", sentiment.negative || 0],
  ];
  const max = Math.max(...rows.map(([, , count]) => count), 1);
  const barWidth = 210;
  const svgRows = rows
    .map(([key, color, count], index) => {
      const y = index * 26 + 6;
      const width = Math.max(3, Math.round((count / max) * barWidth));
      return `
      <text x="0" y="${y + 11}" class="svg-label">${escapeHtml(enumLabel(key, "sentiment"))}</text>
      <rect x="72" y="${y}" width="${barWidth}" height="14" rx="4" fill="#eef1f5"></rect>
      <rect x="72" y="${y}" width="${width}" height="14" rx="4" fill="${color}" fill-opacity="0.82"></rect>
      <text x="${72 + barWidth + 10}" y="${y + 11}" class="svg-count">${count}</text>
    `;
    })
    .join("");
  return `<svg class="sentiment-svg" viewBox="0 0 320 86" role="img" aria-label="${escapeHtml(t("sentimentSplit"))}">${svgRows}</svg>`;
}

function topClustersPanel() {
  const trendRank = { up: 2, flat: 1, down: 0 };
  const top = [...requests()]
    .sort((a, b) => trendRank[b.trend] - trendRank[a.trend] || b.weighted_score - a.weighted_score)
    .slice(0, 5);
  if (!top.length) return `<div class="empty">${t("empty")}</div>`;
  return top
    .map(
      (request) => `
    <a class="cluster-row" href="#/requests/${encodeURIComponent(request.request_id)}">
      <span class="cluster-copy">
        <strong>${escapeHtml(request.title)}</strong>
        <small>${escapeHtml(productName(request.product))} · ${request.frequency} × ${t("weight").toLowerCase()} = ${request.weighted_score}</small>
      </span>
      ${trendArrow(request.trend)}
      ${statusBadge(request.status)}
    </a>
  `,
    )
    .join("");
}

function freshnessPanel() {
  const sources = state.snapshot?.sources || [];
  if (!sources.length) return `<div class="empty">${t("setupNeeded")}</div>`;
  return sources
    .map(
      (source) => `
    <div class="freshness-row">
      ${channelBadge(source.channel)}
      <span class="cluster-copy">
        <strong>${escapeHtml(source.name)}</strong>
        <small>${escapeHtml(source.collection || "")}</small>
      </span>
      <span class="muted">${escapeHtml(relativeTime(source.last_ingest_at))}</span>
      <strong class="num">${source.item_count ?? 0}</strong>
    </div>
  `,
    )
    .join("");
}

// ---------- Inbox ----------

export function filteredFeedback() {
  const query = state.query.trim().toLowerCase();
  return feedbackItems().filter((item) => {
    if (!query) return true;
    const request = requestById(item.request_id);
    return [
      item.text,
      item.user?.handle,
      item.channel,
      item.product,
      item.sentiment,
      item.triage,
      request?.title,
      item.source_id,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

export function feedbackTable(items) {
  if (!items.length) return `<div class="empty">${t("empty")}</div>`;
  const sorted = [...items].sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("received")}</th><th>${t("user")}</th><th>${t("feedback")}</th><th>${t("channel")}</th><th>${t("sentiment")}</th><th>${t("clusterLink")}</th><th>${t("triage")}</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map(
              (item) => `
            <tr>
              <td class="nowrap">${date(item.received_at)}</td>
              <td><div class="strong">${escapeHtml(item.user?.handle || "")}</div><div class="muted">${escapeHtml(productName(item.product))} · ${escapeHtml(enumLabel(item.user?.plan || "", "status") || item.user?.plan || "")}</div></td>
              <td class="feedback-cell"><a href="#/inbox/${encodeURIComponent(item.feedback_id)}">${escapeHtml(preview(item.text))}</a></td>
              <td>${channelBadge(item.channel)}</td>
              <td>${sentimentBadge(item.sentiment)}</td>
              <td>${requestLink(item.request_id)}</td>
              <td>${triageBadge(item.triage)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Router ----------

export function render() {
  renderShell();
  if (state.route.view === "inbox" && state.route.id) renderInboxDetail();
  else if (state.route.view === "inbox") renderInbox();
  else if (state.route.view === "requests" && state.route.id) renderRequestDetail();
  else if (state.route.view === "requests") renderRequests();
  else if (state.route.view === "roadmap") renderRoadmap();
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
  localStorage.setItem("kelly-feedback-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
