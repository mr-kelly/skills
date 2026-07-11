import { messages } from "./i18n/messages.js";
import {
  renderAccountDetail,
  renderAccounts,
  renderCalendar,
  renderCompose,
  renderCrisis,
  renderEngagement,
  renderPostDetail,
  renderSettings,
  renderShorts,
  renderTimeline,
  warnings,
} from "./js/publishing-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  platformFilter: "",
  workflowFilter: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-social-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  busy: false,
};

const REVIEW_STATES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-social.sidebarCollapsed";
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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
  staleCount: document.querySelector("#count-stale"),
  reviewCount: document.querySelector("#count-review"),
  engagementCount: document.querySelector("#count-engagement"),
  postCount: document.querySelector("#count-posts"),
  accountCount: document.querySelector("#count-accounts"),
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

export function num(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    notation: Math.abs(numeric) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(numeric);
}

export function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function delta(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `<span class="delta ${numeric < 0 ? "down" : "up"}">${sign}${num(numeric)}</span>`;
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
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

export function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] || "" };
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
  const scenarioRoutes = {
    accounts: "#/accounts",
    detail: "#/accounts/x-kelly",
    timeline: "#/timeline",
    calendar: "#/calendar",
    compose: "#/compose",
    shorts: "#/shorts",
    engagement: "#/engagement",
    crisis: "#/crisis",
  };
  const route = scenarioRoutes[scenario] || "#/overview";
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

export function accounts() {
  return state.snapshot?.accounts || [];
}

export function posts() {
  return state.snapshot?.posts || [];
}

export function syncLog() {
  return state.snapshot?.sync_log || [];
}

export function calendar() {
  return state.snapshot?.calendar || [];
}

export function drafts() {
  return state.snapshot?.drafts || [];
}

export function shorts() {
  return state.snapshot?.shorts || [];
}

export function engagement() {
  return state.snapshot?.engagement || [];
}

export function crisis() {
  return state.snapshot?.crisis || null;
}

function shareOfVoice() {
  return state.snapshot?.share_of_voice || null;
}

// Items still waiting on a human decision (drives the attention counters).
export function openReview(list) {
  return list.filter((item) => item.status === "needs_review" || item.status === "changes_requested");
}

// POST one ECHO operation, then reload state so the optimistic transition
// reflects the persisted snapshot. Demo mode short-circuits to a local reload.
async function applyOperation(op) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const params = new URLSearchParams();
    if (state.demo) params.set("demo", state.demo);
    const res = await fetch(`/api/operation?${params}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(op),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.error || `${t("opFailed")}: ${res.status}`);
    }
    const data = await res.json();
    if (data.snapshot) {
      // Real provider echoes the updated snapshot — adopt it directly.
      state.snapshot = data.snapshot;
      state.settings = { ...state.settings, snapshot: data.snapshot };
      state.busy = false;
      render();
    } else {
      // Demo mode: no server-side write, so reload the deterministic scene.
      state.busy = false;
      await loadState();
    }
  } catch (error) {
    state.busy = false;
    window.alert(`${t("opFailed")}: ${error.message}`);
    render();
  }
}

function isStaleAccount(account) {
  if (account.status && account.status !== "ok") return true;
  if (!account.last_sync_at) return true;
  const reference = new Date(state.snapshot?.generated_at || Date.now()).getTime();
  return reference - new Date(account.last_sync_at).getTime() > STALE_AFTER_MS;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const warningCount = snapshot?.warnings?.length || 0;
  const staleCount = accounts().filter(isStaleAccount).length;
  const configuredCount = state.settings?.config_summary?.accounts?.length || 0;
  const postCount = posts().length;
  const reviewCount =
    openReview(drafts()).length +
    shorts().filter((s) => s.status === "needs_review" || s.status === "changes_requested").length;
  const engagementReview = openReview(engagement()).length;
  els.syncStatus.textContent = snapshot ? `${reviewCount} ${t("needsReviewCount")}` : t("empty");
  if (els.staleCount) els.staleCount.textContent = staleCount + warningCount;
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.engagementCount) els.engagementCount.textContent = engagementReview;
  if (els.postCount) els.postCount.textContent = postCount;
  if (els.accountCount) els.accountCount.textContent = configuredCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = staleCount
      ? `${staleCount} ${t("needCollection")}`
      : warningCount
        ? `${warningCount} ${t("warnings")}`
        : `${postCount} ${t("posts")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "timeline") return t("timeline");
  if (view === "accounts") return t("accounts");
  if (view === "settings") return t("settings");
  if (view === "calendar") return t("contentCalendar");
  if (view === "compose") return t("composerQueue");
  if (view === "shorts") return t("shortScripts");
  if (view === "engagement") return t("engagementInbox");
  if (view === "crisis") return t("crisisPlaybook");
  return t("overview");
}

