import { appConfig } from "./config.js";
import {
  buildConnectedFields,
  buildCriteriaFields,
  buildDecisionFields,
  buildScoreFields,
  buildWechatAddedFields,
  computeOverallScore,
  createInstructorSourcingDesk,
  missingCriteriaRequirements,
  nextStep,
  scoreBucket,
  statusLabel,
} from "./instructor-sourcing-model.js";
import { getProvider } from "./providers/index.js";
import { shouldUseLocalGateway } from "./runtime.js";

const root = document.querySelector("#app");

const viewMeta = {
  criteria: { label: "筛选标准", noun: "", eyebrow: "CRITERIA", list: false },
  all: { label: "全部候选人", noun: "位候选人", eyebrow: "CANDIDATES", list: true },
  qualified: { label: "已合格", noun: "位已合格", eyebrow: "QUALIFIED", list: true },
  connected: { label: "已建联", noun: "位已建联", eyebrow: "CONNECTED", list: true },
};

let currentState;
let desk;
let contentRoute = { view: "all", id: null };
let lastContentHash = "#/all";
let sidebarCollapsed = false;
let helpTab = "commands";
let authStatus = null;
// Unsaved edits survive re-renders and the refresh timer, keyed by candidate id.
const draftEdits = new Map();
let criteriaEdited = false;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const today = () => new Date().toISOString().slice(0, 10);

const parseHash = () => {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "settings") {
    return {
      view: "settings",
      tab: ["commands", "guide", "resources", "connection"].includes(parts[1]) ? parts[1] : "commands",
    };
  }
  return {
    view: viewMeta[parts[0]] ? parts[0] : "all",
    id: parts[1] ? decodeURIComponent(parts[1]) : null,
  };
};

const routeHash = ({ view, id }) => `#/${view}${id ? `/${encodeURIComponent(id)}` : ""}`;

const navigate = (route, { replace = false } = {}) => {
  const next = routeHash(route);
  if (replace) window.history.replaceState(null, "", next);
  else window.location.hash = next;
  if (replace) applyRoute();
};

const isMobileLayout = () => window.matchMedia("(max-width: 720px)").matches;

const setMobileSidebarOpen = (open) => {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  const scrim = document.querySelector("#sidebarScrim");
  if (scrim) scrim.hidden = !open;
};

const setMobileDetailOpen = (open) => {
  document.body.classList.toggle("mobile-detail-open", Boolean(open));
};

const showToast = (message) => {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
};

const isEditing = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

const scoreDraftOf = (candidate) => ({
  endorsementScore: draftEdits.get(candidate.id)?.endorsementScore ?? candidate.endorsementScore,
  expertiseScore: draftEdits.get(candidate.id)?.expertiseScore ?? candidate.expertiseScore,
  teachingScore: draftEdits.get(candidate.id)?.teachingScore ?? candidate.teachingScore,
  matchNotes: draftEdits.get(candidate.id)?.matchNotes ?? candidate.matchNotes,
});

const deriveScoredCandidate = (draft) => {
  const hasAllScores = [draft.endorsementScore, draft.expertiseScore, draft.teachingScore].every(
    (value) => value !== null && value !== undefined && value !== "",
  );
  return {
    hasAllScores,
    overallScore: computeOverallScore(draft.endorsementScore, draft.expertiseScore, draft.teachingScore),
  };
};

const itemsForView = (view) => desk.buckets[view] || [];

const statusPill = (candidate) =>
  `<span class="status-pill status-${candidate.status}">${statusLabel(candidate.status)}</span>`;

const pickAttentionCandidate = () => {
  const missingScores = desk.candidates.find(
    (candidate) => candidate.status === "screening" && !candidate.hasAllScores,
  );
  if (missingScores) return missingScores;
  const readyToDecide = desk.candidates.find((candidate) => candidate.status === "screening" && candidate.hasAllScores);
  if (readyToDecide) return readyToDecide;
  const awaitingWechat = desk.candidates.find(
    (candidate) => candidate.status === "qualified" && !candidate.wechatAddedAt,
  );
  if (awaitingWechat) return awaitingWechat;
  return desk.candidates.find((candidate) => candidate.status === "qualified" && candidate.wechatAddedAt) || null;
};

const renderCandidateRow = (candidate, active) => {
  const trailing =
    candidate.status === "connected"
      ? `已建联 ${escapeHtml(candidate.loggedAt || candidate.wechatAddedAt || "--")}`
      : candidate.status === "qualified"
        ? candidate.wechatAddedAt
          ? `微信已加 ${escapeHtml(candidate.wechatAddedAt)} · 待标记已建联`
          : "已合格 · 待人工加微信"
        : candidate.status === "not-qualified"
          ? `不合格 ${escapeHtml(candidate.loggedAt || "--")}`
          : candidate.hasAllScores
            ? "评分已完整 · 待下结论"
            : "待补齐评分";
  return `<button class="work-row candidate-row ${active ? "active" : ""}" type="button" data-select-id="${escapeHtml(candidate.id)}">
    <span class="row-marker" aria-hidden="true"></span>
    <span class="row-rank">${escapeHtml(candidate.ref)}</span>
    <span class="row-main">
      <span class="row-kicker">${escapeHtml(candidate.searchContext || "来源未记录")} · ${statusLabel(candidate.status)}</span>
      <span class="row-title"><strong>${escapeHtml(candidate.name)}</strong></span>
      <span class="row-subtitle">${escapeHtml(candidate.platformHeadline || "无平台简介")}</span>
      <span class="row-subtitle">${trailing}</span>
    </span>
    <span class="row-score score-${scoreBucket(candidate.overallScore)}"><strong>${candidate.overallScore}</strong><span>综合分</span></span>
  </button>`;
};

