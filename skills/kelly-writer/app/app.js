import { I18N } from "./i18n/messages.js";
import {
  getSelectedDirection,
  normalizeTodo,
  normalizeTopic,
  renderDistribution,
  renderMainContent,
  renderTodos,
  renderTopics,
} from "./js/editorial-views.js";

const params = new URLSearchParams(window.location.search);
const LANGUAGE_STORAGE_KEY = "kelly-writer.uiLanguage";
let languageMode = normalizeLanguageMode(params.get("lang") || localStorage.getItem(LANGUAGE_STORAGE_KEY) || "auto");
const language = resolveLanguage();
const demoScenario = params.get("demo") || "";

export function t(key) {
  return I18N[language]?.[key] || I18N.en[key] || key;
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

function setLanguageMode(value) {
  languageMode = normalizeLanguageMode(value);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, languageMode);
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("lang", languageMode);
  window.location.search = nextParams.toString();
}

const stages = [
  { id: "topics", label: t("stage.topics"), caption: t("stage.topics.caption") },
  { id: "todos", label: t("stage.todos"), caption: t("stage.todos.caption") },
  { id: "main", label: t("stage.main"), caption: t("stage.main.caption") },
  { id: "distribution", label: t("stage.distribution"), caption: t("stage.distribution.caption") },
];

// Ideation stages (topics/todos/main) are local-only. In busabase mode the skill
// publishes drafts straight to the shared review queue, so only distribution shows.
function visibleStages() {
  if (state.config_summary?.provider === "busabase") {
    return stages.filter((stage) => stage.id === "distribution");
  }
  return stages;
}

export let state = { batch: null, decisions: {}, lock: null };
export const editorStore = {
  activeStage: stageForDemo(demoScenario),
  selectedTopicId: null,
  selectedDirectionId: null,
  selectedTodoId: null,
  selectedDistributionId: null,
};
let editing = false;
let isApplyingRoute = false;
let routeNeedsReplace = false;
let lastAppliedHash = "";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-writer.sidebarCollapsed";

export const els = {
  stageNav: document.querySelector("#stageNav"),
  stagePanel: document.querySelector("#stagePanel"),
  batchMeta: document.querySelector("#batchMeta"),
  lockText: document.querySelector("#lockText"),
  settingsText: document.querySelector("#settingsText"),
  pageTitle: document.querySelector("#pageTitle"),
  refreshBtn: document.querySelector("#refreshBtn"),
  languageSelect: document.querySelector("#languageSelect"),
};

