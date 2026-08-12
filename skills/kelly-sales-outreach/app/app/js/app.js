import { appConfig } from "./config.js?v=0.3.0";
import { getProvider } from "./providers/index.js?v=0.3.0";
import { initRuntime, shouldUseLocalGateway } from "./runtime.js?v=0.3.0";
import {
  buildApprovalFields,
  buildProfileFields,
  confidenceLabel,
  createSalesOutreachDesk,
  evidenceAgeDays,
  evidenceLabel,
  missingProfileRequirements,
  nextStep,
  statusLabel,
} from "./sales-outreach-model.js?v=0.3.0";

const root = document.querySelector("#app");

const viewMeta = {
  profile: { label: "产品与 ICP", noun: "", eyebrow: "OFFER", list: false },
  all: { label: "全部客户", noun: "家公司", eyebrow: "PROSPECTS", list: true },
  "to-send": { label: "待审核", noun: "家待审", eyebrow: "REVIEW", list: true },
  sent: { label: "已触达", noun: "家已触达", eyebrow: "OUTREACH", list: true },
};

let currentState;
let desk;
let contentRoute = { view: "to-send", id: null };
let lastContentHash = "#/to-send";
let sidebarCollapsed = false;
let helpTab = "commands";
let authStatus = null;
// Unsaved edits survive re-renders and the refresh timer, keyed by company id.
const draftEdits = new Map();
let profileEdited = false;

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
    view: viewMeta[parts[0]] ? parts[0] : "to-send",
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

const draftOf = (company) => ({
  subject: draftEdits.get(company.id)?.subject ?? company.emailSubject,
  body: draftEdits.get(company.id)?.body ?? company.emailBody,
  email: draftEdits.get(company.id)?.email ?? company.bestLead?.email ?? "",
});

const itemsForView = (view) => desk.buckets[view] || [];

const scoreClass = (score) => (score >= 85 ? "high" : score >= 70 ? "mid" : "low");

const statusPill = (company) =>
  `<span class="status-pill status-${company.status}">${statusLabel(company.status)}</span>`;

// Fresh evidence matters because company priorities and contact ownership move.
const freshness = (company) => {
  const days = evidenceAgeDays(company.evidenceDate);
  if (days === null) return company.evidenceDate ? "" : "未记日期";
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return `${days} 天前`;
};

const evidencePill = (company) => {
  const stale = evidenceAgeDays(company.evidenceDate);
  const level = !company.evidenceType ? "unknown" : stale !== null && stale > 30 ? "stale" : company.evidenceType;
  const age = freshness(company);
  return `<span class="evidence-pill evidence-${level}">${evidenceLabel(company.evidenceType)}${age ? ` · ${age}` : ""}</span>`;
};

const renderCompanyRow = (company, active) => {
  const contact = company.bestLead ? `${escapeHtml(company.bestLead.email)}` : '<em class="row-warn">未找到邮箱</em>';
  const trailing =
    company.status === "sent"
      ? `已触达 ${escapeHtml(company.sentAt || "--")}`
      : company.status === "queued"
        ? `已批准 ${escapeHtml(company.approvedAt || "--")} · 等待发出`
        : contact;
  return `<button class="work-row company-row ${active ? "active" : ""}" type="button" data-select-id="${escapeHtml(company.id)}">
    <span class="row-marker" aria-hidden="true"></span>
    <span class="row-rank">${escapeHtml(company.ref)}</span>
    <span class="row-main">
      <span class="row-kicker">${escapeHtml(company.industry)} · ${statusLabel(company.status)}</span>
      <span class="row-evidence">${evidencePill(company)}</span>
      <span class="row-title"><strong>${escapeHtml(company.name)}</strong>${company.leads.length > 1 ? `<span class="lead-count">${company.leads.length} 个邮箱</span>` : ""}</span>
      <span class="row-subtitle">${trailing}</span>
    </span>
    <span class="row-score score-${scoreClass(company.matchScore)}"><strong>${company.matchScore}</strong><span>匹配度</span></span>
  </button>`;
};

const renderRows = (items, selectedId) => {
  if (!items.length) {
    return `<div class="empty-state"><p>这里还没有目标客户。</p><p class="empty-hint">运行研究命令，Agent 会推导 ICP 并把公司、业务信号和公开联系方式写回这里。</p>${commandChip("/kelly-sales-outreach research")}</div>`;
  }
  return items.map((item) => renderCompanyRow(item, item.id === selectedId)).join("");
};