const renderRows = (items, selectedId) => {
  if (!items.length) {
    return `<div class="empty-state"><p>这里还没有候选讲师。</p><p class="empty-hint">在筛选标准就绪后，把在平台上找到的候选人一个个录入并打分。</p>${commandChip("/kelly-instructor-sourcing review")}</div>`;
  }
  return items.map((item) => renderCandidateRow(item, item.id === selectedId)).join("");
};

const renderTextField = (attribute, key, label, value, hint = "") =>
  `<label class="field"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input type="text" ${attribute}="${key}" value="${escapeHtml(value)}" /></label>`;

const renderCandidateDetail = (candidate) => {
  const draft = scoreDraftOf(candidate);
  const overallPreview = computeOverallScore(draft.endorsementScore, draft.expertiseScore, draft.teachingScore);
  const step = nextStep(candidate);
  return `<div class="detail-scroll">
    <button class="back-to-list" type="button" data-back-to-list>&larr; 返回${viewMeta[contentRoute.view].label}</button>
    <div class="detail-heading">
      <div><p class="eyebrow">${escapeHtml(candidate.ref)} · ${escapeHtml(candidate.searchContext || "来源未记录")}</p><h2>${escapeHtml(candidate.name)}</h2></div>
      ${statusPill(candidate)}
    </div>
    <div class="detail-facts">
      <div class="detail-fact"><span>综合评分</span><strong class="score-${scoreBucket(overallPreview)}">${overallPreview}</strong></div>
      <div class="detail-fact"><span>平台简介</span><strong>${escapeHtml(candidate.platformHeadline || "--")}</strong></div>
    </div>
    <section class="detail-section compose">
      <label class="field"><span>背景背书<small>0-100</small></span><input type="number" min="0" max="100" data-score="endorsement" value="${escapeHtml(draft.endorsementScore)}" /></label>
      <label class="field"><span>专业深广度<small>0-100</small></span><input type="number" min="0" max="100" data-score="expertise" value="${escapeHtml(draft.expertiseScore)}" /></label>
      <label class="field"><span>授课服务能力<small>0-100</small></span><input type="number" min="0" max="100" data-score="teaching" value="${escapeHtml(draft.teachingScore)}" /></label>
      <label class="field"><span>评分依据</span><textarea data-notes rows="4">${escapeHtml(draft.matchNotes)}</textarea></label>
    </section>
    <div class="detail-actions">
      <button class="ghost-button" type="button" data-save-scores>保存评分</button>
      ${
        candidate.status === "screening"
          ? `<button class="primary-button" type="button" data-decide="qualified" ${candidate.hasAllScores ? "" : "disabled"}>标记合格</button>
      <button class="ghost-button" type="button" data-decide="not-qualified" ${candidate.hasAllScores ? "" : "disabled"}>标记不合格</button>`
          : ""
      }
    </div>
    ${
      candidate.status === "qualified" && !candidate.wechatAddedAt
        ? `<section class="detail-section compose"><label class="field"><span>微信添加日期<small>只在真实加上之后才填</small></span><input type="date" data-wechat-date value="${escapeHtml(today())}" /></label><div class="detail-actions"><button class="primary-button" type="button" data-record-wechat>记录微信已添加</button></div></section>`
        : ""
    }
    ${
      candidate.status === "qualified" && candidate.wechatAddedAt
        ? `<section class="detail-section"><h3>建联记录</h3><dl class="detail-list"><div><dt>微信添加时间</dt><dd>${escapeHtml(candidate.wechatAddedAt)}</dd></div></dl><div class="detail-actions"><button class="primary-button" type="button" data-mark-connected>标记已建联</button></div></section>`
        : ""
    }
    ${
      candidate.status === "connected"
        ? `<section class="detail-section"><h3>建联记录</h3><dl class="detail-list"><div><dt>微信添加时间</dt><dd>${escapeHtml(candidate.wechatAddedAt || "--")}</dd></div><div><dt>建联记录时间</dt><dd>${escapeHtml(candidate.loggedAt || "--")}</dd></div></dl></section>`
        : ""
    }
    ${
      candidate.status === "not-qualified"
        ? `<section class="detail-section"><h3>结论记录</h3><dl class="detail-list"><div><dt>记录时间</dt><dd>${escapeHtml(candidate.loggedAt || "--")}</dd></div></dl></section>`
        : ""
    }
    ${
      step
        ? `<div class="detail-hint"><p class="detail-note">${escapeHtml(step.detail)}</p>${step.command ? commandChip(step.command) : ""}</div>`
        : ""
    }
  </div>`;
};

