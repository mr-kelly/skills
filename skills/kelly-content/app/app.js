const params = new URLSearchParams(window.location.search);
const language = params.get("lang") === "zh-CN" ? "zh-CN" : "en";
const demoScenario = params.get("demo") || "";
const I18N = {
  en: {
    "stage.topics": "Topics",
    "stage.topics.caption": "Subjects and title directions",
    "stage.todos": "Todos",
    "stage.todos.caption": "Confirmed work waiting to start",
    "stage.main": "Main Draft",
    "stage.main.caption": "Canonical post and cover brief",
    "stage.distribution": "Distribution",
    "stage.distribution.caption": "Blog, newsletter, social posts",
    "batch.none": "No batch loaded",
    "drafts": "drafts",
    "locked": "Locked",
    "workspace.local": "Local workspace · publishing disabled",
    "data": "data",
    "topics": "topics",
    "distribution.drafts": "distribution drafts",
    "empty.batch": "Generate a content batch, then the repository will appear here.",
    "topics.pool": "Topic Pool",
    "subject": "Subject",
    "todos.title": "Todos",
    "todos.empty": "Confirm a title and description direction, then todos will appear here.",
    "todo.start": "Start",
    "todo.start.title": "Start AI writing for this todo",
    "todo.next.started": "AI writing has started. Next, generate the outline, article body, and cover brief.",
    "todo.next.waiting": "Click Start to move this direction into the AI writing queue.",
    "main.title": "Main Draft & Cover",
    "distribution.title": "Distribution Versions",
    "status.todo": "Not started",
    "status.started": "Started",
    "status.done": "Done",
    "status.blocked": "Blocked"
  },
  "zh-CN": {
    "stage.topics": "选题",
    "stage.topics.caption": "题材与标题描述方向",
    "stage.todos": "待办",
    "stage.todos.caption": "确认后等待开工",
    "stage.main": "主稿",
    "stage.main.caption": "主 Blog 与配图",
    "stage.distribution": "分发",
    "stage.distribution.caption": "官方 Blog、公众号、小红书",
    "batch.none": "未加载批次",
    "drafts": "草稿",
    "locked": "已锁定",
    "workspace.local": "本地工作区 · 发布已禁用",
    "data": "数据",
    "topics": "题材",
    "distribution.drafts": "分发草稿",
    "empty.batch": "生成内容批次后，内容仓库会显示在这里。",
    "topics.pool": "题材池",
    "subject": "题材",
    "todos.title": "待办",
    "todos.empty": "确认标题和描述方向后，会在这里出现待办。",
    "todo.start": "开工",
    "todo.start.title": "开始这个待办的 AI 写作",
    "todo.next.started": "AI 主稿处理已开工。下一步应生成主稿 outline、正文和配图 brief。",
    "todo.next.waiting": "点击“开工”后，这个方向才正式进入 AI 主稿处理队列。",
    "main.title": "主稿与配图",
    "distribution.title": "分发版本",
    "status.todo": "待开工",
    "status.started": "已开工",
    "status.done": "完成",
    "status.blocked": "阻塞"
  }
};

function t(key) {
  return I18N[language]?.[key] || I18N.en[key] || key;
}

const stages = [
  { id: "topics", label: t("stage.topics"), caption: t("stage.topics.caption") },
  { id: "todos", label: t("stage.todos"), caption: t("stage.todos.caption") },
  { id: "main", label: t("stage.main"), caption: t("stage.main.caption") },
  { id: "distribution", label: t("stage.distribution"), caption: t("stage.distribution.caption") }
];

// Ideation stages (topics/todos/main) are local-only. In busabase mode the skill
// publishes drafts straight to the shared review queue, so only distribution shows.
function visibleStages() {
  if (state.config_summary?.provider === "busabase") {
    return stages.filter((stage) => stage.id === "distribution");
  }
  return stages;
}

let state = { batch: null, decisions: {}, lock: null };
let activeStage = stageForDemo(demoScenario);
let selectedTopicId = null;
let selectedDirectionId = null;
let selectedTodoId = null;
let selectedDistributionId = null;
let editing = false;
let isApplyingRoute = false;
let routeNeedsReplace = false;
let lastAppliedHash = "";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-content.sidebarCollapsed";