const renderLeadOptions = (company, selectedEmail) => {
  if (!company.leads.length) {
    return '<select class="lead-select" data-lead disabled><option>未找到邮箱</option></select>';
  }
  return `<select class="lead-select" data-lead>${company.leads
    .map(
      (lead) =>
        `<option value="${escapeHtml(lead.email)}" ${lead.email === selectedEmail ? "selected" : ""}>${escapeHtml(lead.email)} · ${escapeHtml(lead.role)} · 置信度${confidenceLabel(lead.confidence)}</option>`,
    )
    .join("")}</select>`;
};

const renderTextField = (attribute, key, label, value, hint = "") =>
  `<label class="field"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input type="text" ${attribute}="${key}" value="${escapeHtml(value)}" /></label>`;

const renderCompanyDetail = (company) => {
  const draft = draftOf(company);
  const editable = company.status === "draft";
  const attachment = desk.profile.collateralFile || "无附件";
  const sourceLine = company.sourceUrl
    ? `<a class="text-link" href="${escapeHtml(company.sourceUrl)}" target="_blank" rel="noreferrer noopener">来源页面</a>`
    : "来源未记录";
  return `<div class="detail-scroll">
    <button class="back-to-list" type="button" data-back-to-list>&larr; 返回${viewMeta[contentRoute.view].label}</button>
    <div class="detail-heading">
      <div><p class="eyebrow">${escapeHtml(company.ref)} · ${escapeHtml(company.industry)}</p><h2>${escapeHtml(company.name)}</h2></div>
      ${statusPill(company)}
    </div>
    <div class="detail-facts">
      <div class="detail-fact"><span>ICP 匹配度</span><strong class="score-${scoreClass(company.matchScore)}">${company.matchScore}</strong></div>
      <div class="detail-fact"><span>官网</span><strong>${escapeHtml(company.website || "--")}</strong></div>
      <div class="detail-fact"><span>线索来源</span><strong>${sourceLine}</strong></div>
      <div class="detail-fact"><span>证据</span><strong>${evidencePill(company)}</strong></div>
    </div>
    ${
      editable
        ? `<section class="detail-section compose">
      <label class="field"><span>收件人${company.leads.length > 1 ? `（共 ${company.leads.length} 个候选邮箱）` : ""}</span>${renderLeadOptions(company, draft.email)}</label>
      <label class="field"><span>主题</span><input type="text" data-subject value="${escapeHtml(draft.subject)}" /></label>
      <label class="field"><span>正文</span><textarea data-body rows="8">${escapeHtml(draft.body)}</textarea></label>
      <div class="attachment-line"><span>销售资料</span><strong>${escapeHtml(attachment)}</strong></div>
    </section>
    ${
      company.bestLead
        ? ""
        : `<div class="detail-hint warn"><p class="detail-note warn">这家公司还没有可核验的业务邮箱，审批按钮暂时锁定。回到对话框补一次线索：</p>${commandChip("/kelly-sales-outreach research", "补线索，不覆盖已批准和已触达记录")}</div>`
    }
    <div class="detail-actions">
      <button class="primary-button" type="button" data-approve ${company.bestLead ? "" : "disabled"}>批准进入待发队列</button>
      <button class="ghost-button" type="button" data-save-draft>保存草稿</button>
    </div>`
        : `<section class="detail-section">
      <h3>触达记录</h3>
      <dl class="detail-list">
        <div><dt>收件人</dt><dd>${escapeHtml(company.sentTo || "--")}</dd></div>
        <div><dt>批准时间</dt><dd>${escapeHtml(company.approvedAt || "--")}</dd></div>
        <div><dt>发送时间</dt><dd>${escapeHtml(company.sentAt || "尚未发送")}</dd></div>
      </dl>
      ${
        company.status === "queued"
          ? `<div class="detail-hint"><p class="detail-note">你已经批准了，但信还没发——真正发信的是可信脚本，它拿得到授权码，这个页面拿不到。回到命令行：</p>${commandChip("node scripts/send_emails.mjs", "先预演看清单，确认后再加 --apply")}</div>`
          : ""
      }
    </section>
    <section class="detail-section"><h3>邮件主题</h3><p class="detail-copy">${escapeHtml(company.emailSubject)}</p></section>
    <section class="detail-section"><h3>邮件正文</h3><pre class="mail-body">${escapeHtml(company.emailBody)}</pre></section>`
    }
    <section class="detail-section"><h3>ICP 匹配理由</h3><p class="detail-copy">${escapeHtml(company.matchReason)}</p></section>
    <section class="detail-section"><h3>业务信号</h3><p class="detail-copy">${escapeHtml(company.painSignals)}</p></section>
    ${
      company.leads.length
        ? `<section class="detail-section"><h3>联系人池</h3><div class="lead-table">${company.leads
            .map(
              (lead) =>
                `<div class="lead-row"><span><strong>${escapeHtml(lead.email)}</strong><small>${escapeHtml([lead.contactName, lead.role].filter(Boolean).join(" · "))}</small></span><span class="confidence confidence-${lead.confidence}">${confidenceLabel(lead.confidence)}</span></div>`,
            )
            .join("")}</div></section>`
        : ""
    }
  </div>`;
};

