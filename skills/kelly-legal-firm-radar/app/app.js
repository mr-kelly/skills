import { messages } from "./i18n/messages.js";
import {
  activeHtml,
  dateTime,
  emptyText,
  field,
  fieldTile,
  issueColumn,
  issueTree,
  listValue,
  matchMeterHtml,
  percentText,
  practiceBarHtml,
  redactionStep,
  renderChecks,
  renderEntities,
  renderItems,
  renderReview,
  renderSettings,
  rowHtml,
  sumField,
} from "./js/review-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("legal-app-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  edits: { note: {}, draft: {} },
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "legal-app.sidebarCollapsed";
const AUTO_REFRESH_MS = 15_000;
export const STATUS_ROUTES = new Set(["approved", "done", "blocked"]);
const PROFILE_CLASS_PREFIX = "legal-profile-";
const BUSINESS_PROFILES = {
  "kelly-legal-casebase-ingest": {
    id: "casebase",
    icon: "IN",
    lane: { en: "Ingest QA", zh: "入库质检" },
    primary: { en: "source documents", zh: "来源文书" },
    secondary: { en: "redaction and taxonomy", zh: "脱敏与分类" },
    spotlight: { en: "Document intake line", zh: "文书入库流水线" },
    reviewTitle: { en: "Records waiting for anonymization QA", zh: "等待脱敏质检的记录" },
  },
  "kelly-legal-precedent-desk": {
    id: "precedent",
    icon: "PR",
    lane: { en: "Precedent Research", zh: "类案研究" },
    primary: { en: "matched precedent packs", zh: "匹配类案包" },
    secondary: { en: "similarity, citations, court patterns", zh: "相似度、引用与裁判尺度" },
    spotlight: { en: "Research pack assembly", zh: "类案包组装" },
    reviewTitle: { en: "Research packs waiting for lawyer review", zh: "等待律师复核的类案包" },
  },
  "kelly-legal-matter-strategy": {
    id: "matter",
    icon: "MS",
    lane: { en: "Matter Strategy", zh: "案件策略" },
    primary: { en: "strategy packs", zh: "策略包" },
    secondary: { en: "issues, evidence, pleadings", zh: "争点、证据与文书" },
    spotlight: { en: "Strategy and evidence map", zh: "策略与证据地图" },
    reviewTitle: { en: "Strategies waiting for partner judgment", zh: "等待合伙人判断的策略" },
  },
  "kelly-legal-firm-radar": {
    id: "firm",
    icon: "FR",
    lane: { en: "Firm Radar", zh: "律所雷达" },
    primary: { en: "analytics cards", zh: "分析卡" },
    secondary: { en: "practice mix, talent, proof points", zh: "业务结构、人才与品牌证据" },
    spotlight: { en: "Management analytics board", zh: "管理分析看板" },
    reviewTitle: { en: "Management insights waiting for partner review", zh: "等待管理层复核的经营洞察" },
  },
};

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
  countNeeds: document.querySelector("#count-needs"),
  countReady: document.querySelector("#count-ready"),
  countBlocked: document.querySelector("#count-blocked"),
  language: document.querySelector("#language"),
};

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "auto";
}

export function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function l10n(value) {
  if (value && typeof value === "object")
    return activeLang() === "zh" ? value.zh || value.en || "" : value.en || value.zh || "";
  return value || "";
}

export function currentProfile() {
  const source = state.snapshot?.source || state.settings?.app || "";
  return BUSINESS_PROFILES[source] || BUSINESS_PROFILES["kelly-legal-casebase-ingest"];
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    return;
  }
  setMobileSidebarOpen(false);
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
}

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "review"
      ? "#/review"
      : scenario === "items"
        ? "#/items"
        : scenario === "checks"
          ? "#/checks"
          : scenario === "entities"
            ? "#/entities"
            : scenario === "detail"
              ? `#/items/${encodeURIComponent(items()[0]?.id || "")}`
              : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
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

function shouldSkipAutoRefresh() {
  const active = document.activeElement;
  if (!active) return false;
  return active.matches("textarea, input:not([type='search']), select");
}

function scheduleAutoRefresh() {
  window.setInterval(() => {
    if (shouldSkipAutoRefresh()) return;
    loadState().catch(() => {});
  }, AUTO_REFRESH_MS);
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  if (els.search) els.search.placeholder = t("search");
  if (els.refresh) els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.language) {
    els.language.value = state.lang;
    const labels =
      activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
    for (const option of els.language.options) option.textContent = labels[option.value] || option.textContent;
  }
}

export function items() {
  return (state.snapshot?.items || []).map(effectiveItem);
}

