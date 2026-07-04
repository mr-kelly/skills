import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  site: localStorage.getItem("kelly-seo-site") || "",
  oppFilter: "all",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-seo-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoDecisions: {},
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-seo.sidebarCollapsed";

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
  reviewCount: document.querySelector("#count-review"),
  approvedCount: document.querySelector("#count-approved"),
  blockedCount: document.querySelector("#count-blocked"),
  site: document.querySelector("#site"),
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

function locale() {
  return activeLang() === "zh" ? "zh-Hans" : "en-US";
}

function n(value) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function pos1(value) {
  return Number(value || 0).toFixed(1);
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function deltaHtml(current, previous, { kind = "int", invert = false } = {}) {
  const diff = Number(current || 0) - Number(previous || 0);
  if (!Number.isFinite(diff) || Math.abs(diff) < (kind === "int" ? 0.5 : 0.0005)) {
    return `<span class="delta flat">±0</span>`;
  }
  const good = invert ? diff < 0 : diff > 0;
  const arrow = diff > 0 ? "▲" : "▼";
  let text;
  if (kind === "pct") text = `${Math.abs(diff * 100).toFixed(1)}pp`;
  else if (kind === "pos") text = Math.abs(diff).toFixed(1);
  else text = n(Math.abs(diff));
  return `<span class="delta ${good ? "positive" : "negative"}">${arrow} ${text}</span>`;
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
  populateSiteSelect();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const detailQuery =
    state.snapshot?.queries?.find((query) => query.badges?.includes("striking_distance")) ||
    state.snapshot?.queries?.[0];
  const route =
    scenario === "queries"
      ? "#/queries"
      : scenario === "pages"
        ? "#/pages"
        : scenario === "opportunities"
          ? "#/opportunities"
          : scenario === "detail"
            ? `#/queries/${encodeURIComponent(detailQuery?.query_id || "")}`
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function populateSiteSelect() {
  if (!els.site) return;
  const sites = state.snapshot?.sites || [];
  const current = state.site;
  els.site.innerHTML = [`<option value="">${escapeHtml(t("allSites"))}</option>`]
    .concat(
      sites.map((site) => `<option value="${escapeHtml(site.site_id)}">${escapeHtml(site.property_url)}</option>`),
    )
    .join("");
  els.site.value = sites.some((site) => site.site_id === current) ? current : "";
  state.site = els.site.value;
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

function opportunities() {
  const list = state.snapshot?.opportunities || [];
  if (!state.demo) return list;
  return list.map((opportunity) => {
    const local = state.demoDecisions[opportunity.id];
    if (!local) return opportunity;
    let status = opportunity.status;
    if (local.action === "approve") status = "approved";
    if (local.action === "request_changes") status = "changes_requested";
    if (local.action === "block") status = "blocked";
    return { ...opportunity, status, decision: local, draft: local.draft ?? opportunity.draft };
  });
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const opps = opportunities();
  const reviewCount = opps.filter((item) => item.status === "needs_review").length;
  const approvedCount = opps.filter((item) => item.status === "approved").length;
  const blockedCount = opps.filter((item) => item.status === "blocked").length;
  const queryCount = snapshot?.queries?.length || 0;
  els.syncStatus.textContent = snapshot && queryCount ? `${n(queryCount)} ${t("queries").toLowerCase()}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.approvedCount) els.approvedCount.textContent = approvedCount;
  if (els.blockedCount) els.blockedCount.textContent = blockedCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("needsReview")}`
      : `${n(snapshot?.metrics?.clicks || 0)} ${t("clicks").toLowerCase()}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "queries") return t("queries");
  if (view === "pages") return t("pages");
  if (view === "opportunities") return t("opportunities");
  if (view === "sites") return t("sites");
  if (view === "settings") return t("settings");
  return t("overview");
}

function sitesInScope() {
  const sites = state.snapshot?.sites || [];
  return state.site ? sites.filter((site) => site.site_id === state.site) : sites;
}

function scopedTotals() {
  const sites = sitesInScope();
  return {
    current: aggregateTotals(sites.map((site) => site.totals)),
    previous: aggregateTotals(sites.map((site) => site.previous)),
  };
}

function aggregateTotals(list) {
  const clicks = list.reduce((sum, item) => sum + Number(item?.clicks || 0), 0);
  const impressions = list.reduce((sum, item) => sum + Number(item?.impressions || 0), 0);
  const weighted = list.reduce((sum, item) => sum + Number(item?.position || 0) * Number(item?.impressions || 0), 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weighted / impressions : 0,
  };
}

function dailyInScope() {
  const daily = state.snapshot?.daily || [];
  const scoped = state.site ? daily.filter((point) => point.site_id === state.site) : daily;
  const byDate = new Map();
  for (const point of scoped) {
    const entry = byDate.get(point.date) || { date: point.date, clicks: 0, impressions: 0 };
    entry.clicks += Number(point.clicks || 0);
    entry.impressions += Number(point.impressions || 0);
    byDate.set(point.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function currentWindowDaily() {
  const start = state.snapshot?.range?.current?.start || "";
  return dailyInScope().filter((point) => !start || point.date >= start);
}

function filteredQueries() {
  const query = state.query.trim().toLowerCase();
  return (state.snapshot?.queries || []).filter((item) => {
    if (state.site && item.site_id !== state.site) return false;
    if (!query) return true;
    return [item.query, item.site_id, ...(item.badges || [])].some((value) =>
      String(value).toLowerCase().includes(query),
    );
  });
}

function filteredPages() {
  const query = state.query.trim().toLowerCase();
  return (state.snapshot?.pages || []).filter((item) => {
    if (state.site && item.site_id !== state.site) return false;
    if (!query) return true;
    return [item.url, item.site_id, ...(item.issues || [])].some((value) =>
      String(value).toLowerCase().includes(query),
    );
  });
}

function filteredOpportunities() {
  const query = state.query.trim().toLowerCase();
  return opportunities().filter((item) => {
    if (state.oppFilter !== "all" && item.status !== state.oppFilter) return false;
    if (!query) return true;
    return [item.title, item.target_page, item.target_query, item.type, item.reason]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function kpiCards(current, previous) {
  return `
    <div class="metrics">
      <div class="metric">
        <span>${t("clicks")}</span>
        <strong>${n(current.clicks)}</strong>
        <div class="metric-delta">${deltaHtml(current.clicks, previous.clicks)} <small>${t("prevPeriod")}</small></div>
      </div>
      <div class="metric">
        <span>${t("impressions")}</span>
        <strong>${n(current.impressions)}</strong>
        <div class="metric-delta">${deltaHtml(current.impressions, previous.impressions)} <small>${t("prevPeriod")}</small></div>
      </div>
      <div class="metric">
        <span>${t("ctr")}</span>
        <strong>${pct(current.ctr)}</strong>
        <div class="metric-delta">${deltaHtml(current.ctr, previous.ctr, { kind: "pct" })} <small>${t("prevPeriod")}</small></div>
      </div>
      <div class="metric">
        <span>${t("avgPosition")}</span>
        <strong>${pos1(current.position)}</strong>
        <div class="metric-delta">${deltaHtml(current.position, previous.position, { kind: "pos", invert: true })} <small>${t("prevPeriod")}</small></div>
      </div>
    </div>
  `;
}

function trendChart(points) {
  if (!points.length) return `<div class="empty">${t("noTrend")}</div>`;
  const step = 14;
  const width = points.length * step;
  const height = 120;
  const maxClicks = Math.max(...points.map((point) => point.clicks), 1);
  const maxImpressions = Math.max(...points.map((point) => point.impressions), 1);
  const bars = points
    .map((point, index) => {
      const x = index * step;
      const impH = Math.max(Math.round((point.impressions / maxImpressions) * (height - 8)), 2);
      const clickH = Math.max(Math.round((point.clicks / maxClicks) * (height - 34)), 2);
      return `
      <g>
        <title>${point.date}: ${n(point.clicks)} ${t("clicks").toLowerCase()} / ${n(point.impressions)} ${t("impressions").toLowerCase()}</title>
        <rect x="${x + 1}" y="${height - impH}" width="${step - 2}" height="${impH}" rx="2" class="bar-impressions"></rect>
        <rect x="${x + 4}" y="${height - clickH}" width="${step - 8}" height="${clickH}" rx="2" class="bar-clicks"></rect>
      </g>
    `;
    })
    .join("");
  const first = points[0]?.date || "";
  const last = points[points.length - 1]?.date || "";
  return `
    <div class="trend">
      <div class="trend-legend">
        <span><i class="dot dot-clicks"></i>${t("clicks")}</span>
        <span><i class="dot dot-impressions"></i>${t("impressions")}</span>
        <span class="muted">${date(first)} – ${date(last)}</span>
      </div>
      <div class="trend-scroll">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="trend-svg" role="img" aria-label="${t("clicksTrend")}">${bars}</svg>
      </div>
    </div>
  `;
}

function badgeList(badges, group = "badge") {
  if (!badges?.length) return "";
  return badges
    .map((badge) => `<span class="badge badge-${escapeHtml(badge)}">${escapeHtml(enumLabel(badge, group))}</span>`)
    .join(" ");
}

function statusBadge(status) {
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function warningsPanel(siteId = "") {
  const items = (state.snapshot?.warnings || []).filter((item) => !siteId || !item.site_id || item.site_id === siteId);
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

function siteName(siteId) {
  return state.snapshot?.sites?.find((site) => site.site_id === siteId)?.property_url || siteId;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const totals = scopedTotals();
  const queries = filteredQueries();
  const movers = [...queries].sort(
    (a, b) => b.clicks - (b.previous?.clicks || 0) - (a.clicks - (a.previous?.clicks || 0)),
  );
  const gainers = movers.slice(0, 5);
  const losers = movers
    .slice(-5)
    .reverse()
    .filter((item) => item.clicks - (item.previous?.clicks || 0) < 0);
  const reviewItems = opportunities().filter((item) => item.status === "needs_review");
  els.content.innerHTML = `
    ${warningsPanel(state.site)}
    ${kpiCards(totals.current, totals.previous)}
    <div class="overview-panel wide">
      <h2>${t("clicksTrend")}</h2>
      ${trendChart(currentWindowDaily())}
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("movers")}</h2>
        ${gainers.map((item) => moverRow(item)).join("") || `<div class="empty">${t("empty")}</div>`}
        ${losers.length ? `<h3 class="panel-subhead">${t("losers")}</h3>${losers.map((item) => moverRow(item)).join("")}` : ""}
      </div>
      <div class="overview-panel">
        <h2>${t("siteFreshness")}</h2>
        ${sitesInScope()
          .map(
            (site) => `
          <a class="health-row" href="#/sites">
            <span><strong>${escapeHtml(site.property_url)}</strong><small>${t("lastSync")} ${escapeHtml(site.last_sync_at ? new Date(site.last_sync_at).toLocaleString() : "-")}</small></span>
            <span class="num">${n(site.totals?.clicks)} ${t("clicks").toLowerCase()}</span>
            <span class="status ${escapeHtml(site.status)}">${escapeHtml(enumLabel(site.status))}</span>
          </a>
        `,
          )
          .join("")}
      </div>
      <div class="overview-panel wide">
        <div class="row between">
          <h2>${t("opportunityQueue")}</h2>
          <a class="muted" href="#/opportunities">${t("viewAll")} →</a>
        </div>
        ${
          reviewItems
            .slice(0, 4)
            .map(
              (item) => `
          <a class="health-row" href="#/opportunities">
            <span><strong>${t("opportunity")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(enumLabel(item.type, "type"))} · ${escapeHtml(item.target_query || item.target_page || "")}</small></span>
            <span class="num">${escapeHtml(item.expected_impact.split(".")[0])}</span>
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty">${t("noOpportunities")}</div>`
        }
      </div>
    </section>
  `;
}

function moverRow(item) {
  const diff = item.clicks - (item.previous?.clicks || 0);
  return `
    <a class="movement-row" href="#/queries/${encodeURIComponent(item.query_id)}">
      <span><strong>${escapeHtml(item.query)}</strong><small>${n(item.clicks)} ${t("clicks").toLowerCase()} · ${t("position")} ${pos1(item.position)}</small></span>
      <span class="num ${diff < 0 ? "negative" : "positive"}">${diff >= 0 ? "+" : "−"}${n(Math.abs(diff))}</span>
    </a>
  `;
}

function renderQueries() {
  els.title.textContent = t("queries");
  const items = filteredQueries().sort((a, b) => b.clicks - a.clicks);
  els.subtitle.textContent = `${items.length} ${t("queries").toLowerCase()} · ${state.site ? escapeHtml(siteName(state.site)) : t("allSites")}`;
  els.content.innerHTML = metricRowAnd(queriesTable(items));
}

function metricRowAnd(body) {
  const totals = scopedTotals();
  return `${kpiCards(totals.current, totals.previous)}${body}`;
}

function queriesTable(items) {
  if (!items.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("query")}</th><th class="num">${t("clicks")}</th><th class="num">${t("impressions")}</th><th class="num">${t("ctr")}</th><th class="num">${t("position")}</th><th>${t("badges")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td><a href="#/queries/${encodeURIComponent(item.query_id)}"><div class="strong">${escapeHtml(item.query)}</div></a><div class="muted">${escapeHtml(siteName(item.site_id))}</div></td>
              <td class="num">${n(item.clicks)} ${deltaHtml(item.clicks, item.previous?.clicks)}</td>
              <td class="num">${n(item.impressions)} ${deltaHtml(item.impressions, item.previous?.impressions)}</td>
              <td class="num">${pct(item.ctr)}</td>
              <td class="num">${pos1(item.position)} ${deltaHtml(item.position, item.previous?.position, { kind: "pos", invert: true })}</td>
              <td>${badgeList(item.badges)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderQueryDetail() {
  const item = (state.snapshot?.queries || []).find((query) => query.query_id === state.route.id);
  if (!item) {
    renderQueries();
    return;
  }
  els.title.textContent = item.query;
  els.subtitle.textContent = `${siteName(item.site_id)} · ${t("position")} ${pos1(item.position)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        ${entityMetricCards(item)}
        <div class="overview-panel wide">
          <h2>${t("clicksTrend")}</h2>
          ${trendChart(item.trend || [])}
        </div>
        <div class="overview-panel wide">
          <h2>${t("topPages")}</h2>
          ${miniTable(item.top_pages || [], "url")}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("query")}</h2>
        <dl>
          <dt>${t("site")}</dt><dd>${escapeHtml(siteName(item.site_id))}</dd>
          <dt>${t("badges")}</dt><dd>${badgeList(item.badges) || "—"}</dd>
          <dt>${t("ctr")}</dt><dd>${pct(item.ctr)}</dd>
          <dt>${t("prevPeriod")}</dt><dd>${n(item.previous?.clicks)} ${t("clicks").toLowerCase()} · ${t("position")} ${pos1(item.previous?.position)}</dd>
        </dl>
        ${item.agent_notes ? `<h2>${t("agentNotes")}</h2><p class="agent-notes">${escapeHtml(item.agent_notes)}</p>` : ""}
      </aside>
    </section>
  `;
}

function renderPages() {
  els.title.textContent = t("pages");
  const items = filteredPages().sort((a, b) => b.clicks - a.clicks);
  els.subtitle.textContent = `${items.length} ${t("pages").toLowerCase()} · ${state.site ? escapeHtml(siteName(state.site)) : t("allSites")}`;
  els.content.innerHTML = metricRowAnd(`
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("page")}</th><th class="num">${t("clicks")}</th><th class="num">${t("impressions")}</th><th class="num">${t("ctr")}</th><th class="num">${t("position")}</th><th>${t("issues")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td><a href="#/pages/${encodeURIComponent(item.page_id)}"><div class="strong">${escapeHtml(displayPath(item.url))}</div></a><div class="muted">${escapeHtml(siteName(item.site_id))}</div></td>
              <td class="num">${n(item.clicks)} ${deltaHtml(item.clicks, item.previous?.clicks)}</td>
              <td class="num">${n(item.impressions)} ${deltaHtml(item.impressions, item.previous?.impressions)}</td>
              <td class="num">${pct(item.ctr)}</td>
              <td class="num">${pos1(item.position)} ${deltaHtml(item.position, item.previous?.position, { kind: "pos", invert: true })}</td>
              <td>${badgeList(item.issues)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `);
}

function renderPageDetail() {
  const item = (state.snapshot?.pages || []).find((page) => page.page_id === state.route.id);
  if (!item) {
    renderPages();
    return;
  }
  els.title.textContent = displayPath(item.url);
  els.subtitle.textContent = `${siteName(item.site_id)} · ${t("position")} ${pos1(item.position)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        ${entityMetricCards(item)}
        <div class="overview-panel wide">
          <h2>${t("clicksTrend")}</h2>
          ${trendChart(item.trend || [])}
        </div>
        <div class="overview-panel wide">
          <h2>${t("topQueries")}</h2>
          ${miniTable(item.top_queries || [], "query")}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("page")}</h2>
        <dl>
          <dt>URL</dt><dd><a class="external" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></dd>
          <dt>${t("site")}</dt><dd>${escapeHtml(siteName(item.site_id))}</dd>
          <dt>${t("issues")}</dt><dd>${badgeList(item.issues) || "—"}</dd>
          <dt>${t("prevPeriod")}</dt><dd>${n(item.previous?.clicks)} ${t("clicks").toLowerCase()} · ${t("position")} ${pos1(item.previous?.position)}</dd>
        </dl>
        ${item.agent_notes ? `<h2>${t("agentNotes")}</h2><p class="agent-notes">${escapeHtml(item.agent_notes)}</p>` : ""}
      </aside>
    </section>
  `;
}

function entityMetricCards(item) {
  return kpiCards(
    { clicks: item.clicks, impressions: item.impressions, ctr: item.ctr, position: item.position },
    item.previous || {},
  );
}

function miniTable(rows, keyField) {
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap flush">
      <table class="mini">
        <thead>
          <tr><th>${keyField === "url" ? t("page") : t("query")}</th><th class="num">${t("clicks")}</th><th class="num">${t("impressions")}</th><th class="num">${t("position")}</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <td class="strong">${escapeHtml(keyField === "url" ? displayPath(row.url) : row.query)}</td>
              <td class="num">${n(row.clicks)}</td>
              <td class="num">${n(row.impressions)}</td>
              <td class="num">${pos1(row.position)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

const OPP_FILTERS = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

function renderOpportunities() {
  els.title.textContent = t("opportunities");
  const all = opportunities();
  const items = filteredOpportunities();
  els.subtitle.textContent = `${all.filter((item) => item.status === "needs_review").length} ${t("needsReview")}`;
  const locked = Boolean(state.settings?.lock);
  const chips = OPP_FILTERS.map((filter) => {
    const count = filter === "all" ? all.length : all.filter((item) => item.status === filter).length;
    const label = filter === "all" ? t("viewAll") : enumLabel(filter);
    return `<button type="button" class="chip ${state.oppFilter === filter ? "active" : ""}" data-opp-filter="${filter}" title="${escapeHtml(label)}">${escapeHtml(label)} <b>${count}</b></button>`;
  }).join("");
  els.content.innerHTML = `
    ${locked ? `<div class="warnings"><div class="warning"><strong>${t("lockBanner")}</strong><span>${escapeHtml(state.settings.lock?.message || "")}</span></div></div>` : ""}
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    <div class="chip-row">${chips}</div>
    <div class="opp-list">
      ${items.map((item) => opportunityCard(item, locked)).join("") || `<div class="empty">${t("noOpportunities")}</div>`}
    </div>
  `;
}

function opportunityCard(item, locked) {
  const disabled = locked ? "disabled" : "";
  const targetBits = [
    item.target_page
      ? `<a class="external" href="${escapeHtml(item.target_page)}" target="_blank" rel="noreferrer">${escapeHtml(displayPath(item.target_page))}</a>`
      : "",
    item.target_query ? `<span class="badge">${escapeHtml(item.target_query)}</span>` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `
    <article class="opp-card" data-opp-id="${escapeHtml(item.id)}">
      <header class="opp-head">
        <span class="opp-ref">${t("opportunity")} #${item.ref}</span>
        <span class="badge">${escapeHtml(enumLabel(item.type, "type"))}</span>
        ${statusBadge(item.status)}
        <span class="muted opp-site">${escapeHtml(siteName(item.site_id))}</span>
      </header>
      <h3>${escapeHtml(item.title)}</h3>
      ${targetBits ? `<div class="opp-target"><span class="muted">${t("target")}:</span> ${targetBits}</div>` : ""}
      <p class="opp-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>
      <p class="opp-impact"><span class="muted">${t("expectedImpact")}:</span> ${escapeHtml(item.expected_impact)}</p>
      ${item.agent_notes ? `<p class="agent-notes">${escapeHtml(item.agent_notes)}</p>` : ""}
      <label class="opp-label" for="draft-${escapeHtml(item.id)}">${t("draft")}</label>
      <textarea id="draft-${escapeHtml(item.id)}" class="opp-draft" rows="6" ${disabled}>${escapeHtml(item.draft || "")}</textarea>
      ${
        item.decision
          ? `
        <div class="opp-decision">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(decisionStatus(item.decision.action)))}</strong>
          ${item.decision.note ? `<span>${escapeHtml(item.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(item.decision.decided_at ? new Date(item.decision.decided_at).toLocaleString() : "")}</small>
        </div>
      `
          : ""
      }
      ${
        item.execution
          ? `
        <div class="opp-execution">
          <strong>${t("execution")}: ${escapeHtml(enumLabel(item.execution.operation, "operation"))} · ${escapeHtml(enumLabel(item.execution.status))}</strong>
          ${item.execution.detail ? `<span>${escapeHtml(item.execution.detail)}</span>` : ""}
        </div>
      `
          : ""
      }
      <label class="opp-label" for="note-${escapeHtml(item.id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.id)}" class="opp-note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}></textarea>
      <div class="opp-actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(item.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(item.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(item.id)}" title="${t("saveDraft")}" ${disabled}>${t("saveDraft")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(item.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
    </article>
  `;
}

function decisionStatus(action) {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return "needs_review";
}

async function submitDecision(id, action) {
  const note = document.querySelector(`#note-${cssEscape(id)}`)?.value || "";
  const draft = document.querySelector(`#draft-${cssEscape(id)}`)?.value;
  if (state.demo) {
    state.demoDecisions[id] = { action, note, draft: draft ?? null, decided_at: new Date().toISOString() };
    render();
    return;
  }
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, action, note, draft }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    els.subtitle.textContent = body.error || `Decision failed: ${res.status}`;
    return;
  }
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  render();
}

function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function renderSites() {
  els.title.textContent = t("sites");
  const sites = state.snapshot?.sites || [];
  els.subtitle.textContent = `${sites.length} ${t("sites").toLowerCase()}`;
  els.content.innerHTML = sites.length
    ? `
    <div class="account-grid">
      ${sites
        .map(
          (site) => `
        <a class="account-card" href="#/overview" data-site-pick="${escapeHtml(site.site_id)}">
          <div class="row between"><strong>${escapeHtml(site.property_url)}</strong><span class="badge">${escapeHtml(enumLabel(site.verification_type, "verification"))}</span></div>
          <div class="muted">${t("permission")}: ${escapeHtml(site.permission_level || "unknown")} · ${t("lastSync")} ${escapeHtml(site.last_sync_at ? new Date(site.last_sync_at).toLocaleString() : "-")}</div>
          <div class="balance">${n(site.totals?.clicks)} <small class="muted">${t("clicks").toLowerCase()} / 28d</small></div>
          <div class="row stats">
            <span>${t("impressions")} ${n(site.totals?.impressions)}</span>
            <span>${t("ctr")} ${pct(site.totals?.ctr)}</span>
            <span>${t("avgPosition")} ${pos1(site.totals?.position)}</span>
          </div>
          <div class="row stats">
            <span>${deltaHtml(site.totals?.clicks, site.previous?.clicks)} ${t("clicks").toLowerCase()}</span>
            <span>${deltaHtml(site.totals?.position, site.previous?.position, { kind: "pos", invert: true })} ${t("position").toLowerCase()}</span>
          </div>
          <div class="status ${escapeHtml(site.status)}">${escapeHtml(enumLabel(site.status))}</div>
        </a>
      `,
        )
        .join("")}
    </div>
  `
    : `<div class="empty">${t("setupNeeded")}</div>`;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const auth = summary.auth || {};
  const sync = summary.sync || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("syncWindow")}</dt><dd>${escapeHtml(String(sync.window_days ?? 28))} ${t("days")} · row limit ${escapeHtml(String(sync.row_limit ?? 250))}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("authMethod")}</h2>
        <dl>
          <dt>${t("authMethod")}</dt><dd>${escapeHtml(auth.method || "service_account")}</dd>
          <dt><code>${escapeHtml(auth.service_account_file_env || "")}</code></dt><dd>${auth.service_account_ready ? t("envReady") : t("envMissing")}</dd>
          <dt><code>${escapeHtml(auth.access_token_env || "")}</code></dt><dd>${auth.access_token_ready ? t("envReady") : t("envMissing")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("sites")}</h2>
        ${
          (summary.sites || [])
            .map(
              (site) => `
          <div class="settings-account">
            <strong>${escapeHtml(site.property_url)}</strong>
            <span>${escapeHtml(site.site_id)}</span>
            <span>${escapeHtml(enumLabel(site.verification_type, "verification"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}

function displayPath(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
  } catch {
    return url;
  }
}

function render() {
  renderShell();
  if (state.route.view === "queries" && state.route.id) renderQueryDetail();
  else if (state.route.view === "queries") renderQueries();
  else if (state.route.view === "pages" && state.route.id) renderPageDetail();
  else if (state.route.view === "pages") renderPages();
  else if (state.route.view === "opportunities") renderOpportunities();
  else if (state.route.view === "sites") renderSites();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
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
els.site?.addEventListener("change", () => {
  state.site = els.site.value;
  localStorage.setItem("kelly-seo-site", state.site);
  render();
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-seo-language", state.lang);
  populateSiteSelect();
  render();
});
els.content.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-opp-filter]");
  if (chip) {
    state.oppFilter = chip.dataset.oppFilter;
    render();
    return;
  }
  const button = event.target.closest("[data-decision]");
  if (button && !button.disabled) {
    submitDecision(button.dataset.id, button.dataset.decision);
    return;
  }
  const sitePick = event.target.closest("[data-site-pick]");
  if (sitePick) {
    state.site = sitePick.dataset.sitePick;
    localStorage.setItem("kelly-seo-site", state.site);
    if (els.site) els.site.value = state.site;
  }
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