const renderProfile = () => {
  const profile = desk.profile;
  return `<div class="profile-pane"><div class="detail-scroll">
    <div class="detail-heading"><div><p class="eyebrow">OFFER & ICP</p><h2>产品与目标客户</h2></div>${profile.ready ? '<span class="status-pill status-sent">可开始研究</span>' : `<span class="status-pill status-draft">缺 ${profile.missing.length} 项</span>`}</div>
    <p class="detail-note">只要先说明你卖什么。Agent 会从产品价值、案例和市场信号中推导理想客户画像，再持续扩展客户池。</p>
    <div class="detail-hint">${commandChip("/kelly-sales-outreach profile", "读取官网、产品说明或服务介绍，整理产品定位并提出 ICP")}</div>
    ${profile.ready ? "" : `<div class="setup-notice">还缺：${escapeHtml(profile.missing.join("、"))}</div>`}
    <section class="detail-section compose">
      ${renderTextField("data-profile", "sellerName", "你的名字或品牌", profile.sellerName)}
      ${renderTextField("data-profile", "offerName", "产品或服务名称", profile.offerName, "必填")}
      <label class="field"><span>产品或服务说明<small>必填：解决什么问题、怎么交付</small></span><textarea data-profile="offerSummary" rows="5">${escapeHtml(profile.offerSummary)}</textarea></label>
      <label class="field"><span>价值主张<small>客户为什么现在要行动</small></span><textarea data-profile="valueProposition" rows="4">${escapeHtml(profile.valueProposition)}</textarea></label>
      <label class="field"><span>案例与证据<small>客户结果、数据、资质或可验证案例</small></span><textarea data-profile="proofPoints" rows="4">${escapeHtml(profile.proofPoints)}</textarea></label>
      ${renderTextField("data-profile", "targetIndustries", "目标行业", profile.targetIndustries, "可留空，由 Agent 推导")}
      ${renderTextField("data-profile", "targetRegions", "目标地区", profile.targetRegions)}
      ${renderTextField("data-profile", "buyerRoles", "决策角色", profile.buyerRoles, "例如：创始人、销售负责人、IT 总监")}
      <label class="field"><span>理想客户画像<small>规模、阶段、痛点与购买信号</small></span><textarea data-profile="idealCustomer" rows="5">${escapeHtml(profile.idealCustomer)}</textarea></label>
      ${renderTextField("data-profile", "researchChannels", "研究渠道", profile.researchChannels, "官网、行业目录、新闻、展会名录等")}
      ${renderTextField("data-profile", "collateralFile", "销售资料附件", profile.collateralFile, "可选，放在 skill 的 collateral/ 目录")}
      ${renderTextField("data-profile", "fromEmail", "发件邮箱", profile.fromEmail, "发送脚本用这个邮箱发出")}
      <div class="attachment-line"><span>SMTP 凭据</span><strong>${
        profile.mailReady ? `已配置 · 存在 Vault（${escapeHtml(profile.smtpVaultKey)}）` : "未配置"
      }</strong></div>
    </section>
    ${profile.mailReady ? "" : `<div class="detail-hint">${commandChip("/kelly-sales-outreach send", "配置发件邮箱，授权码写进 Vault")}</div>`}
    <p class="detail-note">授权码只存在 Busabase Vault 里，这个页面既读不到也不显示它。</p>
    <div class="detail-actions">
      <button class="primary-button" type="button" data-save-profile>保存资料</button>
      <button class="ghost-button" type="button" data-view="to-send">去看待审核</button>
    </div>
  </div></div>`;
};