const renderCriteria = () => {
  const criteria = desk.criteria;
  return `<div class="profile-pane"><div class="detail-scroll">
    <div class="detail-heading"><div><p class="eyebrow">CRITERIA</p><h2>筛选标准与评分尺</h2></div>${criteria.ready ? '<span class="status-pill status-connected">可以开始筛选</span>' : `<span class="status-pill status-screening">缺 ${criteria.missing.length} 项</span>`}</div>
    <p class="detail-note">只要先说清楚要找什么样的人。评分标准可以随时调整，调整不会覆盖已经打出的分数。</p>
    <div class="detail-hint">${commandChip("/kelly-instructor-sourcing criteria", "整理搜索关键词、筛选假设和三项评分标准")}</div>
    ${criteria.ready ? "" : `<div class="setup-notice">还缺：${escapeHtml(criteria.missing.join("、"))}</div>`}
    <section class="detail-section compose">
      ${renderTextField("data-criteria", "roleKeywords", "搜索关键词", criteria.roleKeywords, "必填")}
      ${renderTextField("data-criteria", "experienceFilter", "经验筛选假设", criteria.experienceFilter)}
      ${renderTextField("data-criteria", "activityFilter", "活跃度筛选假设", criteria.activityFilter)}
      <label class="field"><span>背景背书标准<small>什么样的背景/背书算合格</small></span><textarea data-criteria="endorsementRubric" rows="4">${escapeHtml(criteria.endorsementRubric)}</textarea></label>
      <label class="field"><span>专业深广度标准<small>深度和广度分别看什么</small></span><textarea data-criteria="expertiseRubric" rows="4">${escapeHtml(criteria.expertiseRubric)}</textarea></label>
      <label class="field"><span>授课服务能力标准<small>课程结构、案例、学员反馈</small></span><textarea data-criteria="teachingRubric" rows="4">${escapeHtml(criteria.teachingRubric)}</textarea></label>
      <label class="field"><span>合格分数线<small>综合分达到多少可标记为合格，必填</small></span><input type="number" min="0" max="100" data-criteria="qualifyThreshold" value="${escapeHtml(criteria.qualifyThreshold ?? "")}" /></label>
    </section>
    <div class="detail-actions">
      <button class="primary-button" type="button" data-save-criteria>保存标准</button>
      <button class="ghost-button" type="button" data-view="all">去看候选人</button>
    </div>
  </div></div>`;
};

const renderPipeline = () => {
  const steps = [
    [
      "criteria",
      "定标准",
      desk.criteria.ready ? "可以筛选" : `缺 ${desk.criteria.missing.length} 项`,
      desk.criteria.ready,
    ],
    ["all", "找候选人", `${desk.counts.all} 位已入库`, desk.counts.all > 0],
    ["connected", "建联", `${desk.counts.connected} 位已建联`, desk.counts.connected > 0],
  ];
  return `<section class="workflow-band"><div class="pipeline" aria-label="讲师寻访流程">
    ${steps
      .map(
        ([view, label, meta, done], index) =>
          `<button class="pipeline-step ${contentRoute.view === view ? "active" : ""} ${done ? "done" : ""}" type="button" data-view="${view}"><i aria-hidden="true">${index + 1}</i><span><strong>${label}</strong><small>${escapeHtml(meta)}</small></span>${index < 2 ? '<b aria-hidden="true">›</b>' : ""}</button>`,
      )
      .join("")}
  </div></section>`;
};

const commandChip = (command, note = "") =>
  `<button class="command-chip" type="button" data-copy-command="${escapeHtml(command)}" title="点一下复制">
    <code>${escapeHtml(command)}</code>${note ? `<small>${escapeHtml(note)}</small>` : ""}
  </button>`;

const renderNextStepBand = () => {
  if (!desk.criteria.ready) {
    return `<section class="next-step" aria-label="下一步"><div class="next-step-title">先定筛选标准</div><div class="next-step-detail">还缺 ${escapeHtml(desk.criteria.missing.join("、"))}。</div>${commandChip("/kelly-instructor-sourcing criteria")}</section>`;
  }
  if (!desk.counts.all) {
    return `<section class="next-step" aria-label="下一步"><div class="next-step-title">开始找候选人</div><div class="next-step-detail">标准已就绪，去平台上搜索候选人，逐个录入并打分。</div>${commandChip("/kelly-instructor-sourcing review")}</section>`;
  }
  const candidate = pickAttentionCandidate();
  const step = candidate ? nextStep(candidate) : null;
  if (!step) return "";
  return `<section class="next-step" aria-label="下一步"><div class="next-step-title">${escapeHtml(step.title)}</div><div class="next-step-detail">${escapeHtml(step.detail)}</div>${step.command ? commandChip(step.command) : ""}</section>`;
};

const renderMobileNextStep = () => {
  if (!desk.criteria.ready || !desk.counts.all) return "";
  const candidate = pickAttentionCandidate();
  const step = candidate ? nextStep(candidate) : null;
  if (!step?.command) return "";
  return `<div class="mobile-next-step"><span>${escapeHtml(step.title)}</span>${commandChip(step.command)}</div>`;
};

const renderSidebar = () => {
  const attention = desk.attention;
  const primary = attention.criteriaReady
    ? `<button class="human-work-primary" type="button" data-view="all"><span><strong>${attention.screening}</strong><span>位待筛选</span></span></button>`
    : `<button class="human-work-primary warn" type="button" data-view="criteria"><span><strong>${attention.criteriaMissing.length}</strong><span>请先定标准</span></span></button>`;
  return `<aside class="sidebar ${sidebarCollapsed ? "collapsed" : ""}" id="appSidebar">
    <div class="brand"><div class="brand-icon" aria-hidden="true">IS</div><div class="brand-copy"><div class="brand-title">Kelly 讲师寻访</div><div class="brand-subtitle">候选讲师工作台</div></div><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="appSidebar" aria-expanded="${!sidebarCollapsed}" aria-label="切换侧栏" title="切换侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button></div>
    <section class="human-work" aria-labelledby="humanWorkTitle"><div class="human-work-eyebrow">需要你</div><div id="humanWorkTitle" class="human-work-title">今天的筛选</div>${primary}<div class="human-work-secondary"><button type="button" data-view="all" title="三项评分已完整，等待下结论"><strong>${attention.readyToDecide}</strong><span>待下结论</span></button><button type="button" data-view="connected" title="已完成建联"><strong>${desk.counts.connected}</strong><span>已建联</span></button></div></section>
    ${renderNextStepBand()}
    <div class="sidebar-separator"></div>
    <nav class="filters" aria-label="工作流导航">${Object.entries(viewMeta)
      .map(
        ([key, meta]) =>
          `<button class="${contentRoute.view === key ? "active" : ""}" type="button" data-view="${key}" title="打开${meta.label}"><span>${meta.label}</span><span>${key === "criteria" ? (desk.criteria.ready ? "✓" : "!") : desk.counts[key]}</span></button>`,
      )
      .join("")}</nav>
    <div class="help-box"><div class="virtual-only"><span></span>微信添加只在应用外发生</div><button class="help-button" type="button" data-open-help>帮助与设置</button></div>
  </aside>`;
};

