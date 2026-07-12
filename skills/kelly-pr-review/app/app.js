import { closeHelp, openHelp, renderDetail, renderList } from "./js/review-views.js";
export let state = { items: [], counts: {}, batch: null, lock: { locked: false }, config_summary: {} };
const params = new URLSearchParams(window.location.search);
const demoScenario = params.get("demo") || "";
const LANGUAGE_STORAGE_KEY = "kelly-pr-review.uiLanguage";
export let languageMode = normalizeLanguageMode(
  params.get("lang") || localStorage.getItem(LANGUAGE_STORAGE_KEY) || "auto",
);
let mode = modeForDemo(demoScenario);
let repoFilter = "all";
export const reviewStore = { selectedId: null, saveTimer: null };
let refreshTimer = null;
const language = resolveLanguage();
let isApplyingRoute = false;
let routeNeedsReplace = false;
let mobileDetailOpen = false;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-pr-review.sidebarCollapsed";

const I18N = {
  en: {
    "brand.subtitle": "GitHub review desk",
    "filter.needs_review": "Needs your review",
    "filter.to_approve": "Ready to approve",
    "filter.approved": "Approved",
    "filter.needs_test": "Needs test",
    "filter.tested": "Tested",
    "filter.blocked": "Blocked",
    "filter.done": "Done",
    "filter.all": "All",
    "page.inbox": "Inbox",
    repo: "Repo",
    all_repos: "All repos",
    locked: "Locked",
    "lock.default": "The local files are locked for a moment.",
    "search.placeholder": "Search title, repo, author",
    "table.title": "Title",
    "table.status": "Status",
    "table.changes": "Changes",
    "table.updated": "Updated",
    "help.title": "Help & Settings",
    "help.subtitle": "Local file contract and configuration",
    language: "Language",
    "language.auto": "Auto",
    "language.english": "English",
    "language.chinese": "中文",
    "language.saved": "Language updated",
    close: "Close",
    refresh: "Refresh",
    "setup.title": "Local setup",
    "loading.config": "Loading configuration...",
    "batch.none": "No batch loaded",
    "batch.generated": "{id} · generated {time} ago",
    "ready.as": "Ready as {handle}",
    "gh.defaults": "Using gh CLI defaults.",
    "next.generate.title": "Next step: generate a review batch",
    "next.generate.body": "Run /kelly-pr-review to fetch pull requests with gh CLI.",
    "next.execute.title": "Next step: execute {count} approved review{s}",
    "next.execute.body": "Ask /kelly-pr-review to execute approved decisions, or run the dry-run script first.",
    "next.review.title": "Next step: review {count} pull request{s}",
    "next.review.body": "Open each item, adjust the review body, then choose an action.",
    "next.clear.title": "Queue is clear",
    "next.clear.body": "Generate a new batch when you want to refresh GitHub state.",
    "mode.all": "All pull requests",
    "mode.needs_review": "Needs your review",
    "mode.to_approve": "Ready to approve",
    "mode.approved": "Approved",
    "mode.needs_test": "Needs test",
    "mode.tested": "Tested",
    "mode.done": "Done",
    "mode.blocked": "Blocked",
    "empty.list": "No pull requests in this view",
    "empty.detail": "Select a pull request",
    open_pr: "Open PR",
    recommendation: "Recommendation",
    risk: "Risk",
    changed_files: "Changed files",
    no_changed_files: "No changed files loaded",
    more: "more",
    review_body: "Review body",
    review_note: "Review note",
    patch_excerpt: "Patch excerpt",
    action: "Action",
    "decision.saved": "Decision saved",
    "no.recommendation": "No recommendation loaded.",
    unknown: "unknown",
    normal: "normal",
    "help.body":
      "This UI only reads and writes local files. GitHub actions happen later through the skill execution script.",
    "help.flow":
      "Typical flow: generate a batch, review PRs here, then execute approved decisions. Default execution is dry-run.",
    data_reader: "Data reader",
    config_source: "Config source",
    batch_file: "Batch file",
    decision_file: "Decision file",
    execution_report: "Execution report",
    reviewer: "Reviewer",
    repositories: "Repositories",
    not_configured: "not configured",
    no_repos: "No repos configured",
    "status.needs_review": "Needs review",
    "status.to_approve": "Ready",
    "status.approved": "Approved",
    "status.merged": "Merged",
    "status.needs_test": "Needs test",
    "status.tested": "Tested",
    "status.done": "Done",
    "status.blocked": "Blocked",
    "action.approve": "Approve",
    "action.comment": "Comment",
    "action.request_changes": "Request changes",
    "action.no_action": "No action",
    "action.needs_review": "Needs review",
    "action.block": "Block",
    "action.review": "Review",
    "tested.title": "Manual test",
    "tested.body": "Merged PRs need a local test note or screenshot before they count as tested.",
    "tested.mark": "Mark tested",
    "tested.unmark": "Clear tested",
    "tested.saved": "Tested status saved",
    "tested.at": "Tested {time} ago",
    "tested.not_yet": "Not tested locally",
    "tested.note.placeholder": "What did you verify?",
    "tested.screenshot": "Screenshot evidence",
    "tested.need_evidence": "Add a test note or upload a screenshot first.",
    "merged.at": "Merged {time} ago",
  },
  "zh-CN": {
    "brand.subtitle": "GitHub 审阅台",
    "filter.needs_review": "需要审阅",
    "filter.to_approve": "待批准",
    "filter.approved": "已批准",
    "filter.needs_test": "未测试验证",
    "filter.tested": "已测试",
    "filter.blocked": "受阻",
    "filter.done": "完成",
    "filter.all": "全部",
    "page.inbox": "收件箱",
    repo: "仓库",
    all_repos: "全部仓库",
    locked: "已锁定",
    "lock.default": "本地文件暂时被锁定。",
    "search.placeholder": "搜索标题、仓库、作者",
    "table.title": "标题",
    "table.status": "状态",
    "table.changes": "改动",
    "table.updated": "更新",
    "help.title": "帮助与设置",
    "help.subtitle": "本地文件协议与配置",
    language: "语言",
    "language.auto": "自动",
    "language.english": "English",
    "language.chinese": "中文",
    "language.saved": "语言已更新",
    close: "关闭",
    refresh: "刷新",
    "setup.title": "本地设置",
    "loading.config": "正在加载配置...",
    "batch.none": "未加载批次",
    "batch.generated": "{id} · {time} 前生成",
    "ready.as": "当前身份 {handle}",
    "gh.defaults": "使用 gh CLI 默认设置。",
    "next.generate.title": "下一步：生成审阅批次",
    "next.generate.body": "运行 /kelly-pr-review 拉取需要审阅的 Pull Request。",
    "next.execute.title": "下一步：执行 {count} 个已批准审阅",
    "next.execute.body": "让 /kelly-pr-review 执行已批准决定，或先运行 dry-run。",
    "next.review.title": "下一步：审阅 {count} 个 Pull Request",
    "next.review.body": "打开项目，调整 review 内容，然后选择动作。",
    "next.clear.title": "队列已清空",
    "next.clear.body": "需要刷新 GitHub 状态时再生成新批次。",
    "mode.all": "全部 Pull Request",
    "mode.needs_review": "需要你审阅",
    "mode.to_approve": "待批准",
    "mode.approved": "已批准",
    "mode.needs_test": "未测试验证",
    "mode.tested": "已测试",
    "mode.done": "完成",
    "mode.blocked": "受阻",
    "empty.list": "这个视图没有 Pull Request",
    "empty.detail": "选择一个 Pull Request",
    open_pr: "打开 PR",
    recommendation: "建议",
    risk: "风险",
    changed_files: "改动文件",
    no_changed_files: "没有加载改动文件",
    more: "更多",
    review_body: "Review 内容",
    review_note: "Review 备注",
    patch_excerpt: "Patch 片段",
    action: "动作",
    "decision.saved": "决定已保存",
    "no.recommendation": "没有加载建议。",
    unknown: "未知",
    normal: "普通",
    "help.body": "这个 UI 只读写本地文件。GitHub 操作稍后由 skill 执行脚本完成。",
    "help.flow": "典型流程：生成批次，在这里审阅 PR，然后执行已批准决定。默认执行为 dry-run。",
    data_reader: "数据读取器",
    config_source: "配置来源",
    batch_file: "批次文件",
    decision_file: "决定文件",
    execution_report: "执行报告",
    reviewer: "审阅者",
    repositories: "仓库",
    not_configured: "未配置",
    no_repos: "未配置仓库",
    "status.needs_review": "需审阅",
    "status.to_approve": "就绪",
    "status.approved": "已批准",
    "status.merged": "已合并",
    "status.needs_test": "未测试",
    "status.tested": "已测试",
    "status.done": "完成",
    "status.blocked": "受阻",
    "action.approve": "批准",
    "action.comment": "评论",
    "action.request_changes": "要求修改",
    "action.no_action": "无需操作",
    "action.needs_review": "需要审阅",
    "action.block": "阻止",
    "action.review": "审阅",
    "tested.title": "人工测试",
    "tested.body": "合并后的 PR 需要留下本地测试说明或截图证据，才算已测试。",
    "tested.mark": "标记已测试",
    "tested.unmark": "清除已测试",
    "tested.saved": "测试状态已保存",
    "tested.at": "{time} 前测试",
    "tested.not_yet": "本地未测试",
    "tested.note.placeholder": "你验证了什么？",
    "tested.screenshot": "截图证据",
    "tested.need_evidence": "请先填写测试说明或上传截图。",
    "merged.at": "{time} 前合并",
  },
};

