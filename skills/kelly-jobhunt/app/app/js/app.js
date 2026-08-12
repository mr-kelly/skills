import { appConfig } from "./config.js?v=0.3.0";
import {
  buildApprovalFields,
  buildProfileFields,
  confidenceLabel,
  createJobhuntDesk,
  evidenceAgeDays,
  evidenceLabel,
  missingProfileRequirements,
  nextStep,
  statusLabel,
} from "./jobhunt-model.js?v=0.3.0";
import { getProvider } from "./providers/index.js?v=0.3.0";
import { initRuntime, shouldUseLocalGateway } from "./runtime.js?v=0.3.0";

const root = document.querySelector("#app");

const viewMeta = {
  profile: { label: "我的资料", noun: "", eyebrow: "PROFILE", list: false },
  all: { label: "全部", noun: "家公司", eyebrow: "OUTREACH", list: true },
  "to-send": { label: "待发送", noun: "家待发", eyebrow: "OUTREACH", list: true },
  sent: { label: "已发送", noun: "家已发", eyebrow: "OUTREACH", list: true },
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

// How old the evidence is, said plainly. An operator deciding whether a role is
// still open needs "37 天前", not a date they have to subtract from today.
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
      ? `已发出 ${escapeHtml(company.sentAt || "--")}`
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
    return `<div class="empty-state"><p>这里还没有公司。</p><p class="empty-hint">回到对话框运行下面这条，它会把公司和联系邮箱写回这个列表。</p>${commandChip("/kelly-jobhunt research")}</div>`;
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
  const attachment = desk.profile.resumeFile || "尚未设置简历文件";
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
      <div class="detail-fact"><span>匹配度</span><strong class="score-${scoreClass(company.matchScore)}">${company.matchScore}</strong></div>
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
      <div class="attachment-line"><span>附件</span><strong>${escapeHtml(attachment)}</strong></div>
    </section>
    ${
      company.bestLead
        ? ""
        : `<div class="detail-hint warn"><p class="detail-note warn">这家公司还没有可用邮箱，下面的发送按钮先锁着。回到对话框补一次线索：</p>${commandChip("/kelly-jobhunt research", "补线索，已批准和已发出的公司不会被覆盖")}</div>`
    }
    <div class="detail-actions">
      <button class="primary-button" type="button" data-approve ${company.bestLead ? "" : "disabled"}>批准并发送</button>
      <button class="ghost-button" type="button" data-save-draft>保存草稿</button>
    </div>`
        : `<section class="detail-section">
      <h3>投递记录</h3>
      <dl class="detail-list">
        <div><dt>收件人</dt><dd>${escapeHtml(company.sentTo || "--")}</dd></div>
        <div><dt>批准时间</dt><dd>${escapeHtml(company.approvedAt || "--")}</dd></div>
        <div><dt>发出时间</dt><dd>${escapeHtml(company.sentAt || "尚未发出")}</dd></div>
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
    <section class="detail-section"><h3>匹配理由</h3><p class="detail-copy">${escapeHtml(company.matchReason)}</p></section>
    ${
      company.leads.length
        ? `<section class="detail-section"><h3>邮箱池</h3><div class="lead-table">${company.leads
            .map(
              (lead) =>
                `<div class="lead-row"><span><strong>${escapeHtml(lead.email)}</strong><small>${escapeHtml(lead.role)}</small></span><span class="confidence confidence-${lead.confidence}">${confidenceLabel(lead.confidence)}</span></div>`,
            )
            .join("")}</div></section>`
        : ""
    }
  </div>`;
};

const renderProfile = () => {
  const profile = desk.profile;
  return `<div class="profile-pane"><div class="detail-scroll">
    <div class="detail-heading"><div><p class="eyebrow">PROFILE</p><h2>我的资料</h2></div>${profile.ready ? '<span class="status-pill status-sent">已就绪</span>' : `<span class="status-pill status-draft">缺 ${profile.missing.length} 项</span>`}</div>
    <p class="detail-note">这份资料决定 Agent 搜什么公司、写什么邮件。你可以在这里直接改，也可以把简历丢给 Agent 让它填。</p>
    <div class="detail-hint">${commandChip("/kelly-jobhunt profile", "读你的简历自动填这一屏，并排版出 PDF 简历")}</div>
    ${profile.ready ? "" : `<div class="setup-notice">还缺：${escapeHtml(profile.missing.join("、"))}</div>`}
    <section class="detail-section compose">
      ${renderTextField("data-profile", "name", "求职人", profile.name)}
      ${renderTextField("data-profile", "targetRole", "目标岗位", profile.targetRole, "搜索公司时的主关键词")}
      ${renderTextField("data-profile", "locations", "意向城市", profile.locations)}
      ${renderTextField("data-profile", "industries", "意向行业", profile.industries)}
      <label class="field"><span>自我介绍<small>写实一点，邮件正文会引用它</small></span><textarea data-profile="highlights" rows="5">${escapeHtml(profile.highlights)}</textarea></label>
      ${renderTextField("data-profile", "jobBoards", "招聘渠道", profile.jobBoards, "research 会优先在这些渠道上找线索")}
      ${renderTextField("data-profile", "resumeFile", "简历文件", profile.resumeFile, "由 /kelly-jobhunt profile 排版生成，放在 skill 的 resume/ 目录")}
      ${renderTextField("data-profile", "fromEmail", "发件邮箱", profile.fromEmail, "发送脚本用这个邮箱发出")}
      <div class="attachment-line"><span>SMTP 凭据</span><strong>${
        profile.mailReady ? `已配置 · 存在 Vault（${escapeHtml(profile.smtpVaultKey)}）` : "未配置"
      }</strong></div>
    </section>
    ${profile.mailReady ? "" : `<div class="detail-hint">${commandChip("/kelly-jobhunt send", "配置发件邮箱，授权码写进 Vault")}</div>`}
    <p class="detail-note">授权码只存在 Busabase Vault 里，这个页面既读不到也不显示它。</p>
    <div class="detail-actions">
      <button class="primary-button" type="button" data-save-profile>保存资料</button>
      <button class="ghost-button" type="button" data-view="to-send">去看待发送</button>
    </div>
  </div></div>`;
};

const renderPipeline = () => {
  const steps = [
    ["profile", "填资料", desk.profile.ready ? "已就绪" : `缺 ${desk.profile.missing.length} 项`, desk.profile.ready],
    ["all", "找公司", `${desk.counts.all} 家已入库`, desk.counts.all > 0],
    ["sent", "发邮件", `${desk.counts.sent} 家已发出`, desk.counts.sent > 0],
  ];
  return `<section class="workflow-band"><div class="pipeline" aria-label="投递流程">
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
    ? `<button class="human-work-primary" type="button" data-view="to-send"><span><strong>${attention.toSend}</strong><span>待你确认发送</span></span></button>`
    : `<button class="human-work-primary warn" type="button" data-view="profile"><span><strong>${attention.profileMissing.length}</strong><span>请先补全资料</span></span></button>`;
  return `<aside class="sidebar ${sidebarCollapsed ? "collapsed" : ""}" id="appSidebar">
    <div class="brand"><div class="brand-icon" aria-hidden="true">KJ</div><div class="brand-copy"><div class="brand-title">Kelly 求职直投</div><div class="brand-subtitle">目标公司直投台</div></div><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="appSidebar" aria-expanded="${!sidebarCollapsed}" aria-label="切换侧栏" title="切换侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button></div>
    <section class="human-work" aria-labelledby="humanWorkTitle"><div class="human-work-eyebrow">需要你</div><div id="humanWorkTitle" class="human-work-title">今天的投递</div>${primary}<div class="human-work-secondary"><button type="button" data-view="all" title="缺邮箱，需要 Agent 补线索"><strong>${attention.blocked}</strong><span>缺邮箱</span></button><button type="button" data-view="sent" title="已批准或已发出"><strong>${desk.counts.sent}</strong><span>已发送</span></button></div></section>
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
  <div class="modal-head"><div><div id="helpTitle" class="modal-title">帮助与设置</div><div class="modal-subtitle">Kelly 求职直投 · 目标公司直投台</div></div><button class="icon-button" type="button" data-close-help aria-label="关闭帮助">关闭</button></div>
  <nav class="modal-tabs" aria-label="帮助与设置标签"><button class="${helpTab === "commands" ? "active" : ""}" type="button" data-help-tab="commands">命令</button><button class="${helpTab === "guide" ? "active" : ""}" type="button" data-help-tab="guide">指南</button><button class="${helpTab === "resources" ? "active" : ""}" type="button" data-help-tab="resources">资源</button><button class="${helpTab === "connection" ? "active" : ""}" type="button" data-help-tab="connection">连接</button></nav>
  <div class="modal-body">
    <section class="help-tab-panel ${helpTab === "commands" ? "active" : ""}"><h2>回到对话框能做什么</h2>
      <p class="detail-note">这个页面负责让你看清楚和拍板。搜集、起草、发送这些活在对话框那边，点一下命令即可复制。</p>
      <div class="command-list">
        ${commandChip("/kelly-jobhunt profile", "读你的简历，填好这份档案，并排版出 PDF 简历")}
        ${commandChip("/kelly-jobhunt research", "按你的招聘渠道找公司和邮箱，每家写一封定制信")}
        ${commandChip("/kelly-jobhunt send", "配置发件邮箱，授权码写进 Vault，不进这个页面")}
        ${commandChip("node scripts/send_emails.mjs", "把你批准的信发出去，默认预演，加 --apply 才真发")}
        ${commandChip("node scripts/build_resume.mjs", "只重排简历 PDF，不动其他资料")}
      </div>
      <p class="detail-note">全部命令默认都是预演：先打印它要做什么，你看过再加 <code>--apply</code>。</p>
    </section>
    <section class="help-tab-panel ${helpTab === "guide" ? "active" : ""}"><h2>三步走</h2><dl class="settings-list">
      <div><dt>1 填资料</dt><dd>目标岗位、自我介绍、简历文件名、发件邮箱。四项齐了才算就绪。</dd></div>
      <div><dt>2 找公司</dt><dd>让 Agent 按资料上网搜索，公司与邮箱会写回这里，一家公司可以有多个候选邮箱。</dd></div>
      <div><dt>3 发邮件</dt><dd>逐条审阅主题和正文，点「批准并发送」。一家公司只发一封，避免被判成骚扰。</dd></div>
      <div><dt>谁在发</dt><dd>浏览器只记录批准动作。真正的 SMTP 发送由 skill 的可信脚本执行，授权码不会进入页面。</dd></div>
    </dl></section>
    <section class="help-tab-panel ${helpTab === "resources" ? "active" : ""}"><h2>Busabase 资源</h2><dl class="settings-list">
      <div><dt>应用根节点</dt><dd><code>${escapeHtml(appConfig.folder.slug)}</code></dd></div>
      <div><dt>结构化数据</dt><dd>${appConfig.bases.map((base) => escapeHtml(base.name)).join("、")}</dd></div>
      <div><dt>简历附件</dt><dd>手工放在 skill 的 <code>resume/</code> 目录，档案里只记文件名。</dd></div>
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
    ? `<section class="content"><div class="list-panel"><div class="list-head"><div><strong>${meta.label}</strong><span>${items.length} ${meta.noun}</span></div><span>按证据 · 匹配度排序</span></div><div class="work-list">${renderRows(items, selected?.id)}</div></div><aside class="detail-panel">${selected ? renderCompanyDetail(selected) : '<div class="empty-detail">从左侧选择一家公司</div>'}</aside></section>`
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
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal" role="dialog" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KJ</div><div><p class="eyebrow">WORKSPACE SETUP</p><h1 id="setupTitle">${title}</h1></div></div><div class="setup-body"><p><strong>${escapeHtml(authStatus?.baseUrl || "Busabase")}</strong> 鉴权已就绪。</p><p class="setup-context">Space：${escapeHtml(selectedSpace)}</p>${body}<div class="setup-notice" data-setup-status hidden></div></div>${canProvision ? `<div class="setup-next">初始化完成后，回到对话框运行 ${commandChip("/kelly-jobhunt profile", "把你的简历交给它")} 开始。</div>` : ""}<div class="setup-footer setup-footer-split">${canProvision ? '<button class="connect-button" type="button" data-provision>初始化工作区</button>' : retryOnly ? '<button class="connect-button" type="button" data-retry-setup>重新检查</button>' : ""}<a class="text-link" href="?demo=1#/to-send">进入演示数据</a></div></section></div>`;
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
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal onboarding-modal" role="dialog" aria-labelledby="onboardingTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KJ</div><div><p class="eyebrow">FIRST RUN · ${appConfig.onboardingVersion}</p><h1 id="onboardingTitle">先确定你的求职方向</h1></div></div><form id="onboardingForm" class="setup-body onboarding-form" data-onboarding-form><p>这些信息决定 Agent 搜索哪些公司、如何写第一封联系邮件。完成前不会执行外部动作。</p><div class="onboarding-grid">${onboardingField("name", "怎么称呼你", profile.name)}${onboardingField("targetRole", "目标岗位", profile.targetRole, "必填，例如：B 端产品经理")}${onboardingField("locations", "意向城市", profile.locations)}${onboardingField("industries", "意向行业", profile.industries)}</div><label class="field"><span>自我介绍<small>必填，写下真实经验和可验证成绩</small></span><textarea data-onboarding="highlights" rows="5">${escapeHtml(profile.highlights)}</textarea></label>${onboardingField("jobBoards", "招聘渠道", profile.jobBoards, "例如：BOSS 直聘、公司官网")}${onboardingField("resumeFile", "简历文件", profile.resumeFile, "必填，skill/resume/ 下的文件名")}${onboardingField("fromEmail", "发件邮箱", profile.fromEmail, "必填，只记录地址；授权码另存 Vault")}<div class="setup-error" data-onboarding-error role="alert" hidden></div><div class="detail-hint">${commandChip("/kelly-jobhunt profile", "也可以先把简历交给 Agent，让它帮你整理这些字段")}</div></form><div class="setup-footer setup-footer-split"><span class="setup-security">完成状态保存在当前 Busabase Space · 不使用浏览器存储</span><button class="connect-button" type="submit" form="onboardingForm" data-complete-onboarding>完成并进入投递台</button></div></section></div>`;
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
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal setup-connect" role="dialog" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KJ</div><div><p class="eyebrow">KELLY 求职直投</p><h1 id="setupTitle">选择 Busabase Space</h1></div></div><form id="spaceSelectionForm" class="setup-body space-form" data-space-form><p>已登录 <strong>${escapeHtml(status.baseUrl || "Busabase")}</strong>。请选择求职档案和投递队列所在的 Space。</p>${unavailable ? `<div class="setup-error" role="alert">${escapeHtml(status.spaceError || "当前账号没有可访问的 Space。")}</div>` : `<label class="space-select"><span>Space</span><select name="space_id" required>${options}</select></label>`}<div class="setup-error" data-space-error hidden></div><p class="setup-security">确认前不会检查、创建或修复任何应用资源。</p></form><div class="setup-footer setup-footer-split"><a class="text-link" href="?demo=1#/to-send">进入演示数据</a><button class="connect-button" type="submit" form="spaceSelectionForm" data-space-submit ${unavailable ? "disabled" : ""}>使用这个 Space</button></div></section></div>`;
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
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal setup-connect" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KJ</div><div><p class="eyebrow">KELLY 求职直投</p><h1 id="setupTitle">连接 Busabase</h1></div></div><form class="setup-body connection-form" method="post" action="/auth/start">${oauthError ? `<div class="setup-error" role="alert">${escapeHtml(oauthError)}</div>` : ""}${status.readiness === "needs_auth" ? '<div class="setup-notice">登录已过期，请重新连接。</div>' : ""}<fieldset class="connection-options"><legend>服务器</legend><label class="connection-option active"><input type="radio" name="server_mode" value="cloud" checked /><span><strong>Busabase Cloud</strong><small>busabase.com</small></span></label><label class="connection-option"><input type="radio" name="server_mode" value="custom" /><span><strong>自定义服务器</strong><small>自托管或企业地址</small></span></label></fieldset><label class="custom-url" hidden><span>Busabase URL</span><input type="url" name="custom_base_url" inputmode="url" placeholder="https://busabase.example.com" autocomplete="url" /></label><input type="hidden" name="base_url" value="${escapeHtml(status.cloudBaseUrl || "https://busabase.com")}" /><button class="connect-button" type="submit">连接 Busabase</button></form><div class="setup-footer setup-footer-split"><span class="setup-security">OAuth 凭证仅保存在本机 ~/.busabase/airapps</span><a class="text-link" href="?demo=1#/to-send">进入演示数据</a></div></section></div>`;
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
      message: `Approve outreach to ${company.name} — send resume to ${draft.email}`,
    }),
  );
  if (!result) return;
  draftEdits.delete(company.id);
  await load({ keepRoute: true });
  // load() replaces the whole shell, toast element included, so confirm after
  // the re-render rather than before it.
  showToast(writeNotice(result) || `已批准发送给 ${company.name}，运行发送脚本即可发出。`);
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
      message: `Update job-search profile for ${input.targetRole || "job hunt"}`,
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
      message: `Complete JobHunt onboarding v${appConfig.onboardingVersion} for ${input.targetRole}`,
    }),
  );
  if (!result) {
    button.disabled = false;
    return;
  }
  if (!result.merged && currentState.provider.pendingReview) {
    error.className = "setup-notice";
    error.textContent = "已提交 onboarding 资料，等待当前 Space 审批。审批合并后刷新页面即可进入投递台。";
    error.hidden = false;
    button.textContent = "等待 Space 审批";
    return;
  }
  profileEdited = false;
  await load();
  showToast(writeNotice(result) || "求职方向已保存。");
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
  if (!keepRoute) root.innerHTML = '<div class="boot-state">正在读取投递台...</div>';
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
    desk = createJobhuntDesk(currentState.records);
    if (
      currentState.provider.name !== "demo" &&
      (desk.profile.onboardingVersion < appConfig.onboardingVersion || !desk.profile.ready)
    ) {
      renderOnboarding();
      return;
    }
    currentState = await provider.getState();
    desk = createJobhuntDesk(currentState.records);
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
