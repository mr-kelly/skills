import { bindContentEvents, renderReview, renderSettings, renderStudio, renderVendors } from "./js/studio-views.js";
const messages = {
  en: {
    attention: "Need attention",
    humanWorkTitle: "What needs your attention",
    needReview: "checks need review",
    fixOpen: "fix items",
    providerRoutes: "routes",
    overview: "Overview",
    review: "Review Queue",
    studio: "Studio",
    vendors: "Vendors",
    settings: "Help & Settings",
    all: "All",
    needsReview: "Needs Review",
    approved: "Approved",
    changesRequested: "Changes Requested",
    blocked: "Blocked",
    language: "Language",
    refresh: "Refresh",
    generated: "Generated",
    readiness: "Readiness",
    currentPath: "Recommended path",
    latency: "Latency",
    lipSync: "Lip sync",
    stability: "Stream stability",
    qa: "QA",
    verdict: "Verdict",
    fastPath: "2D fast launch",
    customPath: "3D custom build",
    pipeline: "Pipeline",
    reviewTitle: "QA review queue",
    reviewSubtitle: "Approve, request changes, or block each launch gate before real provider upload.",
    evidence: "Evidence",
    owner: "Owner",
    note: "Review note",
    notePlaceholder: "What should the agent change or watch?",
    approve: "Approve",
    requestChanges: "Request changes",
    block: "Block",
    decision: "Decision",
    studioTitle: "Multimodal stream studio",
    studioSubtitle: "Local simulation of voice/text input, lip motion, subtitles, route latency, and stream events.",
    providerMode: "Provider mode",
    persona: "Persona",
    inputMode: "Input mode",
    script: "Demo script",
    start: "Start stream",
    pause: "Pause",
    reset: "Reset",
    routeLatency: "Route latency",
    streamEvents: "Stream events",
    vendorsTitle: "Vendor and architecture routes",
    vendorsSubtitle: "Compare fast 2D service adapters against the UE/Unity custom path.",
    path: "Path",
    integration: "Integration",
    speed: "Speed",
    control: "Control",
    cost: "Cost",
    risks: "Risks",
    architecture: "Reference architecture",
    localFilesOnly: "Local files only. No vendor upload, no camera, no microphone, and no external side effect.",
    configuration: "Configuration",
    dataProvider: "Data provider",
    handoffFiles: "Handoff files",
    safety: "Safety boundary",
    demoNotice: "Demo mode: no local files were changed.",
    lockedNotice: "An agent is writing to this data right now. Review actions are disabled until it finishes.",
    saved: "Saved locally.",
    search: "Search",
    empty: "No matching items.",
  },
  zh: {
    attention: "需要关注",
    humanWorkTitle: "需要你处理的事项",
    needReview: "项待审",
    fixOpen: "项返修",
    providerRoutes: "条路径",
    overview: "总览",
    review: "审核队列",
    studio: "Studio",
    vendors: "服务商",
    settings: "帮助与设置",
    all: "全部",
    needsReview: "待审核",
    approved: "已批准",
    changesRequested: "已要求返修",
    blocked: "已阻止",
    language: "语言",
    refresh: "刷新",
    generated: "生成于",
    readiness: "就绪度",
    currentPath: "推荐路径",
    latency: "延迟",
    lipSync: "唇形",
    stability: "流稳定",
    qa: "QA",
    verdict: "结论",
    fastPath: "2D 快上线",
    customPath: "3D 定制",
    pipeline: "链路",
    reviewTitle: "QA 审核队列",
    reviewSubtitle: "真实上传服务商之前，逐项批准、要求返修或阻止上线门。",
    evidence: "证据",
    owner: "负责人",
    note: "审核备注",
    notePlaceholder: "希望 agent 修改或注意什么？",
    approve: "通过",
    requestChanges: "返修",
    block: "阻止",
    decision: "决策",
    studioTitle: "多模态推流 Studio",
    studioSubtitle: "本地模拟语音/文本输入、口型、字幕、链路延迟和流事件。",
    providerMode: "服务模式",
    persona: "数字人",
    inputMode: "输入",
    script: "演示脚本",
    start: "开始推流",
    pause: "暂停",
    reset: "重置",
    routeLatency: "链路延迟",
    streamEvents: "流事件",
    vendorsTitle: "服务商与架构路径",
    vendorsSubtitle: "对比快速 2D 服务接入和 UE/Unity 3D 定制路径。",
    path: "路径",
    integration: "接入方式",
    speed: "速度",
    control: "控制权",
    cost: "成本",
    risks: "风险",
    architecture: "参考架构",
    localFilesOnly: "只读写本地文件。不上传服务商，不调用摄像头/麦克风，不产生外部副作用。",
    configuration: "配置",
    dataProvider: "数据源",
    handoffFiles: "交接文件",
    safety: "安全边界",
    demoNotice: "Demo 模式：没有改动本地文件。",
    lockedNotice: "Agent 正在写入数据，审核操作暂时不可用，请稍后再试。",
    saved: "已保存到本地。",
    search: "搜索",
    empty: "没有匹配项。",
  },
};

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  statusFilter: "all",
  selectedId: "",
  edits: {},
  notice: "",
  lang: new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en",
  demo: new URLSearchParams(location.search).get("demo") || "",
};