const renderPipeline = () => {
  const steps = [
    ["profile", "录产品", desk.profile.ready ? "可研究" : `缺 ${desk.profile.missing.length} 项`, desk.profile.ready],
    ["all", "找客户", `${desk.counts.all} 家已入库`, desk.counts.all > 0],
    ["sent", "做触达", `${desk.counts.sent} 家已触达`, desk.counts.sent > 0],
  ];
  return `<section class="workflow-band"><div class="pipeline" aria-label="销售拓客流程">
    ${steps
      .map(
        ([view, label, meta, done], index) =>
          `<button class="pipeline-step ${contentRoute.view === view ? "active" : ""} ${done ? "done" : ""}" type="button" data-view="${view}"><i aria-hidden="true">${index + 1}</i><span><strong>${label}</strong><small>${escapeHtml(meta)}</small></span>${index < 2 ? '<b aria-hidden="true">›</b>' : ""}</button>`,
      )
      .join("")}
  </div></section>`;
};

// Every command this desk names is rendered through one component: the operator
// should never have to retype something the screen just told them to run, and a
// command that appears as plain prose is a command that gets mistyped.
const commandChip = (command, note = "") =>
  `<button class="command-chip" type="button" data-copy-command="${escapeHtml(command)}" title="点一下复制">
    <code>${escapeHtml(command)}</code>${note ? `<small>${escapeHtml(note)}</small>` : ""}
  </button>`;

// Everything this desk cannot do itself happens back in the conversation, so
// the command to run next is part of the UI, not something to look up.
const renderNextStep = () => {
  const step = nextStep(desk);
  if (!step) return "";
  return `<section class="next-step" aria-label="下一步">
    <div class="next-step-title">${escapeHtml(step.title)}</div>
    <div class="next-step-detail">${escapeHtml(step.detail)}</div>
    ${step.command ? commandChip(step.command) : ""}
  </section>`;
};

// The sidebar is an off-canvas drawer at phone widths, so a phone operator would
// otherwise never see which command comes next.
const renderMobileNextStep = () => {
  const step = nextStep(desk);
  if (!step?.command) return "";
  return `<div class="mobile-next-step"><span>${escapeHtml(step.title)}</span>${commandChip(step.command)}</div>`;
};

const renderSidebar = () => {
  const attention = desk.attention;
  const primary = attention.profileReady
    ? `<button class="human-work-primary" type="button" data-view="to-send"><span><strong>${attention.toSend}</strong><span>待你审核首触达</span></span></button>`
    : `<button class="human-work-primary warn" type="button" data-view="profile"><span><strong>${attention.profileMissing.length}</strong><span>请先录入产品</span></span></button>`;
  return `<aside class="sidebar ${sidebarCollapsed ? "collapsed" : ""}" id="appSidebar">
    <div class="brand"><div class="brand-icon" aria-hidden="true">KS</div><div class="brand-copy"><div class="brand-title">Kelly 销售拓客</div><div class="brand-subtitle">目标客户工作台</div></div><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="appSidebar" aria-expanded="${!sidebarCollapsed}" aria-label="切换侧栏" title="切换侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button></div>
    <section class="human-work" aria-labelledby="humanWorkTitle"><div class="human-work-eyebrow">需要你</div><div id="humanWorkTitle" class="human-work-title">今天的拓客</div>${primary}<div class="human-work-secondary"><button type="button" data-view="all" title="缺业务邮箱或草稿，需要 Agent 补线索"><strong>${attention.blocked}</strong><span>被阻塞</span></button><button type="button" data-view="sent" title="已完成首触达"><strong>${desk.counts.sent}</strong><span>已触达</span></button></div></section>
    ${renderNextStep()}
    <div class="sidebar-separator"></div>
    <nav class="filters" aria-label="工作流导航">${Object.entries(viewMeta)
      .map(
        ([key, meta]) =>
          `<button class="${contentRoute.view === key ? "active" : ""}" type="button" data-view="${key}" title="打开${meta.label}"><span>${meta.label}</span><span>${key === "profile" ? (desk.profile.ready ? "✓" : "!") : desk.counts[key]}</span></button>`,
      )
      .join("")}</nav>
    <div class="help-box"><div class="virtual-only"><span></span>发送由可信脚本执行</div><button class="help-button" type="button" data-open-help>帮助与设置</button></div>
  </aside>`;
};