const renderHelp =
  () => `<div class="modal-backdrop" id="helpModal" aria-hidden="false"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
  <div class="modal-head"><div><div id="helpTitle" class="modal-title">帮助与设置</div><div class="modal-subtitle">Kelly 讲师寻访 · 候选讲师工作台</div></div><button class="icon-button" type="button" data-close-help aria-label="关闭帮助">关闭</button></div>
  <nav class="modal-tabs" aria-label="帮助与设置标签"><button class="${helpTab === "commands" ? "active" : ""}" type="button" data-help-tab="commands">命令</button><button class="${helpTab === "guide" ? "active" : ""}" type="button" data-help-tab="guide">指南</button><button class="${helpTab === "resources" ? "active" : ""}" type="button" data-help-tab="resources">资源</button><button class="${helpTab === "connection" ? "active" : ""}" type="button" data-help-tab="connection">连接</button></nav>
  <div class="modal-body">
    <section class="help-tab-panel ${helpTab === "commands" ? "active" : ""}"><h2>回到对话框能做什么</h2>
      <p class="detail-note">这个页面负责让你看清楚和拍板。搜索候选人和真正加微信这些活在对话框和平台那边，点一下命令即可复制。</p>
      <div class="command-list">
        ${commandChip("/kelly-instructor-sourcing criteria", "整理搜索关键词、筛选假设和三项评分标准")}
        ${commandChip("/kelly-instructor-sourcing review", "录入候选人、按标准打分，记录真实发生的微信添加")}
      </div>
      <p class="detail-note">这个技能没有发送步骤：微信添加只在真实世界里发生，这个页面只负责记录它已经发生。</p>
    </section>
    <section class="help-tab-panel ${helpTab === "guide" ? "active" : ""}"><h2>三步走</h2><dl class="settings-list">
      <div><dt>1 定标准</dt><dd>先写清楚搜索关键词和合格分数线。三项评分标准越具体，评分越一致。</dd></div>
      <div><dt>2 找人评分</dt><dd>在平台上找候选人，录入姓名与公开简介，按背景背书、专业深广度、授课服务能力三项打分，再标记合格或不合格。</dd></div>
      <div><dt>3 记建联</dt><dd>真的在平台外加上候选人微信之后，回来记录添加日期，再标记为已建联。这个页面永远不会替你加微信。</dd></div>
      <div><dt>范围边界</dt><dd>v1 只做获取信息、建立连接、录入数据。合作后的表现评分、约课、录课或归档都不在这个技能里。</dd></div>
    </dl></section>
    <section class="help-tab-panel ${helpTab === "resources" ? "active" : ""}"><h2>Busabase 资源</h2><dl class="settings-list">
      <div><dt>应用根节点</dt><dd><code>${escapeHtml(appConfig.folder.slug)}</code></dd></div>
      <div><dt>结构化数据</dt><dd>${appConfig.bases.map((base) => escapeHtml(base.name)).join("、")}</dd></div>
      <div><dt>秘密数据</dt><dd>没有。这个技能不连接任何真实平台或消息账号，也没有 Vault 需求。</dd></div>
    </dl></section>
    <section class="help-tab-panel ${helpTab === "connection" ? "active" : ""}"><h2>连接状态</h2><dl class="settings-list">
      <div><dt>数据提供方</dt><dd>${currentState.provider.name === "demo" ? "固定演示数据（不写入）" : "Busabase SDK"}</dd></div>
      <div><dt>Space</dt><dd>${authStatus?.space ? `${escapeHtml(authStatus.space.name || "Space")} · <code>${escapeHtml(authStatus.space.id)}</code>` : currentState.provider.name === "demo" ? "演示模式" : "由 Busabase 当前环境提供"}</dd></div>
      <div><dt>写入方式</dt><dd>${currentState.provider.pendingReview ? "AirApp 内提交待审 ChangeRequest" : "本地预览直接合并"}</dd></div>
      <div><dt>资源版本</dt><dd>Schema v${appConfig.schemaVersion}</dd></div>
      <div><dt>运行边界</dt><dd>本地与 AirApp 使用同一份 Hono 应用源码。</dd></div>
    </dl></section>
  </div>
</section></div>`;