export const streamStore = {
  running: true,
  audioLevel: 0.24,
  waveContext: null,
  currentPersona: "kelly-host-cn",
  currentProvider: "fast-2d-stream",
};
let animationId = 0;

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-digital-human.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
};

export const els = {
  content: document.querySelector("#content"),
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
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
  fixCount: document.querySelector("#count-fix"),
  routeCount: document.querySelector("#count-routes"),
  statusFilters: document.querySelector("#statusFilters"),
  language: document.querySelector("#language"),
};

export function t(key) {
  return messages[state.lang]?.[key] || messages.en[key] || key;
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] || "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  if (state.route.id) state.selectedId = state.route.id;
  render();
}

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
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

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const response = await fetch(`/api/state?${params}`, { cache: "no-store" });
  state.settings = await response.json();
  state.snapshot = state.settings.snapshot;
  if (!state.selectedId) state.selectedId = filteredChecks()[0]?.id || state.snapshot?.qa_checks?.[0]?.id || "";
  render();
  startAnimation();
}

function applyI18n() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
  if (els.language) els.language.value = state.lang;
}

export function decisionFor(id) {
  return state.settings?.decisions?.decisions?.[id] || null;
}

export function effectiveStatus(check) {
  const decision = decisionFor(check.id);
  if (decision?.action && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  if (check.status === "pass") return "approved";
  if (check.status === "block") return "blocked";
  return "needs_review";
}

export function statusClass(status) {
  if (status === "approved" || status === "pass" || status === "SHIP" || status === "ready_for_demo") return "pass";
  if (status === "blocked" || status === "block" || status === "BLOCK") return "block";
  return "fix";
}

export function statusLabel(status) {
  if (status === "needs_review") return t("needsReview");
  if (status === "changes_requested") return t("changesRequested");
  if (status === "approved") return t("approved");
  if (status === "blocked") return t("blocked");
  return String(status || "").replaceAll("_", " ");
}

export function pathLabel(path) {
  if (path === "2d_fast") return state.lang === "zh" ? "2D 快上线" : "2D fast";
  if (path === "3d_custom") return state.lang === "zh" ? "3D 定制" : "3D custom";
  return "Hybrid";
}

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function checks() {
  return state.snapshot?.qa_checks || [];
}

export function filteredChecks() {
  const query = state.query.trim().toLowerCase();
  return checks().filter((check) => {
    const statusOk = state.statusFilter === "all" || effectiveStatus(check) === state.statusFilter;
    const queryOk =
      !query ||
      [check.label, check.owner, check.evidence, check.status].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );
    return statusOk && queryOk;
  });
}

export function selectedCheck() {
  return checks().find((check) => check.id === state.selectedId) || filteredChecks()[0] || checks()[0] || null;
}