const els = {
  stageNav: document.querySelector("#stageNav"),
  stagePanel: document.querySelector("#stagePanel"),
  batchMeta: document.querySelector("#batchMeta"),
  lockText: document.querySelector("#lockText"),
  settingsText: document.querySelector("#settingsText"),
  pageTitle: document.querySelector("#pageTitle"),
  refreshBtn: document.querySelector("#refreshBtn")
};

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
document.querySelector("#sidebarToggle").addEventListener("click", toggleSidebar);
document.querySelector("#mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
document.querySelector("#sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
window.addEventListener("resize", syncResponsiveShell);

wireHashRouting();
syncResponsiveShell();
loadState();
setInterval(() => {
  if (!editing) loadState();
}, 3000);

async function loadState() {
  const response = await fetch(withContextParams("/api/state"));
  state = await response.json();
  const repo = buildRepository();
  selectedTopicId ||= repo.topics[0]?.id || null;
  selectedDistributionId ||= repo.distribution[0]?.id || null;
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
  if (activeStage === "topics") {
    const topicPart = selectedTopicId ? `/${encodeRoutePart(selectedTopicId)}` : "";
    const directionPart = selectedDirectionId ? `/${encodeRoutePart(selectedDirectionId)}` : "";
    return `/topics${topicPart}${directionPart}`;
  }
  if (activeStage === "todos") return selectedTodoId ? `/todos/${encodeRoutePart(selectedTodoId)}` : "/todos";
  if (activeStage === "main") return "/main";
  if (activeStage === "distribution") return selectedDistributionId ? `/distribution/${encodeRoutePart(selectedDistributionId)}` : "/distribution";
  return "/topics";
}

function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeRoutePart);
  const stage = stages.some((item) => item.id === parts[0]) ? parts[0] : activeStage || "topics";
  return { stage, first: parts[1] || null, second: parts[2] || null };
}

function applyRouteFromHash(repo = buildRepository(), { replaceEmpty = false } = {}) {
  isApplyingRoute = true;
  routeNeedsReplace = false;
  const route = parseHashRoute();
  const shown = visibleStages();
  activeStage = shown.some((stage) => stage.id === route.stage) ? route.stage : shown[0]?.id || "distribution";
  if (activeStage === "topics") {
    selectedTopicId = route.first || selectedTopicId || repo.topics[0]?.id || null;
    selectedDirectionId = route.second || selectedDirectionId;
  } else if (activeStage === "todos") {
    selectedTodoId = route.first || selectedTodoId || repo.todos[0]?.id || null;
  } else if (activeStage === "distribution") {
    selectedDistributionId = route.first || selectedDistributionId || repo.distribution[0]?.id || null;
  }
  if (replaceEmpty && !window.location.hash) {
    history.replaceState(null, "", `#${routeFor()}`);
  }
  isApplyingRoute = false;
}

function syncRoute({ push = false } = {}) {
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

function navigateTo(partial = {}, { replace = false } = {}) {
  if (partial.stage) activeStage = partial.stage;
  if ("topicId" in partial) selectedTopicId = partial.topicId;
  if ("directionId" in partial) selectedDirectionId = partial.directionId;
  if ("todoId" in partial) selectedTodoId = partial.todoId;
  if ("distributionId" in partial) selectedDistributionId = partial.distributionId;
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

function withContextParams(path) {
  const url = new URL(path, window.location.origin);
  for (const key of ["demo", "lang"]) {
    const value = params.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function stageForDemo(value) {
  if (["todos", "main", "distribution"].includes(value)) return value;
  return "topics";
}

function buildRepository() {
  const batch = state.batch || {};
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
  const source = batch.source === "kelly-content" ? "system" : "preset";
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
          description: "Position the piece as an operating system for turning one canonical article into platform-specific drafts without diluting the original claim.",
          angle: "Systematic, practical, calm",
          status: "selected"
        },
        {
          id: "dir-proof-first",
          title: "Stop copying posts across platforms. Preserve proof instead.",
          description: "Lead with the common mistake, then show why proof and promise stay stable while hook, pacing, and media change by channel.",
          angle: "Contrarian lesson",
          status: "ready"
        },
        {
          id: "dir-creator-workflow",
          title: "The solo creator's content repurposing checklist",
          description: "Frame the same topic as a checklist for founders and creators who want a repeatable publishing flow from one main blog.",
          angle: "Checklist and workflow",
          status: "ready"
        }
      ]
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
          status: "ready"
        },
        {
          id: "dir-xhs-mistake",
          title: "很多人做内容分发，第一步就错了",
          description: "用反常识开头，指出复制粘贴不是分发，真正要改的是包装。",
          angle: "反常识提醒",
          status: "ready"
        }
      ]
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
          status: "ready"
        },
        {
          id: "dir-system-operator",
          title: "给内容运营的一张分发判断表",
          description: "把题材做成一张判断表，帮助运营决定哪些内容适合公众号、小红书或 NewsNet。",
          angle: "Operator tool",
          status: "ready"
        }
      ]
    }
  ].map(normalizeTopic);
}