const renderApp = () => {
  const meta = viewMeta[contentRoute.view];
  const items = meta.list ? itemsForView(contentRoute.view) : [];
  const selected = meta.list ? items.find((item) => item.id === contentRoute.id) || items[0] || null : null;
  const statusChip =
    currentState.provider.name === "demo"
      ? '<span class="snapshot-badge">DEMO</span>'
      : '<span class="status-dot"></span>';
  const content = meta.list
    ? `<section class="content"><div class="list-panel"><div class="list-head"><div><strong>${meta.label}</strong><span>${items.length} ${meta.noun}</span></div><span>按状态 · 综合评分排序</span></div><div class="work-list">${renderRows(items, selected?.id)}</div></div><aside class="detail-panel">${selected ? renderCandidateDetail(selected) : '<div class="empty-detail">从左侧选择一位候选人</div>'}</aside></section>`
    : `<section class="content content-single">${renderCriteria()}</section>`;
  root.innerHTML = `<div class="app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}">${renderSidebar()}<main class="main">
    <div class="mobile-topbar"><button class="mobile-sidebar-toggle" type="button" data-mobile-sidebar aria-controls="appSidebar" aria-label="打开侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button><div class="mobile-topbar-copy"><div class="mobile-view-title">${meta.label}</div><div class="mobile-view-meta">${meta.list ? `${items.length} ${meta.noun}` : desk.criteria.ready ? "已就绪" : `缺 ${desk.criteria.missing.length} 项`}</div></div><button class="mobile-help-button" type="button" data-open-help aria-label="帮助与设置">帮助</button></div>
    ${renderMobileNextStep()}
    <header class="workspace-head"><div><p class="eyebrow">${meta.eyebrow}</p><h1>${meta.label}</h1></div><div class="workspace-status">${statusChip}<span>${escapeHtml(currentState.provider.asOf || "Busabase 当前数据")}</span>${currentState.provider.pendingReview ? '<span class="read-only">写入待审</span>' : ""}<button type="button" data-refresh>刷新</button></div></header>
    ${renderPipeline()}
    ${content}
  </main></div><div id="sidebarScrim" class="sidebar-scrim" hidden></div>${parseHash().view === "settings" ? renderHelp() : ""}<div class="toast" role="status" aria-live="polite" hidden></div>`;
  bindEvents();
};

const renderSetup = (error) => {
  const raw = String(error?.message || error || "SETUP_REQUIRED");
  const [code] = raw.split(":", 1);
  const reason = raw.replace(/^[A-Z_]+:\s*/, "");
  const pending = code === "SETUP_PENDING";
  const retryOnly = ["SETUP_PENDING", "SCHEMA_INCOMPLETE"].includes(code);
  const canProvision = code === "SETUP_REQUIRED";
  const title = pending ? "等待工作区审批" : canProvision ? "初始化 Busabase 工作区" : "工作区暂未就绪";
  const resources = appConfig.bases.map((base) => base.name).join("、");
  const body = canProvision
    ? `<p>将在当前 Space 的应用 Folder 下创建 ${escapeHtml(resources)} 两个 Base。</p><p class="detail-note">结构通过一个 Busabase ChangeRequest 幂等提交；旧版资源不会被删除或继续读取。</p>`
    : `<p>${escapeHtml(reason)}</p><p class="detail-note">应用不会要求你手工创建 Node/Base 或复制 ID，也不会切换到本地数据。</p>`;
  const selectedSpace = authStatus?.space
    ? `${authStatus.space.name || "Space"} · ${authStatus.space.id}`
    : "当前 Space";
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal" role="dialog" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">IS</div><div><p class="eyebrow">WORKSPACE SETUP</p><h1 id="setupTitle">${title}</h1></div></div><div class="setup-body"><p><strong>${escapeHtml(authStatus?.baseUrl || "Busabase")}</strong> 鉴权已就绪。</p><p class="setup-context">Space：${escapeHtml(selectedSpace)}</p>${body}<div class="setup-notice" data-setup-status hidden></div></div>${canProvision ? `<div class="setup-next">初始化完成后，运行 ${commandChip("/kelly-instructor-sourcing criteria", "把想找的讲师画像交给 Agent")} 开始。</div>` : ""}<div class="setup-footer setup-footer-split">${canProvision ? '<button class="connect-button" type="button" data-provision>初始化工作区</button>' : retryOnly ? '<button class="connect-button" type="button" data-retry-setup>重新检查</button>' : ""}<a class="text-link" href="?demo=1#/all">进入演示数据</a></div></section></div>`;
  root.querySelector("[data-retry-setup]")?.addEventListener("click", load);
  root.querySelector("[data-provision]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const status = root.querySelector("[data-setup-status]");
    button.disabled = true;
    status.hidden = false;
    status.textContent = "正在提交工作区结构...";
    try {
      const provider = await getProvider();
      await provider.provisionResources();
      await load();
    } catch (provisionError) {
      renderSetup(provisionError);
    }
  });
};

const criteriaInputFrom = (selector = "[data-onboarding]") => {
  const input = {};
  root.querySelectorAll(selector).forEach((element) => {
    input[element.dataset.onboarding || element.dataset.criteria] = element.value;
  });
  return input;
};

const renderOnboarding = () => {
  const criteria = desk.criteria;
  const onboardingField = (key, label, value, hint = "") => renderTextField("data-onboarding", key, label, value, hint);
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal onboarding-modal" role="dialog" aria-labelledby="onboardingTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">IS</div><div><p class="eyebrow">FIRST RUN · ${appConfig.onboardingVersion}</p><h1 id="onboardingTitle">先告诉我要找什么样的讲师</h1></div></div><form id="onboardingForm" class="setup-body onboarding-form" data-onboarding-form><p>只需录入搜索关键词和合格分数线。评分标准细节可以之后再补，未经你审核不会标记任何候选人为合格或已建联。</p><div class="onboarding-grid">${onboardingField("roleKeywords", "搜索关键词", criteria.roleKeywords, "必填，例如：财务 讲师")}${onboardingField("qualifyThreshold", "合格分数线", criteria.qualifyThreshold ?? "", "必填，0-100 的综合分门槛")}</div>${onboardingField("experienceFilter", "经验筛选假设", criteria.experienceFilter, "可选，例如：10 年以上行业经验")}<div class="setup-error" data-onboarding-error role="alert" hidden></div><div class="detail-hint">${commandChip("/kelly-instructor-sourcing criteria", "也可以把完整的讲师画像交给 Agent 整理")}</div></form><div class="setup-footer setup-footer-split"><span class="setup-security">筛选标准与完成状态保存在当前 Busabase Space</span><button class="connect-button" type="submit" form="onboardingForm" data-complete-onboarding>保存并进入工作台</button></div></section></div>`;
  root.querySelector("[data-copy-command]")?.addEventListener("click", async (event) => {
    const command = event.currentTarget.dataset.copyCommand;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // The visible command remains available when clipboard access is denied.
    }
  });
  root.querySelector("[data-onboarding-form]")?.addEventListener("submit", completeOnboarding);
};