function renderShell() {
  applyI18n();
  const reviewCount = checks().filter((check) => effectiveStatus(check) === "needs_review").length;
  const fixCount = checks().filter((check) => check.status === "fix").length;
  els.syncStatus.textContent = `${state.snapshot?.project?.readiness_score || 0} ${t("readiness")}`;
  els.reviewCount.textContent = reviewCount;
  els.fixCount.textContent = fixCount;
  els.routeCount.textContent = state.snapshot?.pipelines?.length || 0;
  els.mobileViewTitle.textContent = viewLabel(state.route.view);
  els.mobileViewMeta.textContent = `${reviewCount} ${t("needReview")}`;
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  els.statusFilters.querySelectorAll("[data-status]").forEach((button) => {
    button.classList.toggle("active", button.dataset.status === state.statusFilter);
  });
}

function viewLabel(view) {
  if (view === "qa") return t("qa");
  if (view === "review") return t("review");
  if (view === "studio") return t("studio");
  if (view === "vendors") return t("vendors");
  if (view === "settings") return t("settings");
  return t("overview");
}

function render() {
  if (!state.snapshot) return;
  renderShell();
  const views = {
    overview: renderOverview,
    qa: renderReview,
    review: renderReview,
    studio: renderStudio,
    vendors: renderVendors,
    settings: renderSettings,
  };
  const renderer = views[state.route.view] || renderOverview;
  renderer();
  bindContentEvents();
}

export function noticeBanner() {
  return state.notice ? `<div class="notice-banner">${esc(state.notice)}</div>` : "";
}

export function isLocked() {
  return Boolean(state.settings?.locked);
}

export function lockBanner() {
  return isLocked() ? `<div class="notice-banner">${esc(t("lockedNotice"))}</div>` : "";
}

function metric(label, value, percent) {
  return `<div class="metric">
    <span>${esc(label)}</span>
    <strong>${esc(value)}</strong>
    <div class="meter" style="--value:${Math.max(4, Math.min(100, percent))}%"><i></i></div>
  </div>`;
}

function renderOverview() {
  const snapshot = state.snapshot;
  const pipelines = snapshot.pipelines || [];
  const fast = pipelines.find((item) => item.path === "2d_fast");
  const custom = pipelines.find((item) => item.path === "3d_custom");
  const primary = fast || custom || pipelines[0] || null;
  els.title.textContent = t("overview");
  els.subtitle.textContent = `${t("generated")} ${new Date(snapshot.generated_at).toLocaleString()}`;
  els.content.innerHTML = `
    ${noticeBanner()}
    <div class="overview-workspace">
      <section class="readiness-band gate-${esc(snapshot.project.verdict)}">
        <div>
          <div class="eyebrow">${t("currentPath")}</div>
          <h2>${pathLabel(snapshot.project.recommended_path)} · ${esc(snapshot.project.name)}</h2>
          <p>${esc(snapshot.project.launch_goal)}</p>
        </div>
        <div class="score-ring" style="background: conic-gradient(var(--accent) 0 ${snapshot.project.readiness_score}%, #e5e7eb ${snapshot.project.readiness_score}% 100%)">
          <div><strong>${snapshot.project.readiness_score}</strong><span>${t("readiness")}</span></div>
        </div>
      </section>
      <section class="metric-grid">
        ${metric(t("latency"), `${snapshot.metrics.current_latency_ms}ms / ${snapshot.metrics.target_latency_ms}ms`, 72)}
        ${metric(t("lipSync"), `${snapshot.metrics.lip_sync_score}%`, snapshot.metrics.lip_sync_score)}
        ${metric(t("stability"), `${snapshot.metrics.stream_stability}%`, snapshot.metrics.stream_stability)}
        <a class="metric metric-link" href="#/qa"><span>${t("qa")}</span><strong>${snapshot.metrics.qa_passed}/${snapshot.metrics.qa_total}</strong><em class="status-badge ${statusClass(snapshot.project.verdict)}">${snapshot.project.verdict}</em></a>
      </section>
      <section class="path-grid">
        ${fast ? pathPanel(t("fastPath"), fast, "fast", "Ship a polished web demo in days through an existing 2D digital-human service.") : ""}
        ${custom ? pathPanel(t("customPath"), custom, "custom", "Build a reusable brand character with owned motion and engine-rendered scenes.") : ""}
      </section>
      <section class="panel">
        <div class="section-head">
          <div><h2>${t("pipeline")}</h2><p class="muted">${esc(primary?.provider || "")}</p></div>
          <a class="quiet-link" href="#/studio">${t("studio")} →</a>
        </div>
        <div class="pipeline">
          ${(primary?.stages || []).map((stage, index) => `<div class="stage"><strong>${index + 1}. ${esc(stage)}</strong><span>${pipelineCaption(stage)}</span></div>`).join("")}
        </div>
      </section>
    </div>
  `;
}