export const $ = (id) => document.getElementById(id);

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  $("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = $("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

export function setMobileDetailOpen(open) {
  mobileDetailOpen = Boolean(open);
  document.body.classList.toggle("mobile-detail-open", mobileDetailOpen);
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    setMobileDetailOpen(Boolean(reviewStore.selectedId) && mobileDetailOpen);
  } else {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function toggleSidebar() {
  if (isMobileLayout()) setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function t(key, params = {}) {
  return String(I18N[language]?.[key] || I18N.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

function normalizeLanguageMode(value) {
  if (value === "zh" || value === "zh-CN") return "zh-CN";
  if (value === "en") return "en";
  return "auto";
}

function browserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  return languages.some((item) => String(item).toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}

function resolveLanguage() {
  return languageMode === "auto" ? browserLanguage() : languageMode;
}

export function setLanguageMode(value) {
  languageMode = normalizeLanguageMode(value);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, languageMode);
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("lang", languageMode);
  window.location.search = nextParams.toString();
}

function applyTranslations() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
}

function syncModeButtons() {
  document.querySelectorAll("#filters button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function timeAgo(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

export function statusBadge(item) {
  const status = item.status || "needs_review";
  const labels = {
    needs_review: t("status.needs_review"),
    to_approve: t("status.to_approve"),
    approved: t("status.approved"),
    merged: t("status.merged"),
    done: t("status.done"),
    blocked: t("status.blocked"),
  };
  const klass =
    status === "approved" || status === "done"
      ? "ok"
      : status === "blocked"
        ? "danger"
        : status === "to_approve"
          ? "warn"
          : "";
  return `<span class="badge ${klass}">${escapeHtml(labels[status] || status)}</span>`;
}

export function testedBadge(item) {
  if (item.verification_status === "tested")
    return `<span class="badge tested">${escapeHtml(t("status.tested"))}</span>`;
  if (item.verification_status === "needs_test")
    return `<span class="badge warn">${escapeHtml(t("status.needs_test"))}</span>`;
  return "";
}

export function actionBadge(action) {
  const labels = {
    approve: t("action.approve"),
    comment: t("action.comment"),
    request_changes: t("action.request_changes"),
    no_action: t("action.no_action"),
    needs_review: t("action.needs_review"),
    block: t("action.block"),
  };
  const klass =
    action === "approve"
      ? "ok"
      : action === "request_changes" || action === "block"
        ? "danger"
        : action === "comment"
          ? "warn"
          : "";
  return `<span class="badge ${klass}">${escapeHtml(labels[action] || action || t("action.review"))}</span>`;
}

export function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}

export async function api(path, body = null) {
  const url = withContextParams(path);
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function withContextParams(path) {
  const url = new URL(path, window.location.origin);
  for (const key of ["demo", "lang"]) {
    const value = params.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  url.searchParams.set("lang", language);
  return `${url.pathname}${url.search}`;
}

function modeForDemo(value) {
  if (value === "ready") return "to_approve";
  if (["approved", "needs_test", "tested", "blocked", "done", "all"].includes(value)) return value;
  return "needs_review";
}

function routeModes() {
  return ["all", "needs_review", "to_approve", "approved", "needs_test", "tested", "done", "blocked"];
}

function encodeRoutePart(value) {
  return encodeURIComponent(String(value || ""));
}

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function routeFor(nextMode = mode, nextSelectedId = reviewStore.selectedId) {
  const modePart = routeModes().includes(nextMode) ? nextMode : "needs_review";
  return nextSelectedId ? `/${modePart}/${encodeRoutePart(nextSelectedId)}` : `/${modePart}`;
}

function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeRoutePart);
  return {
    mode: routeModes().includes(parts[0]) ? parts[0] : mode,
    selectedId: parts[1] || null,
  };
}

function applyRouteFromHash() {
  isApplyingRoute = true;
  routeNeedsReplace = false;
  const route = parseHashRoute();
  mode = route.mode;
  reviewStore.selectedId = route.reviewStore.selectedId;
  syncModeButtons();
  isApplyingRoute = false;
}

export function syncRoute({ push = false } = {}) {
  if (isApplyingRoute) {
    routeNeedsReplace = true;
    return;
  }
  const target = `#${routeFor()}`;
  if (window.location.hash === target) return;
  if (push) window.location.hash = target;
  else history.replaceState(null, "", target);
}

export function navigateTo(next = {}, { replace = false, reload = false } = {}) {
  if ("mode" in next) mode = next.mode;
  if ("reviewStore.selectedId" in next) reviewStore.selectedId = next.reviewStore.selectedId;
  syncModeButtons();
  const target = `#${routeFor()}`;
  if (window.location.hash === target) {
    if (reload) loadState().catch((error) => toast(error.message));
    else {
      renderList();
      renderDetail();
    }
    return;
  }
  if (replace) {
    history.replaceState(null, "", target);
    if (reload) loadState().catch((error) => toast(error.message));
    else {
      renderList();
      renderDetail();
    }
  } else {
    window.location.hash = target;
  }
}

function countFor(name) {
  if (name === "all") return state.total_cached || 0;
  return state.counts?.[name] || 0;
}

function renderCounts() {
  ["all", "needs_review", "to_approve", "approved", "needs_test", "tested", "done", "blocked"].forEach((name) => {
    const node = $(`count-${name}`);
    if (node) node.textContent = countFor(name);
  });
}

function modeTitle() {
  return (
    {
      all: t("mode.all"),
      needs_review: t("mode.needs_review"),
      to_approve: t("mode.to_approve"),
      approved: t("mode.approved"),
      needs_test: t("mode.needs_test"),
      tested: t("mode.tested"),
      done: t("mode.done"),
      blocked: t("mode.blocked"),
    }[mode] || t("mode.all")
  );
}

function renderHeader() {
  const batch = state.batch || {};
  $("batchMeta").textContent =
    batch.batch_id && batch.batch_id !== "empty"
      ? t("batch.generated", { id: batch.batch_id, time: timeAgo(batch.generated_at) })
      : t("batch.none");
  renderRepoFilter();
  $("sectionTitle").textContent = modeTitle();
  $("listCount").textContent = `${state.items.length}`;

  const onboarding = state.config_summary?.onboarding || {};
  $("setupBody").textContent = onboarding.configured
    ? t("ready.as", { handle: state.config_summary?.reviewer?.handle || "@me" })
    : onboarding.message || t("gh.defaults");

  const approved = countFor("approved");
  const needs = countFor("needs_review") + countFor("to_approve");
  if (!state.total_cached) {
    $("nextTitle").textContent = t("next.generate.title");
    $("nextBody").textContent = t("next.generate.body");
  } else if (approved > 0) {
    $("nextTitle").textContent = t("next.execute.title", { count: approved, s: approved === 1 ? "" : "s" });
    $("nextBody").textContent = t("next.execute.body");
  } else if (needs > 0) {
    $("nextTitle").textContent = t("next.review.title", { count: needs, s: needs === 1 ? "" : "s" });
    $("nextBody").textContent = t("next.review.body");
  } else {
    $("nextTitle").textContent = t("next.clear.title");
    $("nextBody").textContent = t("next.clear.body");
  }
}

function renderRepoFilter() {
  const select = $("repoFilter");
  if (!select) return;
  const repos = state.repos || [];
  const current = repos.some((repo) => repo.repo === repoFilter) ? repoFilter : "all";
  if (current !== repoFilter) repoFilter = current;
  const options = [
    `<option value="all">${escapeHtml(t("all_repos"))} (${state.total_cached || 0})</option>`,
    ...repos.map(
      (repo) =>
        `<option value="${escapeHtml(repo.repo)}">${escapeHtml(repo.repo)} (${escapeHtml(repo.count)})</option>`,
    ),
  ].join("");
  if (select.innerHTML !== options) select.innerHTML = options;
  select.value = repoFilter;
}

export function renderLock() {
  const lock = state.lock || {};
  $("lockBanner").classList.toggle("is-hidden", !lock.locked);
  $("lockMessage").textContent = lock.message || t("lock.default");
  document.querySelectorAll("button, textarea, input").forEach((node) => {
    if (node.id === "searchInput" || node.id === "helpButton" || node.id === "closeHelp") return;
    node.disabled = Boolean(lock.locked);
  });
}

export async function loadState() {
  applyRouteFromHash();
  const q = encodeURIComponent($("searchInput")?.value || "");
  state = await api(`/api/state?mode=${encodeURIComponent(mode)}&repo=${encodeURIComponent(repoFilter)}&q=${q}`);
  renderCounts();
  renderHeader();
  renderLock();
  renderList();
  if (routeNeedsReplace) {
    history.replaceState(null, "", `#${routeFor()}`);
    routeNeedsReplace = false;
  }
}

function wire() {
  document.querySelectorAll("#filters button").forEach((button) => {
    button.addEventListener("click", () => {
      setMobileSidebarOpen(false);
      setMobileDetailOpen(false);
      navigateTo({ mode: button.dataset.mode, selectedId: null }, { reload: true });
    });
  });
  $("sidebarToggle").addEventListener("click", toggleSidebar);
  $("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
  $("sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
  $("detailPanel").addEventListener("click", (event) => {
    if (event.target.closest(".back-to-list")) setMobileDetailOpen(false);
  });
  window.addEventListener("resize", syncResponsiveShell);
  $("searchInput").addEventListener("input", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => loadState().catch((error) => toast(error.message)), 250);
  });
  $("repoFilter").addEventListener("change", () => {
    repoFilter = $("repoFilter").value || "all";
    reviewStore.selectedId = null;
    syncRoute({ push: false });
    loadState().catch((error) => toast(error.message));
  });
  $("reloadButton").addEventListener("click", () => loadState().catch((error) => toast(error.message)));
  $("refreshButton").addEventListener("click", () => loadState().catch((error) => toast(error.message)));
  $("helpButton").addEventListener("click", openHelp);
  $("closeHelp").addEventListener("click", closeHelp);
  $("helpModal").addEventListener("click", (event) => {
    if (event.target === $("helpModal")) closeHelp();
  });
  setInterval(() => {
    const active = document.activeElement;
    if (active && ["TEXTAREA", "INPUT"].includes(active.tagName)) return;
    loadState().catch(() => {});
  }, 5000);
  window.addEventListener("hashchange", () => loadState().catch((error) => toast(error.message)));
}

applyTranslations();
syncResponsiveShell();
syncModeButtons();
wire();
loadState().catch((error) => toast(error.message));