export function entities() {
  return state.snapshot?.entities || [];
}

export function checks() {
  return state.snapshot?.checks || [];
}

function decisions() {
  return state.settings?.decisions?.decisions || {};
}

function effectiveItem(item) {
  const decision = decisions()[item.id];
  // Once execute_decisions has applied a decision, item.status is the
  // authoritative, terminal state (e.g. "done"). A lingering decision record
  // must not keep masking it back to an intermediate status like "approved".
  if (!decision || item.status === "done") return item;
  const statusByAction = {
    approve: "approved",
    request_changes: "changes_requested",
    block: "blocked",
    revise: "needs_review",
  };
  return {
    ...item,
    status: statusByAction[decision.action] || item.status,
    review_note: decision.comment || item.review_note,
    draft: typeof decision.draft === "string" ? decision.draft : item.draft,
    decided_at: decision.decided_at || item.decided_at,
  };
}

export function filteredItems(status) {
  const q = state.query.trim().toLowerCase();
  return items().filter((item) => {
    if (status && item.status !== status) return false;
    if (!q) return true;
    return [item.title, item.summary, item.category, item.owner, item.body, item.recommendation]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export function itemsForRoute() {
  if (state.route.view === "review") return filteredItems("needs_review");
  if (STATUS_ROUTES.has(state.route.view)) return filteredItems(state.route.view);
  return filteredItems();
}

function renderShell() {
  applyI18n();
  const profile = currentProfile();
  document.body.classList.remove(
    ...Object.values(BUSINESS_PROFILES).map((item) => `${PROFILE_CLASS_PREFIX}${item.id}`),
  );
  document.body.classList.add(`${PROFILE_CLASS_PREFIX}${profile.id}`);
  const all = items();
  const needs = all.filter((item) => item.status === "needs_review").length;
  const ready = all.filter((item) => item.status === "approved" || item.status === "done").length;
  const blocked = all.filter((item) => item.status === "blocked").length;
  if (els.countNeeds) els.countNeeds.textContent = needs;
  if (els.countReady) els.countReady.textContent = ready;
  if (els.countBlocked) els.countBlocked.textContent = blocked;
  if (els.syncStatus)
    els.syncStatus.textContent = state.snapshot
      ? `${all.length} ${t("allItems")} · ${checks().length} ${t("checks").toLowerCase()}`
      : t("empty");
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta)
    els.mobileViewMeta.textContent = needs ? `${needs} ${t("needsReview")}` : `${all.length} ${t("allItems")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

export function viewLabel(view) {
  if (view === "review") return t("needsReview");
  if (view === "approved") return t("approved");
  if (view === "done") return t("done");
  if (view === "blocked") return t("blocked");
  if (view === "items") return t("allItems");
  if (view === "checks") return t("checks");
  if (view === "entities") return t("entities");
  if (view === "settings") return t("settings");
  return t("overview");
}

function render() {
  renderShell();
  document.body.classList.toggle("route-detail", Boolean(state.route.id));
  if (!state.snapshot) {
    els.content.innerHTML = `<div class="empty">${escapeHtml(t("empty"))}</div>`;
    return;
  }
  if (state.route.view === "review" || STATUS_ROUTES.has(state.route.view)) renderReview();
  else if (state.route.view === "items") renderItems();
  else if (state.route.view === "checks") renderChecks();
  else if (state.route.view === "entities") renderEntities();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  return `<div class="lock-banner">${escapeHtml(t("lockActive"))}${state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : ""}</div>`;
}

function renderOverview() {
  const metrics = state.snapshot.metrics || {};
  const review = filteredItems("needs_review").slice(0, 5);
  const profile = currentProfile();
  els.title.textContent = state.snapshot.workspace?.title || t("appTitle");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || t("appSubtitle");
  els.content.innerHTML = `
    ${lockBanner()}
    <section class="business-hero ${escapeAttr(profile.id)}">
      <div>
        <div class="business-kicker"><span class="profile-mark">${escapeHtml(profile.icon)}</span>${escapeHtml(l10n(profile.lane))}</div>
        <h2>${escapeHtml(l10n(profile.spotlight))}</h2>
        <p>${escapeHtml(l10n(profile.secondary))}</p>
      </div>
      <div class="business-metrics">${businessMetricsHtml(profile, metrics)}</div>
    </section>
    ${businessOverviewHtml(profile, review)}
    <section class="panel">
      <div class="panel-head"><h2>${escapeHtml(t("activity"))}</h2><span>${escapeHtml(t("generated"))}: ${escapeHtml(dateTime(state.snapshot.generated_at))}</span></div>
      <div class="activity-list">${(state.snapshot.activity_log || [])
        .slice(-5)
        .map((entry) => `<div><b>${escapeHtml(entry.action)}</b><span>${escapeHtml(entry.detail || "")}</span></div>`)
        .join("")}</div>
    </section>`;
}

function metricCard(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function businessMetricsHtml(profile, metrics) {
  const all = items();
  const failed = checks().filter((check) => check.status === "fail" || check.status === "warn").length;
  const ready = all.filter((item) => item.status === "approved" || item.status === "done").length;
  const definitions = {
    casebase: [
      [activeLang() === "zh" ? "来源文书" : "Source docs", metrics.source_docs || all.length],
      [activeLang() === "zh" ? "脱敏提醒" : "Redaction alerts", metrics.pii_warnings ?? failed],
      [activeLang() === "zh" ? "分类完成" : "Taxonomy ready", `${ready}/${all.length || 0}`],
      [activeLang() === "zh" ? "疑似重复" : "Possible dupes", metrics.duplicate_candidates || 1],
    ],
    precedent: [
      [activeLang() === "zh" ? "检索问题" : "Research questions", metrics.query_count || all.length],
      [activeLang() === "zh" ? "高相似类案" : "High matches", metrics.high_matches || sumField("high_match_count")],
      [
        activeLang() === "zh" ? "引用覆盖" : "Citation checks",
        `${checks().filter((check) => check.status === "pass").length}/${checks().length}`,
      ],
      [activeLang() === "zh" ? "本地尺度" : "Court patterns", metrics.local_patterns || 2],
    ],
    matter: [
      [activeLang() === "zh" ? "进行中案件" : "Active matters", all.length],
      [activeLang() === "zh" ? "证据缺口" : "Evidence gaps", metrics.evidence_gaps || sumField("evidence_gap_count")],
      [activeLang() === "zh" ? "临近期限" : "Near deadlines", metrics.deadlines_soon || 1],
      [activeLang() === "zh" ? "可进文书" : "Draft-ready", metrics.draft_ready || ready],
    ],
    firm: [
      [activeLang() === "zh" ? "脱敏样本" : "Anonymized cases", metrics.case_samples || sumField("sample_size")],
      [activeLang() === "zh" ? "业务组" : "Practice groups", metrics.practice_groups || entities().length],
      [activeLang() === "zh" ? "律师画像" : "Lawyer profiles", metrics.lawyers_profiled || sumField("lawyer_count")],
      [activeLang() === "zh" ? "可公开证据" : "Public proof", metrics.public_citable || sumField("public_citable")],
    ],
  };
  return (definitions[profile.id] || definitions.casebase).map(([label, value]) => metricCard(label, value)).join("");
}

function businessOverviewHtml(profile, review) {
  if (profile.id === "precedent") return precedentOverviewHtml(review);
  if (profile.id === "matter") return matterOverviewHtml(review);
  if (profile.id === "firm") return firmOverviewHtml(review);
  return casebaseOverviewHtml(review);
}

function casebaseOverviewHtml(review) {
  const first = review[0] || items()[0];
  const second = items()[1] || first;
  return `<div class="business-layout casebase-layout">
    <section class="panel document-panel wide">
      <div class="panel-head"><h2>${activeLang() === "zh" ? "入库文书流水线" : "Case document intake"}</h2><a href="#/items">${escapeHtml(t("allItems"))}</a></div>
      <div class="document-sheet">
        <div class="sheet-spine">${escapeHtml(field(first, "court", activeLang() === "zh" ? "法院" : "Court"))}</div>
        <div class="sheet-body">
          <span class="source-pill">${escapeHtml(field(first, "procedure", activeLang() === "zh" ? "二审" : "appeal"))}</span>
          <h3>${escapeHtml(first?.title || "")}</h3>
          <p>${escapeHtml(first?.summary || "")}</p>
          <div class="field-grid compact-fields">
            ${fieldTile(activeLang() === "zh" ? "案由" : "Cause", field(first, "cause", first?.category))}
            ${fieldTile(activeLang() === "zh" ? "结果" : "Outcome", field(first, "outcome", "review"))}
            ${fieldTile(activeLang() === "zh" ? "段落引用" : "Source refs", listValue(field(first, "paragraphs")).join(", ") || "3")}
          </div>
        </div>
      </div>
      <div class="redaction-rail">
        ${redactionStep(activeLang() === "zh" ? "身份信息" : "Identities", field(first, "pii_cleared", true))}
        ${redactionStep(activeLang() === "zh" ? "联系方式" : "Contact data", true)}
        ${redactionStep(activeLang() === "zh" ? "经营数据" : "Business metrics", !listValue(first?.risk).includes("business_secret"))}
        ${redactionStep(activeLang() === "zh" ? "分类标签" : "Taxonomy", Boolean(field(first, "cause")))}
      </div>
    </section>
    <section class="panel review-focus">
      <div class="panel-head"><h2>${activeLang() === "zh" ? "待人工脱敏" : "Manual redaction queue"}</h2><a href="#/review">${escapeHtml(t("review"))}</a></div>
      <div class="list compact">${review.map(rowHtml).join("") || emptyText()}</div>
    </section>
    <section class="panel qa-panel">
      <h2>${activeLang() === "zh" ? "入库质检差异点" : "QA-specific controls"}</h2>
      ${fieldTile(activeLang() === "zh" ? "近似重复" : "Near duplicate", field(second, "duplicate_score", "0.18"))}
      ${fieldTile(activeLang() === "zh" ? "抽取置信度" : "Extraction confidence", percentText(field(first, "extraction_confidence", 0.92)))}
      ${fieldTile(activeLang() === "zh" ? "入库专题" : "Casebase bucket", field(first, "ingest_bucket", first?.category))}
    </section>
  </div>`;
}

function precedentOverviewHtml(review) {
  const rows = items();
  return `<div class="business-layout precedent-layout">
    <section class="panel research-panel wide">
      <div class="panel-head"><h2>${activeLang() === "zh" ? "类案检索实验台" : "Precedent research lab"}</h2><a href="#/items">${escapeHtml(t("allItems"))}</a></div>
      <div class="query-strip">${rows
        .map(
          (item) =>
            `<a href="#/items/${encodeURIComponent(item.id)}"><span>${escapeHtml(field(item, "query", item.title))}</span><strong>${escapeHtml(field(item, "match_count", 0))}</strong></a>`,
        )
        .join("")}</div>
      <div class="match-stack">${rows.map(matchMeterHtml).join("")}</div>
    </section>
    <section class="panel court-panel">
      <h2>${activeLang() === "zh" ? "本地裁判尺度" : "Local court pattern"}</h2>
      ${rows
        .map(
          (item) =>
            `<div class="pattern-note"><b>${escapeHtml(field(item, "jurisdiction", item.category))}</b><span>${escapeHtml(field(item, "court_pattern", item.body))}</span></div>`,
        )
        .join("")}
    </section>
    <section class="panel review-focus">
      <div class="panel-head"><h2>${activeHtml("待复核类案包", "Packs needing review")}</h2><a href="#/review">${escapeHtml(t("review"))}</a></div>
      <div class="list compact">${review.map(rowHtml).join("") || emptyText()}</div>
    </section>
  </div>`;
}

function matterOverviewHtml(review) {
  const selected = review[0] || items()[0];
  const gaps = listValue(field(selected, "evidence_gaps_list", field(selected, "evidence_gaps")));
  return `<div class="business-layout matter-layout">
    <section class="panel strategy-panel wide">
      <div class="panel-head"><h2>${activeLang() === "zh" ? "案件策略地图" : "Matter strategy map"}</h2><a href="#/items">${escapeHtml(t("allItems"))}</a></div>
      <div class="issue-board">
        ${issueTree(activeLang() === "zh" ? "争点" : "Issues", field(selected, "issue_tree", ["delivery", "breach", "damages"]))}
        ${issueColumn(activeLang() === "zh" ? "证据" : "Evidence", selected?.evidence || [])}
        ${issueColumn(activeLang() === "zh" ? "路径" : "Options", listValue(field(selected, "negotiation_options", ["demand letter", "filing outline"])))}
      </div>
      <div class="deadline-band">
        <span>${activeLang() === "zh" ? "下一期限" : "Next deadline"}</span>
        <strong>${escapeHtml(field(selected, "deadline", field(selected, "next_deadline", "2026-07-20")))}</strong>
        <p>${escapeHtml(field(selected, "posture", selected?.recommendation || ""))}</p>
      </div>
    </section>
    <section class="panel evidence-panel">
      <h2>${activeLang() === "zh" ? "证据缺口" : "Evidence gaps"}</h2>
      <div class="gap-list">${(gaps.length ? gaps : [selected?.summary || ""]).map((gap) => `<span>${escapeHtml(gap)}</span>`).join("")}</div>
    </section>
    <section class="panel review-focus">
      <div class="panel-head"><h2>${activeLang() === "zh" ? "待合伙人判断" : "Partner judgment queue"}</h2><a href="#/review">${escapeHtml(t("review"))}</a></div>
      <div class="list compact">${review.map(rowHtml).join("") || emptyText()}</div>
    </section>
  </div>`;
}

function firmOverviewHtml(review) {
  const cards = entities();
  return `<div class="business-layout firm-layout">
    <section class="panel firm-panel wide">
      <div class="panel-head"><h2>${activeLang() === "zh" ? "业务结构与画像" : "Practice mix and profiles"}</h2><a href="#/entities">${escapeHtml(t("entities"))}</a></div>
      <div class="practice-bars">${cards.map(practiceBarHtml).join("")}</div>
      <div class="proof-grid">${items()
        .map(
          (item) =>
            `<a href="#/items/${encodeURIComponent(item.id)}"><span>${escapeHtml(item.category || "")}</span><strong>${escapeHtml(field(item, "visibility", ""))}</strong><small>${escapeHtml(item.title)}</small></a>`,
        )
        .join("")}</div>
    </section>
    ${outcomeTrendsPanel()}
    <section class="panel talent-panel">
      <h2>${activeLang() === "zh" ? "律师能力信号" : "Lawyer capability signals"}</h2>
      ${cards
        .map(
          (entity) =>
            `<div class="signal-row"><b>${escapeHtml(entity.title)}</b><span>${escapeHtml(field(entity, "lawyer_count", field(entity, "lawyers", 0)))} ${activeLang() === "zh" ? "名律师" : "lawyers"}</span></div>`,
        )
        .join("")}
    </section>
    <section class="panel review-focus">
      <div class="panel-head"><h2>${activeLang() === "zh" ? "待管理层复核" : "Partner review queue"}</h2><a href="#/review">${escapeHtml(t("review"))}</a></div>
      <div class="list compact">${review.map(rowHtml).join("") || emptyText()}</div>
    </section>
  </div>`;
}

// Outcome trends: a small time-series of win/partial-win rate over recent periods.
// Only firm-radar seeds metrics.outcome_trends; the panel is empty (hidden) otherwise.
function outcomeTrendsPanel() {
  const trends = state.snapshot?.metrics?.outcome_trends || [];
  if (!trends.length) return "";
  return `<section class="panel trends-panel">
    <h2>${activeLang() === "zh" ? "结果趋势" : "Outcome trends"}</h2>
    ${trendChart(trends)}
    <div class="trend-legend">${trends
      .map((point) => `<span><b>${escapeHtml(point.period)}</b>${escapeHtml(percentText(point.win_rate))}</span>`)
      .join("")}</div>
  </section>`;
}

function trendChart(points) {
  const values = points.map((point) => {
    const value = Number(point.win_rate) || 0;
    return value > 1 ? value / 100 : value;
  });
  const width = 280;
  const height = 96;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = values.map((value, index) => `${Math.round(index * step)},${Math.round(height - value * height)}`);
  return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="outcome trend">
    <polyline fill="none" stroke="currentColor" stroke-width="2" points="${coords.join(" ")}" />
    ${values
      .map(
        (value, index) =>
          `<circle cx="${Math.round(index * step)}" cy="${Math.round(height - value * height)}" r="3" fill="currentColor" />`,
      )
      .join("")}
  </svg>`;
}

async function submitDecision(id, action) {
  const payload = {
    id,
    action,
    comment: document.querySelector(`[data-note="${CSS.escape(id)}"]`)?.value || "",
    draft: document.querySelector(`[data-draft="${CSS.escape(id)}"]`)?.value || "",
    demo: Boolean(state.settings?.demo),
  };
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Decision failed: ${res.status}`);
  }
  await loadState();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  render();
});

els.search?.addEventListener("input", (event) => {
  state.query = event.target.value || "";
  render();
});

els.refresh?.addEventListener("click", loadState);
els.mobileRefresh?.addEventListener("click", loadState);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.language?.addEventListener("change", (event) => {
  state.lang = normalizeLang(event.target.value);
  localStorage.setItem("legal-app-language", state.lang);
  render();
});

document.addEventListener("input", (event) => {
  const draftId = event.target?.dataset?.draft;
  const noteId = event.target?.dataset?.note;
  if (draftId) state.edits.draft[draftId] = event.target.value;
  if (noteId) state.edits.note[noteId] = event.target.value;
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action][data-id]");
  if (!button) return;
  event.preventDefault();
  button.disabled = true;
  try {
    await submitDecision(button.dataset.id, button.dataset.action);
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

window.addEventListener("resize", syncResponsiveShell);
syncResponsiveShell();
scheduleAutoRefresh();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