export function platformBadge(platform) {
  return `<span class="badge platform-${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

export function methodBadge(method) {
  return `<span class="badge method">${escapeHtml(enumLabel(method, "method"))}</span>`;
}

export function accountName(accountId) {
  const account = accounts().find((item) => item.account_id === accountId);
  return account?.handle || account?.display_name || accountId;
}

export function sparkline(seriesData, { width = 220, height = 46 } = {}) {
  const values = (seriesData || []).map((point) => Number(point.followers || 0));
  if (values.length < 2) return `<span class="muted">${t("empty")}</span>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - 4 - ((value - min) / span) * (height - 8)).toFixed(1)}`,
    )
    .join(" ");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("totalFollowers")}</span><strong>${num(metrics.total_followers)}</strong><small>${delta(metrics.followers_delta_7d)} ${t("delta7d")} · ${delta(metrics.followers_delta_28d)} ${t("delta28d")}</small></div>
      <div class="metric"><span>${t("impressions7d")}</span><strong>${num(metrics.impressions_7d)}</strong></div>
      <div class="metric"><span>${t("engagementRate7d")}</span><strong>${pct(metrics.engagement_rate_7d)}</strong></div>
      <div class="metric"><span>${t("postsTrackedTitle")}</span><strong>${num(metrics.post_count)}</strong></div>
    </div>
  `;
}