const renderSpaceSetup = (status = {}) => {
  const options = (status.spaces || [])
    .map(
      (space) =>
        `<option value="${escapeHtml(space.id)}">${escapeHtml(space.name || "未命名 Space")} · ${escapeHtml(space.id)}</option>`,
    )
    .join("");
  const unavailable = !options;
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal setup-connect" role="dialog" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">IS</div><div><p class="eyebrow">KELLY INSTRUCTOR SOURCING</p><h1 id="setupTitle">选择 Busabase Space</h1></div></div><form id="spaceSelectionForm" class="setup-body space-form" data-space-form><p>已登录 <strong>${escapeHtml(status.baseUrl || "Busabase")}</strong>。请选择筛选标准与候选人所在的 Space。</p>${unavailable ? `<div class="setup-error" role="alert">${escapeHtml(status.spaceError || "当前账号没有可访问的 Space。")}</div>` : `<label class="space-select"><span>Space</span><select name="space_id" required>${options}</select></label>`}<div class="setup-error" data-space-error hidden></div><p class="setup-security">确认前不会检查、创建或修复任何应用资源。</p></form><div class="setup-footer setup-footer-split"><a class="text-link" href="?demo=1#/all">进入演示数据</a><button class="connect-button" type="submit" form="spaceSelectionForm" data-space-submit ${unavailable ? "disabled" : ""}>使用这个 Space</button></div></section></div>`;
  const form = root.querySelector("[data-space-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = root.querySelector("[data-space-submit]");
    const error = form.querySelector("[data-space-error]");
    button.disabled = true;
    error.hidden = true;
    try {
      const response = await fetch("/auth/space", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "无法选择 Space。");
      await load();
    } catch (spaceError) {
      error.textContent = spaceError instanceof Error ? spaceError.message : String(spaceError);
      error.hidden = false;
      button.disabled = false;
    }
  });
};

const renderConnectSetup = (status = {}) => {
  const oauthError = new URLSearchParams(window.location.search).get("oauth_error");
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal setup-connect" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">IS</div><div><p class="eyebrow">KELLY INSTRUCTOR SOURCING</p><h1 id="setupTitle">连接 Busabase</h1></div></div><form class="setup-body connection-form" method="post" action="/auth/start">${oauthError ? `<div class="setup-error" role="alert">${escapeHtml(oauthError)}</div>` : ""}${status.readiness === "needs_auth" ? '<div class="setup-notice">登录已过期，请重新连接。</div>' : ""}<fieldset class="connection-options"><legend>服务器</legend><label class="connection-option active"><input type="radio" name="server_mode" value="cloud" checked /><span><strong>Busabase Cloud</strong><small>busabase.com</small></span></label><label class="connection-option"><input type="radio" name="server_mode" value="custom" /><span><strong>自定义服务器</strong><small>自托管或企业地址</small></span></label></fieldset><label class="custom-url" hidden><span>Busabase URL</span><input type="url" name="custom_base_url" inputmode="url" placeholder="https://busabase.example.com" autocomplete="url" /></label><input type="hidden" name="base_url" value="${escapeHtml(status.cloudBaseUrl || "https://busabase.com")}" /><button class="connect-button" type="submit">连接 Busabase</button></form><div class="setup-footer setup-footer-split"><span class="setup-security">OAuth 凭证仅保存在本机 ~/.busabase/airapps</span><a class="text-link" href="?demo=1#/all">进入演示数据</a></div></section></div>`;
  const form = root.querySelector(".connection-form");
  const hiddenBaseUrl = form?.querySelector('input[name="base_url"]');
  const customWrap = form?.querySelector(".custom-url");
  const customInput = form?.querySelector('input[name="custom_base_url"]');
  form?.querySelectorAll('input[name="server_mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const custom = radio.checked && radio.value === "custom";
      form
        .querySelectorAll(".connection-option")
        .forEach((option) => option.classList.toggle("active", option.querySelector("input")?.checked));
      customWrap.hidden = !custom;
      customInput.required = custom;
      hiddenBaseUrl.value = custom ? customInput.value : status.cloudBaseUrl || "https://busabase.com";
      if (custom) customInput.focus();
    });
  });
  customInput?.addEventListener("input", () => {
    hiddenBaseUrl.value = customInput.value;
  });
};

const writeNotice = (result) => {
  if (result?.demo) return "演示模式：没有写入 Busabase。";
  if (currentState.provider.pendingReview) return "已提交 ChangeRequest，等待 Space 审核后生效。";
  return "";
};

const selectedCandidate = () => {
  const items = itemsForView(contentRoute.view);
  return items.find((item) => item.id === contentRoute.id) || items[0] || null;
};

