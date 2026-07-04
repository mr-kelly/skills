import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  platformFilter: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-social-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

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
  const route =
    scenario === "accounts"
      ? "#/accounts"
      : scenario === "detail"
        ? "#/accounts/x-kelly"
        : scenario === "timeline"
          ? "#/timeline"
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

function accounts() {
  return state.snapshot?.accounts || [];
}

function posts() {
  return state.snapshot?.posts || [];
}

function syncLog() {
  return state.snapshot?.sync_log || [];
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
  els.syncStatus.textContent = snapshot ? `${postCount} ${t("posts")}` : t("empty");
  if (els.staleCount) els.staleCount.textContent = staleCount + warningCount;
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