function applyStaticI18n() {
  document.documentElement.lang = language;
  document.querySelector(".settings h2").textContent = t("workspace");
  document.querySelector(".language-control span").textContent = t("language");
  els.languageSelect.value = languageMode;
  els.languageSelect.options[0].textContent = t("language.auto");
  els.languageSelect.options[1].textContent = t("language.english");
  els.languageSelect.options[2].textContent = t("language.chinese");
  els.refreshBtn.textContent = t("refresh");
  els.refreshBtn.title = t("refresh.batch.title");
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  document.querySelector("#sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = document.querySelector("#sidebarScrim");
  if (scrim) scrim.hidden = !open;
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

function toggleSidebar() {
  if (isMobileLayout()) setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

els.refreshBtn.addEventListener("click", () => loadState());
els.languageSelect.addEventListener("change", () => setLanguageMode(els.languageSelect.value));
document.querySelector("#sidebarToggle").addEventListener("click", toggleSidebar);
document.querySelector("#mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
document.querySelector("#sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
window.addEventListener("resize", syncResponsiveShell);

wireHashRouting();
syncResponsiveShell();
applyStaticI18n();
loadState();
setInterval(() => {
  if (!editing) loadState();
}, 3000);

export async function loadState() {
  const response = await fetch(withContextParams("/api/state"));
  state = await response.json();
  const repo = buildRepository();
  editorStore.selectedTopicId ||= repo.topics[0]?.id || null;
  editorStore.selectedDistributionId ||= repo.distribution[0]?.id || null;
  applyRouteFromHash(repo, { replaceEmpty: true });
  render(repo);
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

function routeFor() {
  if (editorStore.activeStage === "topics") {
    const topicPart = editorStore.selectedTopicId ? `/${encodeRoutePart(editorStore.selectedTopicId)}` : "";
    const directionPart = editorStore.selectedDirectionId ? `/${encodeRoutePart(editorStore.selectedDirectionId)}` : "";
    return `/topics${topicPart}${directionPart}`;
  }
  if (editorStore.activeStage === "todos")
    return editorStore.selectedTodoId ? `/todos/${encodeRoutePart(editorStore.selectedTodoId)}` : "/todos";
  if (editorStore.activeStage === "main") return "/main";
  if (editorStore.activeStage === "distribution")
    return editorStore.selectedDistributionId
      ? `/distribution/${encodeRoutePart(editorStore.selectedDistributionId)}`
      : "/distribution";
  return "/topics";
}

function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeRoutePart);
  const stage = stages.some((item) => item.id === parts[0]) ? parts[0] : editorStore.activeStage || "topics";
  return { stage, first: parts[1] || null, second: parts[2] || null };
}

function applyRouteFromHash(repo = buildRepository(), { replaceEmpty = false } = {}) {
  isApplyingRoute = true;
  routeNeedsReplace = false;
  const route = parseHashRoute();
  const shown = visibleStages();
  editorStore.activeStage = shown.some((stage) => stage.id === route.stage)
    ? route.stage
    : shown[0]?.id || "distribution";
  if (editorStore.activeStage === "topics") {
    editorStore.selectedTopicId = route.first || editorStore.selectedTopicId || repo.topics[0]?.id || null;
    editorStore.selectedDirectionId = route.second || editorStore.selectedDirectionId;
  } else if (editorStore.activeStage === "todos") {
    editorStore.selectedTodoId = route.first || editorStore.selectedTodoId || repo.todos[0]?.id || null;
  } else if (editorStore.activeStage === "distribution") {
    editorStore.selectedDistributionId =
      route.first || editorStore.selectedDistributionId || repo.distribution[0]?.id || null;
  }
  if (replaceEmpty && !window.location.hash) {
    history.replaceState(null, "", `#${routeFor()}`);
  }
  isApplyingRoute = false;
}

export function syncRoute({ push = false } = {}) {
  if (isApplyingRoute) {
    routeNeedsReplace = true;
    return;
  }
  const target = `#${routeFor()}`;
  if (window.location.hash === target) {
    lastAppliedHash = target;
    return;
  }
  if (push) window.location.hash = target;
  else history.replaceState(null, "", target);
  lastAppliedHash = target;
}

export function navigateTo(partial = {}, { replace = false } = {}) {
  if (partial.stage) editorStore.activeStage = partial.stage;
  if ("topicId" in partial) editorStore.selectedTopicId = partial.topicId;
  if ("directionId" in partial) editorStore.selectedDirectionId = partial.directionId;
  if ("todoId" in partial) editorStore.selectedTodoId = partial.todoId;
  if ("distributionId" in partial) editorStore.selectedDistributionId = partial.distributionId;
  syncRoute({ push: !replace });
  render(buildRepository());
}

function wireHashRouting() {
  window.addEventListener("hashchange", () => {
    const repo = buildRepository();
    applyRouteFromHash(repo);
    render(repo);
    lastAppliedHash = window.location.hash || `#${routeFor()}`;
  });
}

export function withContextParams(path) {
  const url = new URL(path, window.location.origin);
  for (const key of ["demo", "lang"]) {
    const value = params.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  url.searchParams.set("lang", language);
  return `${url.pathname}${url.search}`;
}

function stageForDemo(value) {
  if (["todos", "main", "distribution"].includes(value)) return value;
  return "topics";
}

export function buildRepository() {
  const batch = state.batch;
  if (!batch) return { batch: null, topics: [], todos: [], main: null, distribution: [] };
  const items = Array.isArray(batch.items) ? batch.items : [];
  const topics = normalizeTopics(batch, items);
  const todos = normalizeTodos(batch, topics);
  const main = normalizeMainContent(batch, topics, todos, items);
  const distribution = normalizeDistribution(batch, items);
  return { batch, topics, todos, main, distribution };
}

function normalizeTopics(batch, items) {
  if (Array.isArray(batch.topics) && batch.topics.length) return batch.topics.map(normalizeTopic);
  const idea = batch.canonical_idea || batch.source_summary || "Turn one source idea into a durable content system.";
  const source = batch.source === "kelly-writer" ? "system" : "preset";
  return [
    {
      id: "topic-main",
      title: smartTitle(idea),
      source,
      status: "confirmed",
      score: 92,
      audience: "solo founders and creators",
      subject: "Long-form content repurposing system",
      evidence: batch.source_summary || items[0]?.summary || "",
      directions: [
        {
          id: "dir-main-system",
          title: "A calmer way to repurpose one blog into many posts",
          description:
            "Position the piece as an operating system for turning one canonical article into platform-specific drafts without diluting the original claim.",
          angle: "Systematic, practical, calm",
          status: "selected",
        },
        {
          id: "dir-proof-first",
          title: "Stop copying posts across platforms. Preserve proof instead.",
          description:
            "Lead with the common mistake, then show why proof and promise stay stable while hook, pacing, and media change by channel.",
          angle: "Contrarian lesson",
          status: "ready",
        },
        {
          id: "dir-creator-workflow",
          title: "The solo creator's content repurposing checklist",
          description:
            "Frame the same topic as a checklist for founders and creators who want a repeatable publishing flow from one main blog.",
          angle: "Checklist and workflow",
          status: "ready",
        },
      ],
    },
    {
      id: "topic-xhs",
      title: "主稿拆成小红书收藏型内容",
      source: "preset",
      status: "ready",
      score: 84,
      audience: "中文创作者",
      subject: "小红书内容再包装",
      evidence: "Derived from the Xiaohongshu distribution draft.",
      directions: [
        {
          id: "dir-xhs-save",
          title: "别急着发长文，先拆成这 7 页小红书",
          description: "强调收藏价值和 carousel 结构，适合把主稿拆成方法型图文。",
          angle: "收藏型教程",
          status: "ready",
        },
        {
          id: "dir-xhs-mistake",
          title: "很多人做内容分发，第一步就错了",
          description: "用反常识开头，指出复制粘贴不是分发，真正要改的是包装。",
          angle: "反常识提醒",
          status: "ready",
        },
      ],
    },
    {
      id: "topic-system",
      title: "内容系统不是复制粘贴",
      source: "system",
      status: "ready",
      score: 81,
      audience: "content operators",
      subject: "跨平台内容系统",
      evidence: batch.canonical_idea || "",
      directions: [
        {
          id: "dir-system-principle",
          title: "内容系统的核心：保留主张，改变包装",
          description: "解释为什么每个平台需要不同 wrapper，但主张、证据和例子不能变形。",
          angle: "Principle essay",
          status: "ready",
        },
        {
          id: "dir-system-operator",
          title: "给内容运营的一张分发判断表",
          description: "把题材做成一张判断表，帮助运营决定哪些内容适合公众号、小红书或 NewsNet。",
          angle: "Operator tool",
          status: "ready",
        },
      ],
    },
  ].map(normalizeTopic);
}

function normalizeTodos(batch, topics) {
  if (Array.isArray(batch.todos) && batch.todos.length) return batch.todos.map(normalizeTodo);
  return topics
    .filter(
      (topic) =>
        topic.status === "confirmed" ||
        topic.directions?.some((direction) => direction.status === "selected" || direction.status === "confirmed"),
    )
    .map((topic) => {
      const direction = getSelectedDirection(topic);
      return normalizeTodo({
        id: `todo-${topic.id}`,
        topic_id: topic.id,
        direction_id: direction?.id || "",
        title: direction?.title || topic.title,
        description: direction?.description || topic.subject || "",
        subject: topic.subject || topic.title,
        status: "todo",
        assignee: "AI writer",
        source: topic.source,
        created_at: new Date().toISOString(),
      });
    });
}

function normalizeMainContent(batch, topics, todos, items) {
  if (batch.main_content) return batch.main_content;
  const activeTodo = todos.find((todo) => todo.status === "in_progress" || todo.status === "writing");
  if (!activeTodo) return null;
  const confirmed =
    topics.find((topic) => topic.id === activeTodo?.topic_id) ||
    topics.find((topic) => topic.status === "confirmed") ||
    topics[0];
  const selectedDirection = getSelectedDirection(confirmed);
  const title = activeTodo?.title || selectedDirection?.title || confirmed?.title || "Building a calmer content system";
  const body = stripMarkdown(
    batch.source_summary || items[0]?.summary || "A strong blog post should be the source of many smaller pieces.",
  );
  const status = activeTodo?.status === "in_progress" ? "writing" : "waiting";
  return {
    id: "main-blog",
    title,
    status,
    hero_alt: "Editorial cover preview",
    cover_brief: "A clean workspace image: one canonical article connected to several publishing channels.",
    dek:
      activeTodo?.description ||
      selectedDirection?.description ||
      "A canonical post that keeps the core claim, proof, and examples intact before channel adaptation.",
    html: `
      <p>${escapeHtml(status === "writing" ? "AI writer has started this main draft. The outline below is ready to expand into the canonical article." : "This direction is waiting in Todo. Mark it as 开工 before the AI writer starts the main draft.")}</p>
      <p>${escapeHtml(body)}</p>
      <h3>Core structure</h3>
      <p>Start with the reader problem, preserve the proof from the source, then reshape the content for each channel's reading habit.</p>
      <figure>
        <div class="inlineImage">Main visual brief</div>
        <figcaption>${escapeHtml("Use a simple diagram or screenshot sequence to show source -> channel variants.")}</figcaption>
      </figure>
      <h3>Distribution principle</h3>
      <p>The main claim should remain stable. The hook, pacing, CTA, and media treatment can change per platform.</p>
    `,
  };
}

function normalizeDistribution(batch, items) {
  const source = Array.isArray(batch.distribution) && batch.distribution.length ? batch.distribution : items;
  return source.map((item, index) => ({
    ...item,
    id: item.id || `dist-${index + 1}`,
    channel: normalizeChannel(item.channel),
    status: itemStatus(item),
    owner: item.owner || "Kelly Writer",
    readiness: readinessFor(itemStatus(item)),
    title: item.title || `${item.channel || "Channel"} draft`,
    body: item.body || "",
    summary: item.summary || "",
    cta: item.cta || "",
    media_brief: item.media_brief || "",
  }));
}

function render(repo) {
  renderShell(repo);
  renderStage(repo);
}

function renderShell(repo) {
  const batch = repo.batch;
  els.batchMeta.textContent = batch?.batch_id
    ? `${batch.batch_id} · ${repo.distribution.length} ${t("drafts")}`
    : t("batch.none");
  els.lockText.textContent = state.lock ? `${t("locked")}: ${state.lock.message}` : t("workspace.local");
  els.settingsText.textContent = `${state.config_summary?.provider || "local"} ${t("data")} · ${repo.topics.length} ${t("topics")} · ${repo.distribution.length} ${t("distribution.drafts")}`;

  const shown = visibleStages();
  if (!shown.some((stage) => stage.id === editorStore.activeStage))
    editorStore.activeStage = shown[0]?.id || "distribution";
  els.pageTitle.textContent =
    shown.find((stage) => stage.id === editorStore.activeStage)?.label || t("content.repository");

  const counts = {
    topics: repo.topics.length,
    todos: repo.todos.length,
    main: repo.main ? 1 : 0,
    distribution: repo.distribution.length,
  };

  els.stageNav.innerHTML = shown
    .map(
      (stage) => `
    <button class="stageButton ${stage.id === editorStore.activeStage ? "active" : ""}" data-stage="${stage.id}" title="${escapeAttr(stage.caption)}">
      <span>${stage.label}</span>
      <small>${stage.caption}</small>
      <em>${counts[stage.id] || 0}</em>
    </button>
  `,
    )
    .join("");

  for (const button of els.stageNav.querySelectorAll("[data-stage]")) {
    button.addEventListener("click", () => {
      navigateTo({ stage: button.dataset.stage }, { replace: false });
    });
  }
}

function renderStage(repo) {
  if (!state.batch) {
    els.stagePanel.className = "stagePanel empty";
    els.stagePanel.innerHTML = `<p>${escapeHtml(t("empty.batch"))}</p>`;
    return;
  }

  els.stagePanel.className = "stagePanel";
  if (editorStore.activeStage === "topics") renderTopics(repo);
  if (editorStore.activeStage === "todos") renderTodos(repo);
  if (editorStore.activeStage === "main") renderMainContent(repo);
  if (editorStore.activeStage === "distribution") renderDistribution(repo);
}

export function bindEditorActions(id) {
  if (!id) return;
  for (const input of els.stagePanel.querySelectorAll("input, textarea")) {
    input.addEventListener("focus", () => {
      editing = true;
    });
    input.addEventListener("blur", () => {
      editing = false;
    });
  }
  for (const button of els.stagePanel.querySelectorAll("[data-action]")) {
    button.disabled = Boolean(state.lock);
    button.addEventListener("click", () => saveDecision(id, button.dataset.action));
  }
}

async function saveDecision(id, action) {
  const payload = {
    id,
    action,
    title: document.querySelector("#titleInput")?.value || "",
    body: document.querySelector("#bodyInput")?.value || "",
    comment: document.querySelector("#commentInput")?.value || "",
  };
  const response = await fetch(withContextParams("/api/decision"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    alert(`Could not save: ${await response.text()}`);
    return;
  }
  editing = false;
  await loadState();
}

function itemStatus(item) {
  const decision = state.decisions[item.id];
  if (decision?.action === "approve") return "approved";
  if (decision?.action === "block") return "blocked";
  if (decision?.action === "request_changes") return "changes_requested";
  if (decision?.action === "revise") return "needs_review";
  return item.status || "needs_review";
}

function readinessFor(status) {
  if (status === "approved" || status === "done") return t("readiness.ready");
  if (status === "blocked") return t("readiness.blocked");
  if (status === "changes_requested") return t("readiness.aiToRevise");
  if (status === "needs_review") return t("readiness.needsEdit");
  return t("readiness.toApprove");
}

function normalizeChannel(channel = "") {
  const value = String(channel).toLowerCase();
  if (value === "x") return "X";
  if (value === "xiaohongshu") return language === "zh-CN" ? "小红书" : "Xiaohongshu";
  if (value === "official_blog" || value === "official-blog" || value === "blog")
    return language === "zh-CN" ? "官方 Blog" : "Official Blog";
  if (value === "wechat") return language === "zh-CN" ? "公众号" : "WeChat";
  if (value === "newsletter") return "NewsNet";
  if (value === "linkedin") return "LinkedIn";
  return channel || t("channel");
}

export function channelInitial(channel) {
  return String(channel || "C")
    .slice(0, 1)
    .toUpperCase();
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`]/g, "")
    .trim();
}

function smartTitle(value) {
  const clean = stripMarkdown(value);
  const firstSentence = clean.split(/(?<=[.!?。！？])\s+/)[0] || clean;
  const firstClause = firstSentence.split(/\s-\s|:|：/)[0] || firstSentence;
  return firstClause.length > 72 ? `${firstClause.slice(0, 69).trim()}...` : firstClause;
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

export function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}