const captureScoreDraft = (candidate) => {
  const endorsement = root.querySelector('[data-score="endorsement"]');
  const expertise = root.querySelector('[data-score="expertise"]');
  const teaching = root.querySelector('[data-score="teaching"]');
  const notes = root.querySelector("[data-notes]");
  if (!endorsement && !expertise && !teaching && !notes) return scoreDraftOf(candidate);
  const draft = {
    endorsementScore: endorsement ? endorsement.value : scoreDraftOf(candidate).endorsementScore,
    expertiseScore: expertise ? expertise.value : scoreDraftOf(candidate).expertiseScore,
    teachingScore: teaching ? teaching.value : scoreDraftOf(candidate).teachingScore,
    matchNotes: notes ? notes.value : scoreDraftOf(candidate).matchNotes,
  };
  draftEdits.set(candidate.id, draft);
  return draft;
};

const runWrite = async (action) => {
  try {
    const provider = await getProvider();
    return await action(provider);
  } catch (error) {
    const message = String(error?.message || error);
    showToast(
      message.startsWith("MISSING_") || message.match(/^[A-Z_]+:/)
        ? message.split(": ")[1] || message
        : `写入失败：${message}`,
    );
    return null;
  }
};

const saveScores = async () => {
  const candidate = selectedCandidate();
  if (!candidate) return;
  const draft = captureScoreDraft(candidate);
  const result = await runWrite((provider) =>
    provider.updateCandidate({
      recordId: candidate.recordId || candidate.id,
      fields: buildScoreFields(draft),
      message: `Update scores for ${candidate.name}`,
    }),
  );
  if (!result) return;
  draftEdits.delete(candidate.id);
  await load({ keepRoute: true });
  showToast(writeNotice(result) || "评分已保存。");
};

const decideCandidate = async (decision) => {
  const candidate = selectedCandidate();
  if (!candidate) return;
  const draft = captureScoreDraft(candidate);
  const scoredCandidate = { ...candidate, ...deriveScoredCandidate(draft) };
  let fields;
  try {
    fields = { ...buildScoreFields(draft), ...buildDecisionFields(scoredCandidate, decision, today()) };
  } catch (error) {
    showToast(String(error.message).split(": ")[1] || String(error.message));
    return;
  }
  const result = await runWrite((provider) =>
    provider.updateCandidate({
      recordId: candidate.recordId || candidate.id,
      fields,
      message: `Mark ${candidate.name} ${decision}`,
    }),
  );
  if (!result) return;
  draftEdits.delete(candidate.id);
  await load({ keepRoute: true });
  showToast(writeNotice(result) || `${candidate.name} 已标记为${statusLabel(decision)}。`);
};

const recordWechatAdded = async () => {
  const candidate = selectedCandidate();
  if (!candidate) return;
  const dateInput = root.querySelector("[data-wechat-date]");
  const date = dateInput ? dateInput.value : today();
  let fields;
  try {
    fields = buildWechatAddedFields(candidate, date);
  } catch (error) {
    showToast(String(error.message).split(": ")[1] || String(error.message));
    return;
  }
  const result = await runWrite((provider) =>
    provider.updateCandidate({
      recordId: candidate.recordId || candidate.id,
      fields,
      message: `Record WeChat add for ${candidate.name}`,
    }),
  );
  if (!result) return;
  await load({ keepRoute: true });
  showToast(writeNotice(result) || "微信添加已记录。");
};

const markConnected = async () => {
  const candidate = selectedCandidate();
  if (!candidate) return;
  let fields;
  try {
    fields = buildConnectedFields(candidate, today());
  } catch (error) {
    showToast(String(error.message).split(": ")[1] || String(error.message));
    return;
  }
  const result = await runWrite((provider) =>
    provider.updateCandidate({
      recordId: candidate.recordId || candidate.id,
      fields,
      message: `Mark ${candidate.name} connected`,
    }),
  );
  if (!result) return;
  await load({ keepRoute: true });
  showToast(writeNotice(result) || `${candidate.name} 已标记为已建联。`);
};

const saveCriteria = async () => {
  const input = criteriaInputFrom("[data-criteria]");
  const result = await runWrite((provider) =>
    provider.saveCriteria({
      recordId: desk.criteria.recordId,
      fields: buildCriteriaFields(input, today()),
      message: "Update instructor sourcing criteria",
    }),
  );
  if (!result) return;
  criteriaEdited = false;
  await load({ keepRoute: true });
  showToast(writeNotice(result) || "标准已保存。");
};

const completeOnboarding = async (event) => {
  event.preventDefault();
  const input = criteriaInputFrom();
  const missing = missingCriteriaRequirements(input);
  const error = root.querySelector("[data-onboarding-error]");
  if (missing.length) {
    error.textContent = `请先补全：${missing.join("、")}`;
    error.hidden = false;
    return;
  }
  const button = root.querySelector("[data-complete-onboarding]");
  button.disabled = true;
  const result = await runWrite((provider) =>
    provider.saveCriteria({
      recordId: desk.criteria.recordId,
      fields: buildCriteriaFields(input, today(), { onboardingVersion: appConfig.onboardingVersion }),
      message: `Complete Instructor Sourcing onboarding v${appConfig.onboardingVersion}`,
    }),
  );
  if (!result) {
    button.disabled = false;
    return;
  }
  if (!result.merged && currentState.provider.pendingReview) {
    error.className = "setup-notice";
    error.textContent = "已提交筛选标准，等待当前 Space 审批。审批合并后刷新页面即可进入工作台。";
    error.hidden = false;
    button.textContent = "等待 Space 审批";
    return;
  }
  criteriaEdited = false;
  await load();
  showToast(writeNotice(result) || "筛选标准已保存。");
};