export function filteredPosts(accountId = "") {
  const query = state.query.trim().toLowerCase();
  return posts()
    .filter((post) => {
      if (accountId && post.account_id !== accountId) return false;
      if (state.platformFilter && !accountId && post.platform !== state.platformFilter) return false;
      if (!query) return true;
      return [post.text, post.platform, accountName(post.account_id), post.type, post.media, post.agent_notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));
}

export function mediaIndicator(post) {
  if (!post.media || post.media === "none") return "";
  const glyph = post.media === "video" ? "▶" : post.media === "carousel" ? "▤" : post.media === "link" ? "↗" : "▣";
  return `<span class="media-indicator" title="${escapeHtml(enumLabel(post.media, "media"))}">${glyph} ${escapeHtml(enumLabel(post.media, "media"))}${post.media_count > 1 ? ` ×${post.media_count}` : ""}</span>`;
}

export function timelineTable(list) {
  if (!list.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("date")}</th><th>${t("platform")}</th><th>${t("account")}</th><th>${t("post")}</th><th>${t("likes")}</th><th>${t("replies")}</th><th>${t("reposts")}</th><th>${t("views")}</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (post) => `
            <tr>
              <td>${dateTime(post.posted_at)}</td>
              <td>${platformBadge(post.platform)}</td>
              <td><a href="#/accounts/${encodeURIComponent(post.account_id)}">${escapeHtml(accountName(post.account_id))}</a></td>
              <td class="post-cell"><a class="post-link" href="#/timeline/${encodeURIComponent(post.post_id)}"><span class="strong">${escapeHtml(truncate(post.text, 110))}</span></a><div class="muted">${escapeHtml(enumLabel(post.type, "type"))}${post.media && post.media !== "none" ? " · " : ""}${mediaIndicator(post)}</div></td>
              <td class="num">${num(post.metrics?.likes)}</td>
              <td class="num">${num(post.metrics?.replies)}</td>
              <td class="num">${num(post.metrics?.reposts)}</td>
              <td class="num">${num(post.metrics?.views)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function platformChips() {
  const platforms = [...new Set(posts().map((post) => post.platform))];
  return `
    <div class="chips" role="group" aria-label="${t("platform")}">
      <button type="button" class="chip ${state.platformFilter === "" ? "active" : ""}" data-platform="">${t("allPlatforms")}</button>
      ${platforms
        .map(
          (platform) => `
        <button type="button" class="chip ${state.platformFilter === platform ? "active" : ""}" data-platform="${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</button>
      `,
        )
        .join("")}
    </div>
  `;
}

export function bindPlatformChips() {
  els.content.querySelectorAll(".chip[data-platform]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.platformFilter = chip.dataset.platform || "";
      render();
    });
  });
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const list = accounts();
  const reference = new Date(state.snapshot?.generated_at || Date.now()).getTime();
  const weekAgo = reference - STALE_AFTER_MS;
  const topPosts = posts()
    .filter((post) => new Date(post.posted_at).getTime() >= weekAgo)
    .sort((a, b) => (b.metrics?.views || 0) - (a.metrics?.views || 0))
    .slice(0, 5);
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <div class="kpi-grid">
      ${list
        .map(
          (account) => `
        <a class="account-card" href="#/accounts/${encodeURIComponent(account.account_id)}">
          <div class="row between"><strong>${escapeHtml(account.handle)}</strong>${platformBadge(account.platform)}</div>
          <div class="muted">${escapeHtml(account.display_name)}</div>
          <div class="balance">${num(account.metrics?.followers)} <small class="muted">${t("followers")}</small></div>
          <div class="row stats">
            <span>${delta(account.metrics?.followers_delta_7d)} ${t("delta7d")}</span>
            <span>${delta(account.metrics?.followers_delta_28d)} ${t("delta28d")}</span>
          </div>
          <div class="row stats">
            <span>${t("impressions7d")} ${num(account.metrics?.impressions_7d)}</span>
            <span>${t("engagementRate")} ${pct(account.metrics?.engagement_rate_7d)}</span>
            <span>${t("profileVisits")} ${num(account.metrics?.profile_visits_7d)}</span>
          </div>
        </a>
      `,
        )
        .join("")}
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("followersTrend")}</h2>
        ${list
          .map(
            (account) => `
          <a class="trend-row" href="#/accounts/${encodeURIComponent(account.account_id)}">
            <span><strong>${escapeHtml(account.handle)}</strong><small>${escapeHtml(enumLabel(account.platform, "platform"))}</small></span>
            <span class="trend-spark">${sparkline(account.follower_series)}</span>
            <span class="num">${num(account.metrics?.followers)} ${delta(account.metrics?.followers_delta_7d)}</span>
          </a>
        `,
          )
          .join("")}
      </div>
      <div class="overview-panel">
        <h2>${t("topPostsThisWeek")}</h2>
        ${
          topPosts
            .map(
              (post) => `
          <a class="movement-row" href="#/timeline/${encodeURIComponent(post.post_id)}">
            <span><strong>${escapeHtml(truncate(post.text, 76))}</strong><small>${escapeHtml(enumLabel(post.platform, "platform"))} · ${escapeHtml(accountName(post.account_id))}</small></span>
            <span class="num">${num(post.metrics?.views)} <small class="muted">${t("views")}</small></span>
          </a>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </div>
      ${shareOfVoicePanel()}
      <div class="overview-panel wide">
        <h2>${t("collectionFreshness")}</h2>
        ${list
          .map(
            (account) => `
          <div class="freshness-row">
            <span><strong>${escapeHtml(account.handle)}</strong><small>${escapeHtml(enumLabel(account.platform, "platform"))}</small></span>
            <span>${methodBadge(account.collection)}</span>
            <span class="muted">${t("lastSync")} ${dateTime(account.last_sync_at)}</span>
            <span class="status ${escapeHtml(account.status)}">${escapeHtml(enumLabel(account.status))}</span>
          </div>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

// ─── ECHO publishing side: shared UI helpers ────────────────────────────────

export function reviewBadge(status) {
  return `<span class="badge review-${escapeHtml(status)}">${escapeHtml(enumLabel(status, "review"))}</span>`;
}

export function gateBadge(gate) {
  if (!gate) return "";
  const verdict = gate.verdict || "SHIP";
  return `<span class="gate gate-${escapeHtml(verdict)}" title="${t("gateScore")} ${escapeHtml(String(gate.score))}">⛩ ${escapeHtml(enumLabel(verdict, "verdict"))} · ${escapeHtml(String(gate.score))}</span>`;
}

export function gatePanel(gate) {
  if (!gate) return "";
  return `
    <div class="gate-panel gate-${escapeHtml(gate.verdict)}">
      <div class="row between">
        <strong>${t("qualityGate")}</strong>
        ${gateBadge(gate)}
      </div>
      ${gate.summary ? `<div class="muted">${escapeHtml(gate.summary)}</div>` : ""}
      <ul class="gate-checks">
        ${(gate.checks || [])
          .map(
            (check) => `
          <li class="gate-check ${escapeHtml(check.result)}">
            <span class="gate-dot" aria-hidden="true"></span>
            <span><strong>${escapeHtml(check.label)}</strong>${check.note ? `<small>${escapeHtml(check.note)}</small>` : ""}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>
  `;
}

export function channelBadges(channels) {
  return (channels || []).map((channel) => platformBadge(channel)).join(" ");
}

// Reusable workflow (review-status) filter chips for the publishing queues.
export function workflowChips(list) {
  const counts = REVIEW_STATES.map((status) => ({
    status,
    n: list.filter((item) => item.status === status).length,
  })).filter((entry) => entry.n > 0);
  return `
    <div class="chips" role="group" aria-label="${t("workflow")}">
      <button type="button" class="chip ${state.workflowFilter === "" ? "active" : ""}" data-workflow="">${t("allItems")} ${list.length}</button>
      ${counts
        .map(
          (entry) => `
        <button type="button" class="chip ${state.workflowFilter === entry.status ? "active" : ""}" data-workflow="${escapeHtml(entry.status)}">${escapeHtml(enumLabel(entry.status, "review"))} ${entry.n}</button>
      `,
        )
        .join("")}
    </div>
  `;
}

export function byWorkflow(list) {
  if (!state.workflowFilter) return list;
  return list.filter((item) => item.status === state.workflowFilter);
}

export function bindWorkflowChips() {
  els.content.querySelectorAll(".chip[data-workflow]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.workflowFilter = chip.dataset.workflow || "";
      render();
    });
  });
}

// Review actions shared by drafts / shorts / engagement. `kind` picks the op.
export function reviewActions(kind, id, item) {
  const disabled = state.busy ? "disabled" : "";
  const blocked = item.gate?.verdict === "BLOCK";
  const opFor = { draft: "review_draft", short: "review_short", engagement: "review_engagement" }[kind];
  const idKey = { draft: "draft_id", short: "short_id", engagement: "item_id" }[kind];
  const buttons = [];
  if (!blocked) {
    buttons.push(
      `<button type="button" class="btn-approve" data-op="${opFor}" data-idkey="${idKey}" data-id="${escapeHtml(id)}" data-status="approved" ${disabled}>${t("approve")}</button>`,
    );
  }
  buttons.push(
    `<button type="button" data-op="${opFor}" data-idkey="${idKey}" data-id="${escapeHtml(id)}" data-status="changes_requested" ${disabled}>${t("requestChanges")}</button>`,
  );
  buttons.push(
    `<button type="button" class="btn-danger" data-op="${opFor}" data-idkey="${idKey}" data-id="${escapeHtml(id)}" data-status="blocked" ${disabled}>${t("block")}</button>`,
  );
  return `<div class="actions">${buttons.join("")}</div>`;
}

// Wire every data-op button in the current scene to applyOperation().
export function bindOps() {
  els.content.querySelectorAll("[data-op]").forEach((button) => {
    button.addEventListener("click", () => {
      const op = { operation: button.dataset.op };
      if (button.dataset.idkey) op[button.dataset.idkey] = button.dataset.id;
      if (button.dataset.status) op.status = button.dataset.status;
      if (button.dataset.channel) op.channel = button.dataset.channel;
      if (button.dataset.scheduledFor) op.scheduled_for = button.dataset.scheduledFor;
      if (button.dataset.stepId) op.step_id = button.dataset.stepId;
      if (button.dataset.paused) op.publishing_paused = button.dataset.paused === "true";
      if (button.dataset.incident) op.status = button.dataset.incident;
      applyOperation(op);
    });
  });
}

function shareOfVoicePanel() {
  const sov = shareOfVoice();
  if (!sov || !(sov.entries || []).length) return "";
  const max = Math.max(...sov.entries.map((entry) => entry.share || 0)) || 1;
  return `
    <div class="overview-panel">
      <h2>${t("shareOfVoice")}</h2>
      <div class="muted">${t("youVsCompetitors")} · ${num(sov.total_mentions)} ${t("mentions7d")}</div>
      ${sov.entries
        .map(
          (entry) => `
        <div class="sov-row ${entry.is_self ? "self" : ""}">
          <span class="sov-name">${escapeHtml(entry.name)}</span>
          <span class="traffic-bar"><span style="width:${Math.round((Number(entry.share || 0) / max) * 100)}%"></span></span>
          <span class="num">${pct(entry.share)}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "accounts" && state.route.id) renderAccountDetail();
  else if (state.route.view === "accounts") renderAccounts();
  else if (state.route.view === "timeline" && state.route.id) renderPostDetail();
  else if (state.route.view === "timeline") renderTimeline();
  else if (state.route.view === "settings") renderSettings();
  else if (state.route.view === "calendar") renderCalendar();
  else if (state.route.view === "compose") renderCompose();
  else if (state.route.view === "shorts") renderShorts();
  else if (state.route.view === "engagement") renderEngagement();
  else if (state.route.view === "crisis") renderCrisis();
  else renderOverview();
}

function truncate(value, length) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
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
  localStorage.setItem("kelly-social-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
