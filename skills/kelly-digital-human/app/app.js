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
    saved: "已保存到本地。",
    search: "搜索",
    empty: "没有匹配项。",
  },
};

const state = {
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

let running = true;
let audioLevel = 0.24;
let animationId = 0;
let waveContext = null;
let currentPersona = "kelly-host-cn";
let currentProvider = "fast-2d-stream";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-digital-human.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
};

const els = {
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

function t(key) {
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

function isMobileLayout() {
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

function decisionFor(id) {
  return state.settings?.decisions?.decisions?.[id] || null;
}

function effectiveStatus(check) {
  const decision = decisionFor(check.id);
  if (decision?.action && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  if (check.status === "pass") return "approved";
  if (check.status === "block") return "blocked";
  return "needs_review";
}

function statusClass(status) {
  if (status === "approved" || status === "pass" || status === "SHIP" || status === "ready_for_demo") return "pass";
  if (status === "blocked" || status === "block" || status === "BLOCK") return "block";
  return "fix";
}

function statusLabel(status) {
  if (status === "needs_review") return t("needsReview");
  if (status === "changes_requested") return t("changesRequested");
  if (status === "approved") return t("approved");
  if (status === "blocked") return t("blocked");
  return String(status || "").replaceAll("_", " ");
}

function pathLabel(path) {
  if (path === "2d_fast") return state.lang === "zh" ? "2D 快上线" : "2D fast";
  if (path === "3d_custom") return state.lang === "zh" ? "3D 定制" : "3D custom";
  return "Hybrid";
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function checks() {
  return state.snapshot?.qa_checks || [];
}

function filteredChecks() {
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

function selectedCheck() {
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

function noticeBanner() {
  return state.notice ? `<div class="notice-banner">${esc(state.notice)}</div>` : "";
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
  const fast = snapshot.pipelines.find((item) => item.path === "2d_fast");
  const custom = snapshot.pipelines.find((item) => item.path === "3d_custom");
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
        ${pathPanel(t("fastPath"), fast, "fast", "Ship a polished web demo in days through an existing 2D digital-human service.")}
        ${pathPanel(t("customPath"), custom, "custom", "Build a reusable brand character with owned motion and engine-rendered scenes.")}
      </section>
      <section class="panel">
        <div class="section-head">
          <div><h2>${t("pipeline")}</h2><p class="muted">${esc(fast.provider)}</p></div>
          <a class="quiet-link" href="#/studio">${t("studio")} →</a>
        </div>
        <div class="pipeline">
          ${fast.stages.map((stage, index) => `<div class="stage"><strong>${index + 1}. ${esc(stage)}</strong><span>${pipelineCaption(stage)}</span></div>`).join("")}
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

function renderReview() {
  const items = filteredChecks();
  const selected = selectedCheck();
  if (selected) state.selectedId = selected.id;
  els.title.textContent = t("reviewTitle");
  els.subtitle.textContent = t("reviewSubtitle");
  els.content.innerHTML = `
    ${noticeBanner()}
    <div class="review-layout">
      <section class="list-panel">
        <div class="list-head">
          <div><h2>${t("review")}</h2><p class="muted">${items.length} ${t("all").toLowerCase()}</p></div>
        </div>
        <div class="review-list">
          ${
            items
              .map((check) => {
                const status = effectiveStatus(check);
                return `<button class="review-row ${check.id === state.selectedId ? "active" : ""}" type="button" data-select="${esc(check.id)}">
                  <span class="row-title">${esc(check.label)}</span>
                  <span class="row-meta">${esc(check.owner)} · ${esc(check.evidence)}</span>
                  <span class="status-badge ${statusClass(status)}">${statusLabel(status)}</span>
                </button>`;
              })
              .join("") || `<div class="empty">${t("empty")}</div>`
          }
        </div>
      </section>
      <aside class="detail-panel">
        ${selected ? renderCheckDetail(selected) : `<div class="empty">${t("empty")}</div>`}
      </aside>
    </div>
  `;
}

function renderCheckDetail(check) {
  const status = effectiveStatus(check);
  const decision = decisionFor(check.id);
  const edits = state.edits[check.id] || {};
  const note = edits.note ?? decision?.note ?? decision?.comment ?? "";
  return `<article class="detail-card" data-check="${esc(check.id)}">
    <button class="back-to-list" type="button" data-back>${state.lang === "zh" ? "返回列表" : "Back to list"}</button>
    <header class="detail-head">
      <div>
        <span class="eyebrow">${t("qa")}</span>
        <h2>${esc(check.label)}</h2>
        <p class="muted">${t("owner")}: ${esc(check.owner)}</p>
      </div>
      <span class="status-badge ${statusClass(status)}">${statusLabel(status)}</span>
    </header>
    <section class="detail-section">
      <h3>${t("evidence")}</h3>
      <p>${esc(check.evidence)}</p>
    </section>
    <section class="detail-section">
      <h3>${t("note")}</h3>
      <textarea data-field="note" rows="5" placeholder="${esc(t("notePlaceholder"))}">${esc(note)}</textarea>
    </section>
    <footer class="detail-actions">
      <button class="approve" type="button" data-action="approve">${t("approve")}</button>
      <button type="button" data-action="request_changes">${t("requestChanges")}</button>
      <button class="danger" type="button" data-action="block">${t("block")}</button>
    </footer>
    ${
      decision
        ? `<div class="decision-log">${t("decision")}: ${esc(decision.action)} · ${esc(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</div>`
        : ""
    }
  </article>`;
}

function renderStudio() {
  const snapshot = state.snapshot;
  const persona = snapshot.personas.find((item) => item.id === currentPersona) || snapshot.personas[0];
  const pipeline = snapshot.pipelines.find((item) => item.id === currentProvider) || snapshot.pipelines[0];
  const script =
    state.lang === "zh"
      ? "你好，我是 Kelly AI 数字人助理。今天我会用一个实时视频流，演示语音输入、唇形驱动、字幕、延迟监控和上线 QA 的完整闭环。"
      : "Hi, I am Kelly's AI digital host. This live stream shows voice input, lip sync, captions, latency monitoring, and the QA gate before launch.";
  els.title.textContent = t("studioTitle");
  els.subtitle.textContent = t("studioSubtitle");
  els.content.innerHTML = `
    <div class="studio-layout">
      <section class="video-stage">
        <div class="video-grid"></div>
        <div class="stage-hud">
          <span class="hud-chip">LIVE PREVIEW</span>
          <span class="hud-chip">${esc(pipeline.label)}</span>
          <span class="hud-chip">${pipeline.latency_ms}ms</span>
          <span class="spacer"></span>
          <span class="hud-chip">${running ? "STREAMING" : "PAUSED"}</span>
        </div>
        <div class="avatar-wrap">
          <div class="avatar-glow"></div>
          <div class="avatar" id="avatar">
            <div class="torso"></div>
            <div class="neck"></div>
            <div class="hair"></div>
            <div class="head"></div>
            <div class="eye left"></div>
            <div class="eye right"></div>
            <div class="nose"></div>
            <div class="mouth" id="mouth"></div>
          </div>
        </div>
        <div class="subtitle">
          <canvas id="waveform" class="waveform" width="900" height="90"></canvas>
          <div class="subtitle-line">${esc(script)}</div>
        </div>
      </section>
      <aside class="studio-side">
        <section class="panel">
          <h2>${t("studio")}</h2>
          <p class="muted">${esc(persona.look)}</p>
        </section>
        <section class="panel control-stack">
          ${selectControl(
            t("persona"),
            "persona",
            snapshot.personas.map((item) => [item.id, item.name]),
          )}
          ${selectControl(
            t("providerMode"),
            "provider",
            snapshot.pipelines.map((item) => [item.id, item.label]),
          )}
          ${selectControl(t("inputMode"), "inputMode", [
            ["text", "Text to voice"],
            ["audio", "Voice stream"],
            ["llm", "LLM answer"],
          ])}
          <div class="control-row">
            <label>${t("script")}</label>
            <textarea rows="5">${esc(script)}</textarea>
          </div>
          <div class="button-row">
            <button class="approve" type="button" data-stream-action="start">${running ? t("pause") : t("start")}</button>
            <button type="button" data-stream-action="reset">${t("reset")}</button>
          </div>
        </section>
        <section class="panel">
          <h2>${t("routeLatency")}</h2>
          ${pipeline.stages.map((stage, index) => `<div class="event-row"><span>${index + 1}. ${esc(stage)}</span><strong>${Math.round((pipeline.latency_ms / pipeline.stages.length) * (0.82 + index * 0.05))}ms</strong></div>`).join("")}
        </section>
        ${
          (snapshot.events || []).length
            ? `<section class="panel">
          <h2>${t("streamEvents")}</h2>
          ${(snapshot.events || [])
            .map(
              (event) =>
                `<div class="event-row"><span><span class="hud-chip">${esc(event.kind)}</span> ${esc(event.label)}</span><strong>${esc(event.at)}</strong></div>`,
            )
            .join("")}
        </section>`
            : ""
        }
      </aside>
    </div>
  `;
  waveContext = document.querySelector("#waveform")?.getContext("2d") || null;
  updateMouth();
}

function selectControl(label, name, options) {
  return `<div class="control-row">
    <label>${esc(label)}</label>
    <select data-control="${esc(name)}">
      ${options.map(([value, optionLabel]) => `<option value="${esc(value)}" ${value === selectedValue(name) ? "selected" : ""}>${esc(optionLabel)}</option>`).join("")}
    </select>
  </div>`;
}

function selectedValue(name) {
  if (name === "persona") return currentPersona;
  if (name === "provider") return currentProvider;
  return "text";
}

function renderVendors() {
  els.title.textContent = t("vendorsTitle");
  els.subtitle.textContent = t("vendorsSubtitle");
  els.content.innerHTML = `
    <div class="vendors-layout">
      <section class="panel">
        <table class="table">
          <thead>
            <tr>
              <th>Vendor / route</th>
              <th>${t("path")}</th>
              <th>${t("integration")}</th>
              <th>${t("speed")}</th>
              <th>${t("control")}</th>
              <th>${t("cost")}</th>
              <th>${t("risks")}</th>
            </tr>
          </thead>
          <tbody>
            ${state.snapshot.vendors
              .map(
                (vendor) => `<tr>
                  <td><strong>${esc(vendor.label)}</strong></td>
                  <td><span class="path-badge ${vendor.path === "2d_fast" ? "fast" : "custom"}">${pathLabel(vendor.path)}</span></td>
                  <td>${esc(vendor.integration)}</td>
                  <td>${esc(vendor.speed)}</td>
                  <td>${esc(vendor.control)}</td>
                  <td>${esc(vendor.cost)}</td>
                  <td>${esc(vendor.risk)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>
      <aside class="panel">
        <h2>${t("architecture")}</h2>
        <div class="architecture">
          ${[
            "Input stream",
            "Reasoning or script",
            "TTS / voice",
            "Avatar renderer",
            "RTC / web player",
            "QA and fallback",
          ]
            .map(
              (label, index) => `<div class="arch-node">
                <span class="node-index">${index + 1}</span>
                <div><strong>${esc(label)}</strong><p class="muted">${architectureCopy(index)}</p></div>
              </div>`,
            )
            .join("")}
        </div>
      </aside>
    </div>
  `;
}

function architectureCopy(index) {
  const copy = [
    "Text, TTS audio, uploaded audio, or live voice after approval.",
    "LLM answer, support macro, product script, or human-approved copy.",
    "Vendor voice, cloned voice with consent, or existing audio stream.",
    "2D service for speed; UE/Unity for custom brand character.",
    "Embed as live stream, clip, WebRTC track, or controlled demo player.",
    "Block unsafe claims, missing consent, stream failure, and bad lip sync.",
  ];
  return copy[index];
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  els.content.innerHTML = `
    <div class="settings-grid">
      <section class="panel">
        <h2>${t("configuration")}</h2>
        <dl class="settings-list">
          <dt>${t("dataProvider")}</dt><dd>local</dd>
          <dt>${t("handoffFiles")}</dt><dd>app/.data/digital_human_snapshot.json<br>app/.data/decisions.json<br>app/.data/agent.lock</dd>
          <dt>${t("currentPath")}</dt><dd>${pathLabel(state.snapshot.project.recommended_path)}</dd>
        </dl>
      </section>
      <section class="panel">
        <h2>${t("safety")}</h2>
        <ul class="safety-list">
          <li>No vendor API calls in demo mode.</li>
          <li>No camera or microphone access.</li>
          <li>No voice, likeness, or customer audio upload without explicit approval.</li>
          <li>Public demo requires QA gate approval.</li>
        </ul>
      </section>
    </div>
  `;
}

function bindContentEvents() {
  document.querySelectorAll("[data-select]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.select;
      if (isMobileLayout()) document.body.classList.add("mobile-detail-open");
      renderReview();
    });
  });
  document.querySelector("[data-back]")?.addEventListener("click", () => {
    document.body.classList.remove("mobile-detail-open");
  });
  document.querySelectorAll("[data-field]").forEach((field) => {
    field.addEventListener("input", () => {
      const card = field.closest("[data-check]");
      state.edits[card.dataset.check] = { ...state.edits[card.dataset.check], [field.dataset.field]: field.value };
    });
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-check]");
      submitDecision(card.dataset.check, button.dataset.action, card);
    });
  });
  document.querySelector('[data-control="persona"]')?.addEventListener("change", (event) => {
    currentPersona = event.target.value;
    renderStudio();
  });
  document.querySelector('[data-control="provider"]')?.addEventListener("change", (event) => {
    currentProvider = event.target.value;
    renderStudio();
  });
  document.querySelector('[data-stream-action="start"]')?.addEventListener("click", () => {
    running = !running;
    renderStudio();
  });
  document.querySelector('[data-stream-action="reset"]')?.addEventListener("click", () => {
    audioLevel = 0.24;
    running = true;
    renderStudio();
  });
}

async function submitDecision(checkId, action, card) {
  const note = card.querySelector('[data-field="note"]')?.value || "";
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
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
    if (running) {
      audioLevel = 0.18 + Math.abs(Math.sin(time / 128)) * 0.46 + Math.abs(Math.sin(time / 47)) * 0.18;
    } else {
      audioLevel *= 0.92;
    }
    updateMouth();
    drawWave(time);
    animationId = requestAnimationFrame(tick);
  };
  animationId = requestAnimationFrame(tick);
}

function updateMouth() {
  const avatar = document.querySelector("#avatar");
  if (avatar) avatar.style.setProperty("--mouth-open", String(Math.max(0.08, Math.min(1, audioLevel))));
}

function drawWave(time) {
  if (!waveContext) return;
  const canvas = waveContext.canvas;
  const width = canvas.width;
  const height = canvas.height;
  waveContext.clearRect(0, 0, width, height);
  waveContext.fillStyle = "rgba(255,255,255,0.06)";
  waveContext.fillRect(0, 0, width, height);
  waveContext.lineWidth = 3;
  waveContext.strokeStyle = "rgba(45, 212, 191, 0.95)";
  waveContext.beginPath();
  for (let x = 0; x < width; x += 4) {
    const y =
      height / 2 + Math.sin((x + time / 4) / 25) * 18 * audioLevel + Math.sin((x + time / 2) / 9) * 8 * audioLevel;
    if (x === 0) waveContext.moveTo(x, y);
    else waveContext.lineTo(x, y);
  }
  waveContext.stroke();
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