function normalizeTodos(batch, topics) {
  if (Array.isArray(batch.todos) && batch.todos.length) return batch.todos.map(normalizeTodo);
  return topics
    .filter((topic) => topic.status === "confirmed" || topic.directions?.some((direction) => direction.status === "selected" || direction.status === "confirmed"))
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
        created_at: new Date().toISOString()
      });
    });
}

function normalizeMainContent(batch, topics, todos, items) {
  if (batch.main_content) return batch.main_content;
  const activeTodo = todos.find((todo) => todo.status === "in_progress" || todo.status === "writing") || todos[0];
  const confirmed = topics.find((topic) => topic.id === activeTodo?.topic_id) || topics.find((topic) => topic.status === "confirmed") || topics[0];
  const selectedDirection = getSelectedDirection(confirmed);
  const title = activeTodo?.title || selectedDirection?.title || confirmed?.title || "Building a calmer content system";
  const body = stripMarkdown(batch.source_summary || items[0]?.summary || "A strong blog post should be the source of many smaller pieces.");
  const status = activeTodo?.status === "in_progress" ? "writing" : "waiting";
  return {
    id: "main-blog",
    title,
    status,
    hero_alt: "Editorial cover preview",
    cover_brief: "A clean workspace image: one canonical article connected to several publishing channels.",
    dek: activeTodo?.description || selectedDirection?.description || "A canonical post that keeps the core claim, proof, and examples intact before channel adaptation.",
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
    `
  };
}

function normalizeDistribution(batch, items) {
  const source = Array.isArray(batch.distribution) && batch.distribution.length ? batch.distribution : items;
  return source.map((item, index) => ({
    ...item,
    id: item.id || `dist-${index + 1}`,
    channel: normalizeChannel(item.channel),
    status: itemStatus(item),
    owner: item.owner || "Kelly Content",
    readiness: readinessFor(itemStatus(item)),
    title: item.title || `${item.channel || "Channel"} draft`,
    body: item.body || "",
    summary: item.summary || "",
    cta: item.cta || "",
    media_brief: item.media_brief || ""
  }));
}

function render(repo) {
  renderShell(repo);
  renderStage(repo);
}

function renderShell(repo) {
  const batch = repo.batch;
  els.batchMeta.textContent = batch?.batch_id ? `${batch.batch_id} · ${repo.distribution.length} ${t("drafts")}` : t("batch.none");
  els.lockText.textContent = state.lock ? `${t("locked")}: ${state.lock.message}` : t("workspace.local");
  els.settingsText.textContent = `${state.config_summary?.provider || "local"} ${t("data")} · ${repo.topics.length} ${t("topics")} · ${repo.distribution.length} ${t("distribution.drafts")}`;

  const shown = visibleStages();
  if (!shown.some((stage) => stage.id === activeStage)) activeStage = shown[0]?.id || "distribution";
  els.pageTitle.textContent = shown.find((stage) => stage.id === activeStage)?.label || "Content Repository";

  const counts = {
    topics: repo.topics.length,
    todos: repo.todos.length,
    main: repo.main ? 1 : 0,
    distribution: repo.distribution.length
  };

  els.stageNav.innerHTML = shown.map((stage) => `
    <button class="stageButton ${stage.id === activeStage ? "active" : ""}" data-stage="${stage.id}" title="${escapeAttr(stage.caption)}">
      <span>${stage.label}</span>
      <small>${stage.caption}</small>
      <em>${counts[stage.id] || 0}</em>
    </button>
  `).join("");

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
  if (activeStage === "topics") renderTopics(repo);
  if (activeStage === "todos") renderTodos(repo);
  if (activeStage === "main") renderMainContent(repo);
  if (activeStage === "distribution") renderDistribution(repo);
}

function renderTopics(repo) {
  const selected = repo.topics.find((topic) => topic.id === selectedTopicId) || repo.topics[0];
  selectedTopicId = selected?.id || null;
  selectedDirectionId = selected?.directions?.some((direction) => direction.id === selectedDirectionId)
    ? selectedDirectionId
    : getSelectedDirection(selected)?.id || selected?.directions?.[0]?.id || null;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">Subject Discovery</p>
        <h2>${escapeHtml(t("topics.pool"))}</h2>
      </div>
      <button class="quietButton" title="Refresh subjects">Refresh</button>
    </div>
    <div class="split">
      <div class="recordList">
        ${repo.topics.map((topic) => topicRow(topic, selected?.id)).join("")}
      </div>
      <article class="canvas">
        ${selected ? topicDetail(selected) : ""}
      </article>
    </div>
  `;
  bindRecordSelection("topic", (id) => {
    navigateTo({ stage: "topics", topicId: id, directionId: null });
  });
  bindRecordSelection("direction", (id) => {
    navigateTo({ stage: "topics", directionId: id });
  });
  const confirmButton = els.stagePanel.querySelector("[data-action='confirm-direction']");
  confirmButton?.addEventListener("click", () => confirmDirection(selected?.id, selectedDirectionId));
}

function topicRow(topic, selectedId) {
  return `
    <button class="recordRow ${topic.id === selectedId ? "selected" : ""}" data-topic="${escapeAttr(topic.id)}">
      <span class="statusDot ${topic.status}"></span>
      <strong>${escapeHtml(topic.title)}</strong>
      <small>${escapeHtml(topic.source)} · ${topic.directions?.length || 0} directions · score ${topic.score || "-"}</small>
    </button>
  `;
}

function topicDetail(topic) {
  const directions = topic.directions || [];
  const selectedDirection = directions.find((direction) => direction.id === selectedDirectionId) || directions[0];
  return `
    <div class="canvasHead">
      <div>
        <span class="pill">${escapeHtml(topic.source)}</span>
        <span class="pill">${escapeHtml(topic.status)}</span>
      </div>
      <button class="primaryButton" data-action="confirm-direction" title="Confirm selected title and description direction, then create todo">Confirm title + description</button>
    </div>
    <h2>${escapeHtml(topic.title)}</h2>
    <dl class="metaGrid">
      <div><dt>Audience</dt><dd>${escapeHtml(topic.audience || "Not set")}</dd></div>
      <div><dt>Score</dt><dd>${escapeHtml(topic.score || "-")}</dd></div>
    </dl>
    <section class="sectionBlock">
      <h3>${escapeHtml(t("subject"))}</h3>
      <p>${escapeHtml(topic.subject || topic.title || "")}</p>
    </section>
    <div class="directionLayout">
      <div class="directionList">
        ${directions.map((direction) => directionCard(direction, selectedDirection?.id)).join("")}
      </div>
      <section class="directionPreview">
        <p class="eyebrow">Selected Direction</p>
        <h3>${escapeHtml(selectedDirection?.title || "No direction selected")}</h3>
        <p>${escapeHtml(selectedDirection?.description || "Choose a title and description direction for this subject.")}</p>
        <dl class="miniMeta">
          <div><dt>Angle</dt><dd>${escapeHtml(selectedDirection?.angle || "-")}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(selectedDirection?.status || "-")}</dd></div>
        </dl>
      </section>
    </div>
    <section class="sectionBlock">
      <h3>Evidence</h3>
      <p>${escapeHtml(topic.evidence || "No source evidence attached yet.")}</p>
    </section>
  `;
}

function renderTodos(repo) {
  const selected = repo.todos.find((todo) => todo.id === selectedTodoId) || repo.todos[0];
  selectedTodoId = selected?.id || null;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">Production Queue</p>
        <h2>${escapeHtml(t("todos.title"))}</h2>
      </div>
      <button class="primaryButton" data-action="start-selected-todo" title="${escapeAttr(t("todo.start.title"))}">${escapeHtml(t("todo.start"))}</button>
    </div>
    <div class="split">
      <div class="recordList">
        ${repo.todos.map((todo) => todoRow(todo, selected?.id)).join("")}
      </div>
      <article class="canvas">
        ${selected ? todoDetail(selected) : `<p class="mutedText">${escapeHtml(t("todos.empty"))}</p>`}
      </article>
    </div>
  `;
  bindRecordSelection("todo", (id) => {
    navigateTo({ stage: "todos", todoId: id });
  });
  for (const button of els.stagePanel.querySelectorAll("[data-action='start-todo'], [data-action='start-selected-todo']")) {
    button.addEventListener("click", () => startTodo(selectedTodoId));
  }
}

function todoRow(todo, selectedId) {
  return `
    <button class="recordRow ${todo.id === selectedId ? "selected" : ""}" data-todo="${escapeAttr(todo.id)}">
      <span class="statusDot ${todo.status}"></span>
      <strong>${escapeHtml(todo.title)}</strong>
      <small>${escapeHtml(todo.statusLabel)} · ${escapeHtml(todo.assignee || "AI writer")}</small>
    </button>
  `;
}

function todoDetail(todo) {
  return `
    <div class="canvasHead">
      <div>
        <span class="pill">${escapeHtml(todo.statusLabel)}</span>
        <span class="pill">${escapeHtml(todo.source || "local")}</span>
      </div>
      <button class="primaryButton" data-action="start-todo" title="${escapeAttr(t("todo.start.title"))}">${escapeHtml(t("todo.start"))}</button>
    </div>
    <h2>${escapeHtml(todo.title)}</h2>
    <p class="leadText">${escapeHtml(todo.description)}</p>
    <dl class="metaGrid">
      <div><dt>${escapeHtml(t("subject"))}</dt><dd>${escapeHtml(todo.subject || "-")}</dd></div>
      <div><dt>Assignee</dt><dd>${escapeHtml(todo.assignee || "AI writer")}</dd></div>
    </dl>
    <section class="sectionBlock">
      <h3>Next action</h3>
      <p>${todo.status === "in_progress"
        ? t("todo.next.started")
        : t("todo.next.waiting")}</p>
    </section>
  `;
}

function directionCard(direction, selectedId) {
  return `
    <button class="directionCard ${direction.id === selectedId ? "selected" : ""}" data-direction="${escapeAttr(direction.id)}">
      <span>${escapeHtml(direction.status || "ready")}</span>
      <strong>${escapeHtml(direction.title)}</strong>
      <small>${escapeHtml(direction.description)}</small>
    </button>
  `;
}

function renderMainContent(repo) {
  const main = repo.main;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">Canonical Draft</p>
        <h2>${escapeHtml(t("main.title"))}</h2>
      </div>
      <div class="toolbar">
        <button class="quietButton" title="Preview HTML">Preview</button>
        <button class="primaryButton" title="Approve main draft">Approve main</button>
      </div>
    </div>
    <article class="mainPreview">
      <div class="coverFrame">
        <span>Cover</span>
        <strong>${escapeHtml(main.cover_brief || main.hero_alt || "Visual brief")}</strong>
      </div>
      <div class="articleShell">
        <span class="pill">${escapeHtml(main.status || "draft")}</span>
        <h1>${escapeHtml(main.title)}</h1>
        <p class="dek">${escapeHtml(main.dek || "")}</p>
        <div class="articleBody">${main.html || `<p>${escapeHtml(main.body || "")}</p>`}</div>
      </div>
    </article>
  `;
}

function renderDistribution(repo) {
  const selected = repo.distribution.find((item) => item.id === selectedDistributionId) || repo.distribution[0];
  selectedDistributionId = selected?.id || null;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">Channel Adaptation</p>
        <h2>${escapeHtml(t("distribution.title"))}</h2>
      </div>
      <div class="toolbar">
        <button class="quietButton" title="Validate all drafts">Validate</button>
        <button class="primaryButton" title="Export approved drafts">Export</button>
      </div>
    </div>
    <div class="split">
      <div class="recordList">
        ${repo.distribution.map((item) => distributionRow(item, selected?.id)).join("")}
      </div>
      <article class="canvas">
        ${selected ? distributionDetail(selected) : ""}
      </article>
    </div>
  `;
  bindRecordSelection("distribution", (id) => {
    navigateTo({ stage: "distribution", distributionId: id });
  });
  bindEditorActions(selected?.id);
}

function distributionRow(item, selectedId) {
  return `
    <button class="recordRow ${item.id === selectedId ? "selected" : ""}" data-distribution="${escapeAttr(item.id)}">
      <span class="channelMark">${escapeHtml(channelInitial(item.channel))}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.channel)} · ${escapeHtml(item.readiness)}</small>
    </button>
  `;
}

function distributionDetail(item) {
  const decision = state.decisions[item.id] || {};
  const title = decision.title || item.title || "";
  const body = decision.body || item.body || "";
  const comment = decision.comment || "";
  return `
    <div class="canvasHead">
      <div>
        <span class="pill">${escapeHtml(item.channel)}</span>
        <span class="pill">${escapeHtml(item.status)}</span>
      </div>
      <div class="actions">
        <button data-action="approve" title="Approve this version">Approve</button>
        <button data-action="revise" title="Save your edits as a new version">Save</button>
        <button data-action="request_changes" title="Send back for the AI to revise (request changes)">Request changes</button>
        <button data-action="block" title="Block this version">Block</button>
      </div>
    </div>
    <label>Title
      <input id="titleInput" value="${escapeAttr(title)}">
    </label>
    <label>Draft
      <textarea id="bodyInput">${escapeHtml(body)}</textarea>
    </label>
    <label>Review note
      <textarea id="commentInput" class="note">${escapeHtml(comment)}</textarea>
    </label>
    <div class="supportGrid">
      ${item.title_options?.length ? `<section class="sectionBlock"><h3>Title Options</h3><p>${item.title_options.map(escapeHtml).join("<br>")}</p></section>` : ""}
      ${item.media_brief ? `<section class="sectionBlock"><h3>Media Brief</h3><p>${escapeHtml(item.media_brief)}</p></section>` : ""}
      ${item.hashtags?.length ? `<section class="sectionBlock"><h3>Hashtags</h3><p>${item.hashtags.map(escapeHtml).join(" ")}</p></section>` : ""}
    </div>
  `;
}

function bindRecordSelection(kind, onSelect) {
  for (const row of els.stagePanel.querySelectorAll(`[data-${kind}]`)) {
    row.addEventListener("click", () => onSelect(row.dataset[kind]));
  }
}

async function confirmDirection(topicId, directionId) {
  if (!topicId || !directionId) return;
  const response = await fetch(withContextParams("/api/confirm-direction"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic_id: topicId, direction_id: directionId })
  });
  if (!response.ok) {
    alert(`Could not create todo: ${await response.text()}`);
    return;
  }
  activeStage = "todos";
  selectedTodoId = null;
  syncRoute({ push: true });
  await loadState();
}

async function startTodo(id) {
  if (!id) return;
  const response = await fetch(withContextParams("/api/start-todo"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id })
  });
  if (!response.ok) {
    alert(`Could not start todo: ${await response.text()}`);
    return;
  }
  activeStage = "main";
  syncRoute({ push: true });
  await loadState();
}

function normalizeTopic(topic) {
  const directions = Array.isArray(topic.directions) && topic.directions.length
    ? topic.directions
    : [{
      id: `${topic.id || "topic"}-direction-1`,
      title: topic.title || "Untitled direction",
      description: topic.description || topic.angle || "No description yet.",
      angle: topic.angle || "General",
      status: topic.status === "confirmed" ? "selected" : "ready"
    }];
  return {
    ...topic,
    subject: topic.subject || topic.topic || topic.title,
    directions
  };
}

function normalizeTodo(todo) {
  const labels = {
    todo: t("status.todo"),
    queued: t("status.todo"),
    in_progress: t("status.started"),
    writing: t("status.started"),
    done: t("status.done"),
    blocked: t("status.blocked")
  };
  return {
    ...todo,
    status: todo.status || "todo",
    statusLabel: labels[todo.status || "todo"] || todo.status || t("status.todo")
  };
}

function getSelectedDirection(topic) {
  if (!topic?.directions?.length) return null;
  return topic.directions.find((direction) => direction.status === "selected" || direction.status === "confirmed") || topic.directions[0];
}

function bindEditorActions(id) {
  if (!id) return;
  for (const input of els.stagePanel.querySelectorAll("input, textarea")) {
    input.addEventListener("focus", () => { editing = true; });
    input.addEventListener("blur", () => { editing = false; });
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
    comment: document.querySelector("#commentInput")?.value || ""
  };
  const response = await fetch(withContextParams("/api/decision"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
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
  if (status === "approved" || status === "done") return "ready";
  if (status === "blocked") return "blocked";
  if (status === "changes_requested") return "AI to revise";
  if (status === "needs_review") return "needs edit";
  return "to approve";
}

function normalizeChannel(channel = "") {
  const value = String(channel).toLowerCase();
  if (value === "x") return "X";
  if (value === "xiaohongshu") return language === "zh-CN" ? "小红书" : "Xiaohongshu";
  if (value === "official_blog" || value === "official-blog" || value === "blog") return language === "zh-CN" ? "官方 Blog" : "Official Blog";
  if (value === "wechat") return language === "zh-CN" ? "公众号" : "WeChat";
  if (value === "newsletter") return "NewsNet";
  if (value === "linkedin") return "LinkedIn";
  return channel || "Channel";
}

function channelInitial(channel) {
  return String(channel || "C").slice(0, 1).toUpperCase();
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}