const renderHelp =
  () => `<div class="modal-backdrop" id="helpModal" aria-hidden="false"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
  <div class="modal-head"><div><div id="helpTitle" class="modal-title">帮助与设置</div><div class="modal-subtitle">Kelly 销售拓客 · 目标客户工作台</div></div><button class="icon-button" type="button" data-close-help aria-label="关闭帮助">关闭</button></div>
  <nav class="modal-tabs" aria-label="帮助与设置标签"><button class="${helpTab === "commands" ? "active" : ""}" type="button" data-help-tab="commands">命令</button><button class="${helpTab === "guide" ? "active" : ""}" type="button" data-help-tab="guide">指南</button><button class="${helpTab === "resources" ? "active" : ""}" type="button" data-help-tab="resources">资源</button><button class="${helpTab === "connection" ? "active" : ""}" type="button" data-help-tab="connection">连接</button></nav>
  <div class="modal-body">
    <section class="help-tab-panel ${helpTab === "commands" ? "active" : ""}"><h2>回到对话框能做什么</h2>
      <p class="detail-note">这个页面负责让你看清楚和拍板。搜集、起草、发送这些活在对话框那边，点一下命令即可复制。</p>
      <div class="command-list">
        ${commandChip("/kelly-sales-outreach profile", "读取产品或服务资料，整理价值主张并提出 ICP")}
        ${commandChip("/kelly-sales-outreach research", "从公开来源找目标客户、业务信号和联系人，每家写一封定制首触达")}
        ${commandChip("/kelly-sales-outreach send", "配置发件邮箱，授权码写进 Vault，不进这个页面")}
        ${commandChip("node scripts/send_emails.mjs", "把你批准的信发出去，默认预演，加 --apply 才真发")}
      </div>
      <p class="detail-note">全部命令默认都是预演：先打印它要做什么，你看过再加 <code>--apply</code>。</p>
    </section>
    <section class="help-tab-panel ${helpTab === "guide" ? "active" : ""}"><h2>三步走</h2><dl class="settings-list">
      <div><dt>1 录产品</dt><dd>先写产品或服务名称和说明。价值主张、案例与目标市场越具体，ICP 越准确。</dd></div>
      <div><dt>2 找客户</dt><dd>Agent 从官网、公开目录、新闻与市场信号持续找公司和业务联系人，并记录每条来源。</dd></div>
      <div><dt>3 做触达</dt><dd>逐条审阅证据、收件人和正文，批准后进入待发队列。一家公司只发一封首触达。</dd></div>
      <div><dt>谁在发</dt><dd>浏览器只记录批准动作。真正的 SMTP 发送由 skill 的可信脚本执行，授权码不会进入页面。</dd></div>
    </dl></section>
    <section class="help-tab-panel ${helpTab === "resources" ? "active" : ""}"><h2>Busabase 资源</h2><dl class="settings-list">
      <div><dt>应用根节点</dt><dd><code>${escapeHtml(appConfig.folder.slug)}</code></dd></div>
      <div><dt>结构化数据</dt><dd>${appConfig.bases.map((base) => escapeHtml(base.name)).join("、")}</dd></div>
      <div><dt>销售资料</dt><dd>可选附件放在 skill 的 <code>collateral/</code> 目录，产品与 ICP Base 只记录文件名。</dd></div>
      <div><dt>秘密数据</dt><dd>SMTP 授权码存 Vault，只有发送脚本读取；页面永远看不到值。</dd></div>
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
    ? `<section class="content"><div class="list-panel"><div class="list-head"><div><strong>${meta.label}</strong><span>${items.length} ${meta.noun}</span></div><span>按证据 · ICP 匹配度排序</span></div><div class="work-list">${renderRows(items, selected?.id)}</div></div><aside class="detail-panel">${selected ? renderCompanyDetail(selected) : '<div class="empty-detail">从左侧选择一家目标客户</div>'}</aside></section>`
    : `<section class="content content-single">${renderProfile()}</section>`;
  root.innerHTML = `<div class="app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}">${renderSidebar()}<main class="main">
    <div class="mobile-topbar"><button class="mobile-sidebar-toggle" type="button" data-mobile-sidebar aria-controls="appSidebar" aria-label="打开侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button><div class="mobile-topbar-copy"><div class="mobile-view-title">${meta.label}</div><div class="mobile-view-meta">${meta.list ? `${items.length} ${meta.noun}` : desk.profile.ready ? "已就绪" : `缺 ${desk.profile.missing.length} 项`}</div></div><button class="mobile-help-button" type="button" data-open-help aria-label="帮助与设置">帮助</button></div>
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
    ? `<p>将在当前 Space 的应用 Folder 下创建 ${escapeHtml(resources)} 三个 Base。</p><p class="detail-note">结构通过一个 Busabase ChangeRequest 幂等提交；旧版资源不会被删除或继续读取。</p>`
    : `<p>${escapeHtml(reason)}</p><p class="detail-note">应用不会要求你手工创建 Node/Base 或复制 ID，也不会切换到本地数据。</p>`;
  const selectedSpace = authStatus?.space
    ? `${authStatus.space.name || "Space"} · ${authStatus.space.id}`
    : "当前 Space";
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal" role="dialog" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KS</div><div><p class="eyebrow">WORKSPACE SETUP</p><h1 id="setupTitle">${title}</h1></div></div><div class="setup-body"><p><strong>${escapeHtml(authStatus?.baseUrl || "Busabase")}</strong> 鉴权已就绪。</p><p class="setup-context">Space：${escapeHtml(selectedSpace)}</p>${body}<div class="setup-notice" data-setup-status hidden></div></div>${canProvision ? `<div class="setup-next">初始化完成后，运行 ${commandChip("/kelly-sales-outreach profile", "把产品官网、介绍或服务方案交给 Agent")} 开始。</div>` : ""}<div class="setup-footer setup-footer-split">${canProvision ? '<button class="connect-button" type="button" data-provision>初始化工作区</button>' : retryOnly ? '<button class="connect-button" type="button" data-retry-setup>重新检查</button>' : ""}<a class="text-link" href="?demo=1#/to-send">进入演示数据</a></div></section></div>`;
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