function pathPanel(title, pipeline, kind, copy) {
  return `<article class="path-panel ${kind}">
    <div class="path-head">
      <h2>${esc(title)}</h2>
      <span class="path-badge ${kind}">${pathLabel(pipeline.path)}</span>
    </div>
    <p>${esc(copy)}</p>
    <dl>
      <dt>${t("latency")}</dt><dd>${pipeline.latency_ms}ms</dd>
      <dt>${t("integration")}</dt><dd>${esc(pipeline.output)}</dd>
      <dt>${t("providerMode")}</dt><dd>${esc(pipeline.label)}</dd>
    </dl>
  </article>`;
}

function pipelineCaption(stage) {
  const captions = {
    text: "script / LLM / support macro",
    tts: "voice model or vendor voice",
    "vendor avatar": "2D face and lip renderer",
    "RTC/video stream": "WebRTC, RTC, HLS, or clip",
    "web player": "customer-facing demo UI",
  };
  return captions[stage] || "handoff stage";
}

export async function submitDecision(checkId, action, card) {
  const note = card.querySelector('[data-field="note"]')?.value || "";
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  if (isLocked()) {
    state.notice = t("lockedNotice");
    render();
    return;
  }
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ check_id: checkId, action, note }),
  });
  if (!response.ok) {
    state.notice = `Decision failed: ${response.status}`;
    render();
    return;
  }
  delete state.edits[checkId];
  state.notice = t("saved");
  await loadState();
}

function startAnimation() {
  if (animationId) cancelAnimationFrame(animationId);
  const tick = (time) => {
    if (streamStore.running) {
      streamStore.audioLevel = 0.18 + Math.abs(Math.sin(time / 128)) * 0.46 + Math.abs(Math.sin(time / 47)) * 0.18;
    } else {
      streamStore.audioLevel *= 0.92;
    }
    updateMouth();
    drawWave(time);
    animationId = requestAnimationFrame(tick);
  };
  animationId = requestAnimationFrame(tick);
}

export function updateMouth() {
  const avatar = document.querySelector("#avatar");
  if (avatar) avatar.style.setProperty("--mouth-open", String(Math.max(0.08, Math.min(1, streamStore.audioLevel))));
}

function drawWave(time) {
  if (!streamStore.waveContext) return;
  const canvas = streamStore.waveContext.canvas;
  const width = canvas.width;
  const height = canvas.height;
  streamStore.waveContext.clearRect(0, 0, width, height);
  streamStore.waveContext.fillStyle = "rgba(255,255,255,0.06)";
  streamStore.waveContext.fillRect(0, 0, width, height);
  streamStore.waveContext.lineWidth = 3;
  streamStore.waveContext.strokeStyle = "rgba(45, 212, 191, 0.95)";
  streamStore.waveContext.beginPath();
  for (let x = 0; x < width; x += 4) {
    const y =
      height / 2 +
      Math.sin((x + time / 4) / 25) * 18 * streamStore.audioLevel +
      Math.sin((x + time / 2) / 9) * 8 * streamStore.audioLevel;
    if (x === 0) streamStore.waveContext.moveTo(x, y);
    else streamStore.waveContext.lineTo(x, y);
  }
  streamStore.waveContext.stroke();
}

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle.addEventListener("click", toggleSidebar);
els.sidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
els.refresh.addEventListener("click", loadState);
els.mobileRefresh.addEventListener("click", loadState);
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  if (state.route.view === "review" || state.route.view === "qa") renderReview();
});
els.statusFilters.querySelectorAll("[data-status]").forEach((button) => {
  button.addEventListener("click", () => {
    state.statusFilter = button.dataset.status;
    if (state.route.view !== "review" && state.route.view !== "qa") location.hash = "#/qa";
    else render();
  });
});
els.language.addEventListener("change", () => {
  state.lang = els.language.value;
  const url = new URL(location.href);
  url.searchParams.set("lang", state.lang);
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  render();
});

syncResponsiveShell();
await loadState();