const bindEvents = () => {
  root.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      setMobileSidebarOpen(false);
      setMobileDetailOpen(false);
      navigate({ view: button.dataset.view, id: null });
    }),
  );
  root.querySelectorAll("[data-select-id]").forEach((button) =>
    button.addEventListener("click", () => {
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigate({ view: contentRoute.view, id: button.dataset.selectId });
    }),
  );
  root.querySelector("[data-sidebar-toggle]")?.addEventListener("click", () => {
    if (isMobileLayout()) setMobileSidebarOpen(false);
    else {
      sidebarCollapsed = !sidebarCollapsed;
      renderApp();
    }
  });
  root.querySelector("[data-mobile-sidebar]")?.addEventListener("click", () => setMobileSidebarOpen(true));
  root.querySelector("#sidebarScrim")?.addEventListener("click", () => setMobileSidebarOpen(false));
  root.querySelector("[data-back-to-list]")?.addEventListener("click", () => {
    setMobileDetailOpen(false);
    navigate({ view: contentRoute.view, id: null }, { replace: true });
  });
  root.querySelectorAll("[data-open-help]").forEach((button) =>
    button.addEventListener("click", () => {
      lastContentHash = routeHash(contentRoute);
      window.location.hash = "#/settings/commands";
    }),
  );
  root.querySelector("[data-close-help]")?.addEventListener("click", () => {
    window.location.hash = lastContentHash;
  });
  root.querySelector("#helpModal")?.addEventListener("click", (event) => {
    if (event.target.id === "helpModal") window.location.hash = lastContentHash;
  });
  root.querySelectorAll("[data-help-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      window.location.hash = `#/settings/${button.dataset.helpTab}`;
    }),
  );
  root.querySelector("[data-refresh]")?.addEventListener("click", async () => {
    if (currentState.provider.name === "demo") showToast("演示数据为固定快照。");
    else await load({ keepRoute: true });
  });
  root.querySelector("[data-copy-command]")?.addEventListener("click", async (event) => {
    const command = event.currentTarget.dataset.copyCommand;
    try {
      await navigator.clipboard.writeText(command);
      showToast(`已复制：${command}`);
    } catch {
      showToast(`回到对话框运行：${command}`);
    }
  });
  root.querySelector("[data-save-scores]")?.addEventListener("click", saveScores);
  root
    .querySelectorAll("[data-decide]")
    .forEach((button) => button.addEventListener("click", () => decideCandidate(button.dataset.decide)));
  root.querySelector("[data-record-wechat]")?.addEventListener("click", recordWechatAdded);
  root.querySelector("[data-mark-connected]")?.addEventListener("click", markConnected);
  root.querySelector("[data-save-criteria]")?.addEventListener("click", saveCriteria);
  root.querySelectorAll("[data-score], [data-notes]").forEach((element) =>
    element.addEventListener("input", () => {
      const candidate = selectedCandidate();
      if (candidate) captureScoreDraft(candidate);
    }),
  );
  root.querySelectorAll("[data-criteria]").forEach((element) =>
    element.addEventListener("input", () => {
      criteriaEdited = true;
    }),
  );
};

const applyRoute = () => {
  const route = parseHash();
  if (route.view === "settings") helpTab = route.tab;
  else {
    contentRoute = route;
    lastContentHash = routeHash(route);
    if (isMobileLayout()) setMobileDetailOpen(Boolean(route.id));
  }
  if (currentState) renderApp();
};

const load = async ({ keepRoute = false } = {}) => {
  if (!keepRoute) root.innerHTML = '<div class="boot-state">正在读取候选讲师工作台...</div>';
  try {
    const demo = new URLSearchParams(window.location.search).get("demo") === "1";
    // `runtime.js` resolves its top-level await before any importer's module
    // body runs, so this is synchronous here. The local `/auth/*` gateway
    // exists only in a standalone run, so consult it only there — and decide
    // that from the runtime Busabase injected, never from the URL.
    const standaloneLocalRuntime = shouldUseLocalGateway();
    if (!demo && standaloneLocalRuntime) {
      authStatus = await fetch("/auth/status", { headers: { accept: "application/json" } }).then((response) =>
        response.json(),
      );
      if (!authStatus.connected) {
        renderConnectSetup(authStatus);
        return;
      }
      if (authStatus.requiresSpace) {
        renderSpaceSetup(authStatus);
        return;
      }
    }
    const provider = await getProvider();
    currentState = await provider.getReadinessState();
    desk = createInstructorSourcingDesk(currentState.records);
    if (
      currentState.provider.name !== "demo" &&
      (desk.criteria.onboardingVersion < appConfig.onboardingVersion || !desk.criteria.ready)
    ) {
      renderOnboarding();
      return;
    }
    currentState = await provider.getState();
    desk = createInstructorSourcingDesk(currentState.records);
    if (!window.location.hash) window.history.replaceState(null, "", "#/all");
    applyRoute();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) console.info("Busabase workspace setup is not complete");
    else console.error("Provider failed", error);
    renderSetup(error);
  }
};

window.addEventListener("hashchange", applyRoute);
window.addEventListener("resize", () => {
  if (!isMobileLayout()) {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && parseHash().view === "settings") window.location.hash = lastContentHash;
  if (event.key === "Escape") setMobileSidebarOpen(false);
});
// Keep the queue fresh without ever clobbering a score the operator is typing.
window.setInterval(() => {
  if (!currentState || currentState.provider.name === "demo") return;
  if (isEditing() || criteriaEdited || draftEdits.size) return;
  load({ keepRoute: true });
}, 60_000);

load();