const profileInputFrom = (selector = "[data-onboarding]") => {
  const input = {};
  root.querySelectorAll(selector).forEach((element) => {
    input[element.dataset.onboarding || element.dataset.profile] = element.value;
  });
  return input;
};

const renderOnboarding = () => {
  const profile = desk.profile;
  const onboardingField = (key, label, value, hint = "") => renderTextField("data-onboarding", key, label, value, hint);
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal onboarding-modal" role="dialog" aria-labelledby="onboardingTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KS</div><div><p class="eyebrow">FIRST RUN · ${appConfig.onboardingVersion}</p><h1 id="onboardingTitle">先告诉我你卖什么</h1></div></div><form id="onboardingForm" class="setup-body onboarding-form" data-onboarding-form><p>只需录入产品或服务。Agent 会据此推导目标行业、客户画像和决策角色，未经你审核不会发送任何邮件。</p><div class="onboarding-grid">${onboardingField("sellerName", "你的名字或品牌", profile.sellerName)}${onboardingField("offerName", "产品或服务名称", profile.offerName, "必填，例如：AI 客服质检服务")}</div><label class="field"><span>产品或服务说明<small>必填：解决什么问题、如何交付、客户能获得什么结果</small></span><textarea data-onboarding="offerSummary" rows="6">${escapeHtml(profile.offerSummary)}</textarea></label><label class="field"><span>已有案例或证据<small>可选：客户结果、数据、资质或代表案例</small></span><textarea data-onboarding="proofPoints" rows="4">${escapeHtml(profile.proofPoints)}</textarea></label>${onboardingField("fromEmail", "发件邮箱", profile.fromEmail, "可稍后配置；授权码只存 Vault")}<div class="setup-error" data-onboarding-error role="alert" hidden></div><div class="detail-hint">${commandChip("/kelly-sales-outreach profile", "也可以把官网、产品手册或服务方案交给 Agent 自动整理")}</div></form><div class="setup-footer setup-footer-split"><span class="setup-security">产品资料与完成状态保存在当前 Busabase Space</span><button class="connect-button" type="submit" form="onboardingForm" data-complete-onboarding>保存并进入拓客台</button></div></section></div>`;
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
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal setup-connect" role="dialog" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KS</div><div><p class="eyebrow">KELLY SALES OUTREACH</p><h1 id="setupTitle">选择 Busabase Space</h1></div></div><form id="spaceSelectionForm" class="setup-body space-form" data-space-form><p>已登录 <strong>${escapeHtml(status.baseUrl || "Busabase")}</strong>。请选择产品资料与拓客队列所在的 Space。</p>${unavailable ? `<div class="setup-error" role="alert">${escapeHtml(status.spaceError || "当前账号没有可访问的 Space。")}</div>` : `<label class="space-select"><span>Space</span><select name="space_id" required>${options}</select></label>`}<div class="setup-error" data-space-error hidden></div><p class="setup-security">确认前不会检查、创建或修复任何应用资源。</p></form><div class="setup-footer setup-footer-split"><a class="text-link" href="?demo=1#/to-send">进入演示数据</a><button class="connect-button" type="submit" form="spaceSelectionForm" data-space-submit ${unavailable ? "disabled" : ""}>使用这个 Space</button></div></section></div>`;
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
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal setup-connect" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KS</div><div><p class="eyebrow">KELLY SALES OUTREACH</p><h1 id="setupTitle">连接 Busabase</h1></div></div><form class="setup-body connection-form" method="post" action="/auth/start">${oauthError ? `<div class="setup-error" role="alert">${escapeHtml(oauthError)}</div>` : ""}${status.readiness === "needs_auth" ? '<div class="setup-notice">登录已过期，请重新连接。</div>' : ""}<fieldset class="connection-options"><legend>服务器</legend><label class="connection-option active"><input type="radio" name="server_mode" value="cloud" checked /><span><strong>Busabase Cloud</strong><small>busabase.com</small></span></label><label class="connection-option"><input type="radio" name="server_mode" value="custom" /><span><strong>自定义服务器</strong><small>自托管或企业地址</small></span></label></fieldset><label class="custom-url" hidden><span>Busabase URL</span><input type="url" name="custom_base_url" inputmode="url" placeholder="https://busabase.example.com" autocomplete="url" /></label><input type="hidden" name="base_url" value="${escapeHtml(status.cloudBaseUrl || "https://busabase.com")}" /><button class="connect-button" type="submit">连接 Busabase</button></form><div class="setup-footer setup-footer-split"><span class="setup-security">OAuth 凭证仅保存在本机 ~/.busabase/airapps</span><a class="text-link" href="?demo=1#/to-send">进入演示数据</a></div></section></div>`;
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
  if (result?.demo) return "演示模式：没有写入 Busabase，也没有真的发出邮件。";
  if (currentState.provider.pendingReview) return "已提交 ChangeRequest，等待 Space 审核后生效。";
  return "";
};

