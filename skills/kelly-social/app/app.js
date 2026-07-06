import { messages } from "./i18n/messages.js";

const state = {
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

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function num(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    notation: Math.abs(numeric) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(numeric);
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function delta(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `<span class="delta ${numeric < 0 ? "down" : "up"}">${sign}${num(numeric)}</span>`;
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseRoute() {
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

function accounts() {
  return state.snapshot?.accounts || [];
}

function posts() {
  return state.snapshot?.posts || [];
}

function syncLog() {
  return state.snapshot?.sync_log || [];
}

function calendar() {
  return state.snapshot?.calendar || [];
}

function drafts() {
  return state.snapshot?.drafts || [];
}

function shorts() {
  return state.snapshot?.shorts || [];
}

function engagement() {
  return state.snapshot?.engagement || [];
}

function crisis() {
  return state.snapshot?.crisis || null;
}

function shareOfVoice() {
  return state.snapshot?.share_of_voice || null;
}

// Items still waiting on a human decision (drives the attention counters).
function openReview(list) {
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

function platformBadge(platform) {
  return `<span class="badge platform-${escapeHtml(platform)}">${escapeHtml(enumLabel(platform, "platform"))}</span>`;
}

function methodBadge(method) {
  return `<span class="badge method">${escapeHtml(enumLabel(method, "method"))}</span>`;
}

function accountName(accountId) {
  const account = accounts().find((item) => item.account_id === accountId);
  return account?.handle || account?.display_name || accountId;
}

function sparkline(seriesData, { width = 220, height = 46 } = {}) {
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

function filteredPosts(accountId = "") {
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

function mediaIndicator(post) {
  if (!post.media || post.media === "none") return "";
  const glyph = post.media === "video" ? "▶" : post.media === "carousel" ? "▤" : post.media === "link" ? "↗" : "▣";
  return `<span class="media-indicator" title="${escapeHtml(enumLabel(post.media, "media"))}">${glyph} ${escapeHtml(enumLabel(post.media, "media"))}${post.media_count > 1 ? ` ×${post.media_count}` : ""}</span>`;
}

function timelineTable(list) {
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

function platformChips() {
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

function bindPlatformChips() {
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

function reviewBadge(status) {
  return `<span class="badge review-${escapeHtml(status)}">${escapeHtml(enumLabel(status, "review"))}</span>`;
}

function gateBadge(gate) {
  if (!gate) return "";
  const verdict = gate.verdict || "SHIP";
  return `<span class="gate gate-${escapeHtml(verdict)}" title="${t("gateScore")} ${escapeHtml(String(gate.score))}">⛩ ${escapeHtml(enumLabel(verdict, "verdict"))} · ${escapeHtml(String(gate.score))}</span>`;
}

function gatePanel(gate) {
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

function channelBadges(channels) {
  return (channels || []).map((channel) => platformBadge(channel)).join(" ");
}

// Reusable workflow (review-status) filter chips for the publishing queues.
function workflowChips(list) {
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

function byWorkflow(list) {
  if (!state.workflowFilter) return list;
  return list.filter((item) => item.status === state.workflowFilter);
}

function bindWorkflowChips() {
  els.content.querySelectorAll(".chip[data-workflow]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.workflowFilter = chip.dataset.workflow || "";
      render();
    });
  });
}

// Review actions shared by drafts / shorts / engagement. `kind` picks the op.
function reviewActions(kind, id, item) {
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
function bindOps() {
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

function renderCalendar() {
  els.title.textContent = t("contentCalendar");
  const list = [...calendar()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  els.subtitle.textContent = `${list.length} ${t("upcoming")}`;
  els.content.innerHTML = list.length
    ? `
    <div class="table-wrap">
      <table class="calendar-table">
        <thead>
          <tr><th>${t("date")}</th><th>${t("channel")}</th><th>${t("pillar")}</th><th>${t("post")}</th><th>${t("status")}</th></tr>
        </thead>
        <tbody>
          ${list
            .map(
              (entry) => `
            <tr>
              <td><strong>${date(entry.date)}</strong>${entry.scheduled_for ? `<div class="muted">${dateTime(entry.scheduled_for)}</div>` : ""}</td>
              <td>${platformBadge(entry.channel)}</td>
              <td><span class="badge pillar">${escapeHtml(entry.pillar)}</span></td>
              <td class="post-cell">${
                entry.draft_id
                  ? `<a class="post-link" href="#/compose">${escapeHtml(entry.title)}</a>`
                  : `<span class="strong">${escapeHtml(entry.title)}</span>`
              }${entry.notes ? `<div class="muted">${escapeHtml(entry.notes)}</div>` : ""}</td>
              <td><span class="status cal-${escapeHtml(entry.status)}">${escapeHtml(enumLabel(entry.status, "calstatus"))}</span></td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("noItems")}</div>`;
}

function renderCompose() {
  els.title.textContent = t("composerQueue");
  const all = drafts();
  const list = byWorkflow(all);
  els.subtitle.textContent = `${openReview(all).length} ${t("needsReviewCount")}`;
  els.content.innerHTML = `
    ${workflowChips(all)}
    ${
      list.length
        ? `<div class="desk-list">${list.map(draftCard).join("")}</div>`
        : `<div class="empty">${t("noItems")}</div>`
    }
  `;
  bindWorkflowChips();
  bindOps();
}

function draftCard(draft) {
  const disabled = state.busy ? "disabled" : "";
  const canPublish = draft.status === "approved" && draft.gate?.verdict !== "BLOCK";
  return `
    <article class="desk-card">
      <div class="desk-head">
        <div class="row wrap">${channelBadges(draft.channels)}<span class="badge pillar">${escapeHtml(draft.pillar)}</span></div>
        <div class="row wrap">${gateBadge(draft.gate)}${reviewBadge(draft.status)}</div>
      </div>
      <p class="desk-hook">${escapeHtml(draft.hook)}</p>
      <p class="desk-body">${escapeHtml(draft.body)}</p>
      <div class="desk-meta">
        ${(draft.hashtags || []).length ? `<div class="tags">${draft.hashtags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${draft.cta ? `<div class="muted"><strong>${t("cta")}:</strong> ${escapeHtml(draft.cta)}</div>` : ""}
        ${draft.scheduled_for ? `<div class="muted"><strong>${t("scheduledFor")}:</strong> ${dateTime(draft.scheduled_for)}</div>` : ""}
      </div>
      ${draft.agent_notes ? `<div class="warnings info"><div><strong>${t("agentNotes")}</strong><span>${escapeHtml(draft.agent_notes)}</span></div></div>` : ""}
      ${draft.review_note ? `<div class="muted review-note"><strong>${t("reviewNote")}:</strong> ${escapeHtml(draft.review_note)}</div>` : ""}
      ${gatePanel(draft.gate)}
      ${draft.gate?.verdict === "BLOCK" ? `<div class="gate-block-note">${t("gateBlockedNote")}</div>` : ""}
      ${reviewActions("draft", draft.draft_id, draft)}
      ${
        canPublish
          ? `<div class="actions publish-row"><button type="button" class="btn-approve" data-op="publish_post" data-idkey="draft_id" data-id="${escapeHtml(draft.draft_id)}" ${disabled}>${t("publish")}</button></div>`
          : ""
      }
    </article>
  `;
}

function renderShorts() {
  els.title.textContent = t("shortScripts");
  const all = shorts();
  const list = byWorkflow(all);
  els.subtitle.textContent = `${all.length} ${t("shorts")}`;
  els.content.innerHTML = `
    ${workflowChips(all)}
    ${list.length ? `<div class="desk-list">${list.map(shortCard).join("")}</div>` : `<div class="empty">${t("noItems")}</div>`}
  `;
  bindWorkflowChips();
  bindOps();
}

function shortCard(short) {
  return `
    <article class="desk-card">
      <div class="desk-head">
        <div class="row wrap">${channelBadges(short.channels)}<span class="badge pillar">${escapeHtml(short.pillar)}</span></div>
        <div class="row wrap"><span class="badge method">${escapeHtml(short.duration_s)}s</span>${reviewBadge(short.status)}</div>
      </div>
      <h3 class="desk-title">${escapeHtml(short.title)}</h3>
      <p class="desk-hook">${escapeHtml(short.hook)}</p>
      <div class="shotlist">
        <div class="shotlist-head">${t("shotList")}</div>
        ${(short.shots || [])
          .map(
            (shot) => `
          <div class="shot-row">
            <span class="shot-no">${escapeHtml(String(shot.shot_no))}</span>
            <span class="shot-visual"><strong>${escapeHtml(shot.visual)}</strong>${shot.on_screen_text ? `<small>${t("onScreen")}: ${escapeHtml(shot.on_screen_text)}</small>` : ""}</span>
            <span class="shot-vo"><small>${t("voiceover")}</small>${escapeHtml(shot.voiceover)}</span>
            <span class="shot-dur num">${escapeHtml(String(shot.duration_s))}s</span>
          </div>
        `,
          )
          .join("")}
      </div>
      ${short.caption ? `<div class="muted"><strong>${t("caption")}:</strong> ${escapeHtml(short.caption)}</div>` : ""}
      ${(short.hashtags || []).length ? `<div class="tags">${short.hashtags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${short.agent_notes ? `<div class="warnings info"><div><strong>${t("agentNotes")}</strong><span>${escapeHtml(short.agent_notes)}</span></div></div>` : ""}
      ${short.review_note ? `<div class="muted review-note"><strong>${t("reviewNote")}:</strong> ${escapeHtml(short.review_note)}</div>` : ""}
      ${reviewActions("short", short.short_id, short)}
    </article>
  `;
}

function renderEngagement() {
  els.title.textContent = t("engagementInbox");
  const all = engagement();
  const list = byWorkflow(all);
  els.subtitle.textContent = `${openReview(all).length} ${t("needsReviewCount")}`;
  els.content.innerHTML = `
    ${workflowChips(all)}
    ${list.length ? `<div class="desk-list">${list.map(engagementCard).join("")}</div>` : `<div class="empty">${t("noItems")}</div>`}
  `;
  bindWorkflowChips();
  bindOps();
}

function engagementCard(item) {
  const disabled = state.busy ? "disabled" : "";
  const canSend = item.status === "approved";
  return `
    <article class="desk-card">
      <div class="desk-head">
        <div class="row wrap">${platformBadge(item.platform)}<span class="badge kind">${escapeHtml(enumLabel(item.kind, "kind"))}</span><span class="badge sentiment-${escapeHtml(item.sentiment)}">${escapeHtml(enumLabel(item.sentiment, "sentiment"))}</span>${item.priority === "high" ? `<span class="badge prio-high">${escapeHtml(enumLabel(item.priority, "priority"))}</span>` : ""}</div>
        <div class="row wrap">${reviewBadge(item.status)}</div>
      </div>
      <div class="incoming-msg">
        <div class="muted">${t("from")} <strong>${escapeHtml(item.author_handle)}</strong> · ${dateTime(item.received_at)}</div>
        <p>${escapeHtml(item.incoming_text)}</p>
      </div>
      <div class="reply-msg">
        <div class="muted"><strong>${t("draftReply")}</strong></div>
        <p>${escapeHtml(item.draft_reply)}</p>
      </div>
      ${item.review_note ? `<div class="muted review-note"><strong>${t("reviewNote")}:</strong> ${escapeHtml(item.review_note)}</div>` : ""}
      ${reviewActions("engagement", item.item_id, item)}
      ${
        canSend
          ? `<div class="actions publish-row"><button type="button" class="btn-approve" data-op="send_reply" data-idkey="item_id" data-id="${escapeHtml(item.item_id)}" data-channel="${escapeHtml(item.platform)}" ${disabled}>${t("sendReply")}</button></div>`
          : ""
      }
    </article>
  `;
}

function renderCrisis() {
  els.title.textContent = t("crisisPlaybook");
  const plan = crisis();
  if (!plan) {
    els.content.innerHTML = `<div class="empty">${t("noItems")}</div>`;
    return;
  }
  const disabled = state.busy ? "disabled" : "";
  els.subtitle.textContent = `${t("incidentStatus")}: ${enumLabel(plan.status, "incident")}`;
  els.content.innerHTML = `
    <section class="crisis">
      <div class="crisis-status crisis-${escapeHtml(plan.status)}">
        <div>
          <div class="crisis-eyebrow">${t("incidentStatus")}</div>
          <div class="crisis-state">${escapeHtml(enumLabel(plan.status, "incident"))}</div>
          ${plan.spokesperson ? `<div class="muted">${t("spokesperson")}: ${escapeHtml(plan.spokesperson)}</div>` : ""}
        </div>
        <div class="crisis-controls">
          <div class="pub-flag ${plan.publishing_paused ? "paused" : "live"}">${plan.publishing_paused ? t("publishingPaused") : t("publishingLive")}</div>
          <button type="button" data-op="crisis_toggle" data-paused="${plan.publishing_paused ? "false" : "true"}" ${disabled}>${plan.publishing_paused ? t("resumePublishing") : t("pausePublishing")}</button>
        </div>
      </div>
      <div class="crisis-severity">
        <button type="button" class="${plan.status === "calm" ? "active" : ""}" data-op="crisis_toggle" data-incident="calm" ${disabled}>${t("setCalm")}</button>
        <button type="button" class="${plan.status === "watch" ? "active" : ""}" data-op="crisis_toggle" data-incident="watch" ${disabled}>${t("setWatch")}</button>
        <button type="button" class="btn-danger ${plan.status === "active" ? "active" : ""}" data-op="crisis_toggle" data-incident="active" ${disabled}>${t("setActive")}</button>
      </div>
      <div class="crisis-steps">
        ${(plan.steps || [])
          .map(
            (step) => `
          <label class="crisis-step ${step.done ? "done" : ""}">
            <input type="checkbox" data-op="crisis_toggle" data-step-id="${escapeHtml(step.step_id)}" ${step.done ? "checked" : ""} ${disabled}>
            <span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small>${step.owner ? `<small class="crisis-owner">${escapeHtml(step.owner)}</small>` : ""}</span>
          </label>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
  bindOps();
}

function renderTimeline() {
  els.title.textContent = t("timeline");
  const list = filteredPosts();
  els.subtitle.textContent = `${list.length} ${t("posts")}`;
  els.content.innerHTML = `
    ${platformChips()}
    ${warnings()}
    ${timelineTable(list)}
  `;
  bindPlatformChips();
}

function renderPostDetail() {
  const post = posts().find((item) => item.post_id === state.route.id);
  if (!post) {
    renderTimeline();
    return;
  }
  const metrics = post.metrics || {};
  els.title.textContent = t("postDetail");
  els.subtitle.textContent = `${enumLabel(post.platform, "platform")} · ${accountName(post.account_id)} · ${dateTime(post.posted_at)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <div class="post-panel">
          <div class="row between">
            ${platformBadge(post.platform)}
            <span class="muted">${dateTime(post.posted_at)}</span>
          </div>
          <p class="post-text">${escapeHtml(post.text)}</p>
          <div class="muted">${escapeHtml(enumLabel(post.type, "type"))} ${mediaIndicator(post)}</div>
          ${post.permalink ? `<a class="permalink" href="${escapeHtml(post.permalink)}" target="_blank" rel="noreferrer noopener">${t("permalink")} ↗</a>` : ""}
        </div>
        <h2>${t("metricsBreakdown")}</h2>
        <div class="metrics post-metrics">
          <div class="metric"><span>${t("likes")}</span><strong>${num(metrics.likes)}</strong></div>
          <div class="metric"><span>${t("replies")}</span><strong>${num(metrics.replies)}</strong></div>
          <div class="metric"><span>${t("reposts")}</span><strong>${num(metrics.reposts)}</strong></div>
          <div class="metric"><span>${t("views")}</span><strong>${num(metrics.views)}</strong></div>
          <div class="metric"><span>${t("saves")}</span><strong>${num(metrics.saves)}</strong></div>
          <div class="metric"><span>${t("clicks")}</span><strong>${num(metrics.clicks)}</strong></div>
          <div class="metric"><span>${t("engagementRate")}</span><strong>${pct(post.engagement_rate)}</strong></div>
        </div>
        ${post.agent_notes ? `<div class="warnings info"><div><strong>${t("agentNotes")}</strong><span>${escapeHtml(post.agent_notes)}</span></div></div>` : ""}
      </div>
      <aside class="detail-side">
        <h2>${t("postDetail")}</h2>
        <dl>
          <dt>${t("platform")}</dt><dd>${escapeHtml(enumLabel(post.platform, "platform"))}</dd>
          <dt>${t("account")}</dt><dd><a href="#/accounts/${encodeURIComponent(post.account_id)}">${escapeHtml(accountName(post.account_id))}</a></dd>
          <dt>${t("postedAt")}</dt><dd>${dateTime(post.posted_at)}</dd>
          <dt>${t("type")}</dt><dd>${escapeHtml(enumLabel(post.type, "type"))}</dd>
          <dt>${t("media")}</dt><dd>${escapeHtml(enumLabel(post.media, "media"))}</dd>
          <dt>ID</dt><dd>${escapeHtml(post.post_id)}</dd>
          ${post.permalink ? `<dt>${t("permalink")}</dt><dd><a href="${escapeHtml(post.permalink)}" target="_blank" rel="noreferrer noopener">${escapeHtml(post.permalink)}</a></dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
}

function renderAccounts() {
  els.title.textContent = t("accounts");
  els.subtitle.textContent = `${accounts().length} ${t("configured")}`;
  const list = accounts();
  els.content.innerHTML = list.length
    ? `
    ${warnings()}
    <div class="account-grid">
      ${list
        .map(
          (account) => `
        <a class="account-card" href="#/accounts/${encodeURIComponent(account.account_id)}">
          <div class="row between"><strong>${escapeHtml(account.handle)}</strong>${platformBadge(account.platform)}</div>
          <div class="muted">${escapeHtml(account.display_name)}</div>
          <div class="balance">${num(account.metrics?.followers)} <small class="muted">${t("followers")}</small></div>
          <div class="row stats">
            <span>${delta(account.metrics?.followers_delta_7d)} ${t("delta7d")}</span>
            <span>${t("engagementRate")} ${pct(account.metrics?.engagement_rate_7d)}</span>
          </div>
          <div class="row stats">
            <span>${methodBadge(account.collection)}</span>
            <span>${t("lastSync")} ${dateTime(account.last_sync_at)}</span>
          </div>
          <div class="status ${escapeHtml(account.status)}">${escapeHtml(enumLabel(account.status))}</div>
        </a>
      `,
        )
        .join("")}
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

function renderAccountDetail() {
  const account = accounts().find((item) => item.account_id === state.route.id);
  if (!account) {
    renderAccounts();
    return;
  }
  const metrics = account.metrics || {};
  const accountPosts = filteredPosts(account.account_id).slice(0, 8);
  const history = syncLog().filter((entry) => entry.account_id === account.account_id);
  const seriesData = account.follower_series || [];
  const first = seriesData[0]?.followers;
  const last = seriesData[seriesData.length - 1]?.followers;
  els.title.textContent = account.handle || account.display_name;
  els.subtitle.textContent = `${enumLabel(account.platform, "platform")} · ${enumLabel(account.collection, "method")} · ${enumLabel(account.status)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        ${warnings(account.account_id)}
        <div class="metrics">
          <div class="metric"><span>${t("followers")}</span><strong>${num(metrics.followers)}</strong><small>${delta(metrics.followers_delta_7d)} ${t("delta7d")} · ${delta(metrics.followers_delta_28d)} ${t("delta28d")}</small></div>
          <div class="metric"><span>${t("impressions7d")}</span><strong>${num(metrics.impressions_7d)}</strong></div>
          <div class="metric"><span>${t("engagementRate7d")}</span><strong>${pct(metrics.engagement_rate_7d)}</strong></div>
          <div class="metric"><span>${t("profileVisits")}</span><strong>${num(metrics.profile_visits_7d)}</strong></div>
        </div>
        <div class="trend-panel">
          <h2>${t("followersTrend")}</h2>
          <div class="trend-large">${sparkline(seriesData, { width: 640, height: 120 })}</div>
          <div class="row between muted">
            <span>${seriesData.length ? `${date(seriesData[0].date)} · ${num(first)}` : ""}</span>
            <span>${seriesData.length ? `${date(seriesData[seriesData.length - 1].date)} · ${num(last)}` : ""}</span>
          </div>
        </div>
        <h2>${t("topPostsThisWeek")}</h2>
        ${timelineTable(accountPosts)}
        ${
          (account.traffic_sources || []).length
            ? `
          <div class="traffic-panel">
            <h2>${t("trafficSources")}</h2>
            ${account.traffic_sources
              .map(
                (item) => `
              <div class="traffic-row">
                <span>${escapeHtml(item.source)}</span>
                <span class="traffic-bar"><span style="width:${Math.round(Number(item.share || 0) * 100)}%"></span></span>
                <span class="num">${pct(item.share)}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        ${
          history.length
            ? `
          <div class="sync-panel">
            <h2>${t("syncHistory")}</h2>
            ${history
              .map(
                (entry) => `
              <div class="sync-row">
                <span class="status ${escapeHtml(entry.status)}">${escapeHtml(enumLabel(entry.status))}</span>
                <span>${methodBadge(entry.method)}</span>
                <span class="muted">${dateTime(entry.completed_at || entry.started_at)}</span>
                <span>${num(entry.posts_collected)} ${t("posts")}</span>
                <p>${escapeHtml(entry.message || "")}</p>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("profileSummary")}</h2>
        <dl>
          <dt>${t("platform")}</dt><dd>${escapeHtml(enumLabel(account.platform, "platform"))}</dd>
          <dt>${t("handle")}</dt><dd>${escapeHtml(account.handle)}</dd>
          <dt>${t("accountId")}</dt><dd>${escapeHtml(account.account_id)}</dd>
          ${account.profile_url ? `<dt>${t("profileUrl")}</dt><dd><a href="${escapeHtml(account.profile_url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(account.profile_url)}</a></dd>` : ""}
          <dt>${t("collection")}</dt><dd>${escapeHtml(enumLabel(account.collection, "method"))}</dd>
          <dt>${t("lastSync")}</dt><dd>${escapeHtml(account.last_sync_at || "")}</dd>
          <dt>${t("following")}</dt><dd>${num(metrics.following)}</dd>
          <dt>${t("postsCount")}</dt><dd>${num(metrics.posts)}</dd>
          ${account.notes ? `<dt>${t("notes")}</dt><dd>${escapeHtml(account.notes)}</dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("accounts")}</h2>
        ${
          (summary.accounts || [])
            .map(
              (account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.handle || account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.platform, "platform"))} · ${escapeHtml(enumLabel(account.collection, "method"))}</span>
            <span>${account.secret_envs?.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : t("noSecretsNeeded")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}

function warnings(accountId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !accountId || !item.account_id || item.account_id === accountId,
  );
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