const selectedCompany = () => {
  const items = itemsForView(contentRoute.view);
  return items.find((item) => item.id === contentRoute.id) || items[0] || null;
};

const captureDraft = (company) => {
  const subject = root.querySelector("[data-subject]");
  const body = root.querySelector("[data-body]");
  const lead = root.querySelector("[data-lead]");
  if (!subject && !body && !lead) return draftOf(company);
  const draft = {
    subject: subject ? subject.value : draftOf(company).subject,
    body: body ? body.value : draftOf(company).body,
    email: lead && !lead.disabled ? lead.value : draftOf(company).email,
  };
  draftEdits.set(company.id, draft);
  return draft;
};

const runWrite = async (action) => {
  try {
    const provider = await getProvider();
    return await action(provider);
  } catch (error) {
    const message = String(error?.message || error);
    showToast(message.startsWith("MISSING_") ? message.split(": ")[1] : `写入失败：${message}`);
    return null;
  }
};

const approveCompany = async () => {
  const company = selectedCompany();
  if (!company) return;
  const draft = captureDraft(company);
  let fields;
  try {
    fields = {
      "email-subject": draft.subject,
      "email-body": draft.body,
      ...buildApprovalFields({ ...company, emailSubject: draft.subject, emailBody: draft.body }, draft.email, today()),
    };
  } catch (error) {
    showToast(String(error.message).split(": ")[1] || String(error.message));
    return;
  }
  const result = await runWrite((provider) =>
    provider.updateCompany({
      recordId: company.recordId || company.id,
      fields,
      message: `Approve first-touch outreach to ${company.name} at ${draft.email}`,
    }),
  );
  if (!result) return;
  draftEdits.delete(company.id);
  await load({ keepRoute: true });
  // load() replaces the whole shell, toast element included, so confirm after
  // the re-render rather than before it.
  showToast(writeNotice(result) || `已批准 ${company.name} 的首触达，运行发送脚本才会真正发出。`);
};

const saveDraft = async () => {
  const company = selectedCompany();
  if (!company) return;
  const draft = captureDraft(company);
  const result = await runWrite((provider) =>
    provider.updateCompany({
      recordId: company.recordId || company.id,
      fields: { "email-subject": draft.subject, "email-body": draft.body },
      message: `Update outreach draft for ${company.name}`,
    }),
  );
  if (!result) return;
  draftEdits.delete(company.id);
  await load({ keepRoute: true });
  showToast(writeNotice(result) || "草稿已保存。");
};

const saveProfile = async () => {
  const input = profileInputFrom("[data-profile]");
  const result = await runWrite((provider) =>
    provider.saveProfile({
      recordId: desk.profile.recordId,
      fields: buildProfileFields(input, today()),
      message: `Update sales offer and ICP for ${input.offerName || "sales outreach"}`,
    }),
  );
  if (!result) return;
  profileEdited = false;
  await load({ keepRoute: true });
  showToast(writeNotice(result) || "资料已保存。");
};

const completeOnboarding = async (event) => {
  event.preventDefault();
  const input = profileInputFrom();
  const missing = missingProfileRequirements(input);
  const error = root.querySelector("[data-onboarding-error]");
  if (missing.length) {
    error.textContent = `请先补全：${missing.join("、")}`;
    error.hidden = false;
    return;
  }
  const button = root.querySelector("[data-complete-onboarding]");
  button.disabled = true;
  const result = await runWrite((provider) =>
    provider.saveProfile({
      recordId: desk.profile.recordId,
      fields: buildProfileFields(input, today(), { onboardingVersion: appConfig.onboardingVersion }),
      message: `Complete Sales Outreach onboarding v${appConfig.onboardingVersion} for ${input.offerName}`,
    }),
  );
  if (!result) {
    button.disabled = false;
    return;
  }
  if (!result.merged && currentState.provider.pendingReview) {
    error.className = "setup-notice";
    error.textContent = "已提交产品资料，等待当前 Space 审批。审批合并后刷新页面即可进入拓客台。";
    error.hidden = false;
    button.textContent = "等待 Space 审批";
    return;
  }
  profileEdited = false;
  await load();
  showToast(writeNotice(result) || "产品资料已保存。");
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
    if (currentState.provider.name === "demo") showToast("演示数据为 2026-08-11 固定快照。");
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
  root.querySelector("[data-approve]")?.addEventListener("click", approveCompany);
  root.querySelector("[data-save-draft]")?.addEventListener("click", saveDraft);
  root.querySelector("[data-save-profile]")?.addEventListener("click", saveProfile);
  root.querySelectorAll("[data-subject], [data-body], [data-lead]").forEach((element) =>
    element.addEventListener("input", () => {
      const company = selectedCompany();
      if (company) captureDraft(company);
    }),
  );
  root.querySelectorAll("[data-profile]").forEach((element) =>
    element.addEventListener("input", () => {
      profileEdited = true;
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
  if (!keepRoute) root.innerHTML = '<div class="boot-state">正在读取拓客台...</div>';
  try {
    const demo = new URLSearchParams(window.location.search).get("demo") === "1";
    // Resolved before anything asks where it runs. The local `/auth/*` gateway
    // exists only in a standalone run, so consult it only there — and decide
    // that from the runtime Busabase injected, never from the URL.
    const standaloneLocalRuntime = shouldUseLocalGateway(await initRuntime());
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
    desk = createSalesOutreachDesk(currentState.records);
    if (
      currentState.provider.name !== "demo" &&
      (desk.profile.onboardingVersion < appConfig.onboardingVersion || !desk.profile.ready)
    ) {
      renderOnboarding();
      return;
    }
    currentState = await provider.getState();
    desk = createSalesOutreachDesk(currentState.records);
    if (!window.location.hash) window.history.replaceState(null, "", "#/to-send");
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
// Keep the queue fresh without ever clobbering an email the operator is typing.
window.setInterval(() => {
  if (!currentState || currentState.provider.name === "demo") return;
  if (isEditing() || profileEdited || draftEdits.size) return;
  load({ keepRoute: true });
}, 60_000);

load();
