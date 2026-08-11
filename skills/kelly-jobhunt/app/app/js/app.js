import { appConfig } from "./config.js?v=0.1.0";
import {
  buildApprovalFields,
  buildProfileFields,
  confidenceLabel,
  createJobhuntDesk,
  statusLabel,
} from "./jobhunt-model.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";

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
let helpTab = "guide";
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
    return { view: "settings", tab: ["guide", "resources", "connection"].includes(parts[1]) ? parts[1] : "guide" };
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
      <span class="row-title"><strong>${escapeHtml(company.name)}</strong>${company.leads.length > 1 ? `<span class="lead-count">${company.leads.length} 个邮箱</span>` : ""}</span>
      <span class="row-subtitle">${trailing}</span>
    </span>
    <span class="row-score score-${scoreClass(company.matchScore)}"><strong>${company.matchScore}</strong><span>匹配度</span></span>
  </button>`;
};

const renderRows = (items, selectedId) => {
  if (!items.length) {
    return '<div class="empty-state">这里还没有公司。让 Agent 运行一次公司搜索，结果会写回这个列表。</div>';
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
    </div>
    ${
      editable
        ? `<section class="detail-section compose">
      <label class="field"><span>收件人${company.leads.length > 1 ? `（共 ${company.leads.length} 个候选邮箱）` : ""}</span>${renderLeadOptions(company, draft.email)}</label>
      <label class="field"><span>主题</span><input type="text" data-subject value="${escapeHtml(draft.subject)}" /></label>
      <label class="field"><span>正文</span><textarea data-body rows="8">${escapeHtml(draft.body)}</textarea></label>
      <div class="attachment-line"><span>附件</span><strong>${escapeHtml(attachment)}</strong></div>
    </section>
    <div class="detail-actions">
      <button class="primary-button" type="button" data-approve ${company.bestLead ? "" : "disabled"}>批准并发送</button>
      <button class="ghost-button" type="button" data-save-draft>保存草稿</button>
    </div>
    ${company.bestLead ? "" : '<p class="detail-note warn">这家公司还没有可用邮箱，先让 Agent 补一次线索再发送。</p>'}`
        : `<section class="detail-section">
      <h3>投递记录</h3>
      <dl class="detail-list">
        <div><dt>收件人</dt><dd>${escapeHtml(company.sentTo || "--")}</dd></div>
        <div><dt>批准时间</dt><dd>${escapeHtml(company.approvedAt || "--")}</dd></div>
        <div><dt>发出时间</dt><dd>${escapeHtml(company.sentAt || "尚未发出")}</dd></div>
      </dl>
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
  const field = (key, label, value, hint = "") =>
    `<label class="field"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><input type="text" data-profile="${key}" value="${escapeHtml(value)}" /></label>`;
  return `<div class="profile-pane"><div class="detail-scroll">
    <div class="detail-heading"><div><p class="eyebrow">PROFILE</p><h2>我的资料</h2></div>${profile.ready ? '<span class="status-pill status-sent">已就绪</span>' : `<span class="status-pill status-draft">缺 ${profile.missing.length} 项</span>`}</div>
    <p class="detail-note">这份资料决定 Agent 搜什么公司、写什么邮件。改完记得保存。</p>
    ${profile.ready ? "" : `<div class="setup-notice">还缺：${escapeHtml(profile.missing.join("、"))}</div>`}
    <section class="detail-section compose">
      ${field("name", "求职人", profile.name)}
      ${field("targetRole", "目标岗位", profile.targetRole, "搜索公司时的主关键词")}
      ${field("locations", "意向城市", profile.locations)}
      ${field("industries", "意向行业", profile.industries)}
      <label class="field"><span>自我介绍<small>写实一点，邮件正文会引用它</small></span><textarea data-profile="highlights" rows="5">${escapeHtml(profile.highlights)}</textarea></label>
      ${field("resumeFile", "简历文件", profile.resumeFile, "手工放到 skill 的 resume/ 目录，这里填文件名")}
      ${field("fromEmail", "发件邮箱", profile.fromEmail, "发送脚本用这个邮箱发出，授权码存在 Vault")}
    </section>
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

const renderSidebar = () => {
  const attention = desk.attention;
  const primary = attention.profileReady
    ? `<button class="human-work-primary" type="button" data-view="to-send"><span><strong>${attention.toSend}</strong><span>待你确认发送</span></span></button>`
    : `<button class="human-work-primary warn" type="button" data-view="profile"><span><strong>${attention.profileMissing.length}</strong><span>请先补全资料</span></span></button>`;
  return `<aside class="sidebar ${sidebarCollapsed ? "collapsed" : ""}" id="appSidebar">
    <div class="brand"><div class="brand-icon" aria-hidden="true">KJ</div><div class="brand-copy"><div class="brand-title">Kelly 求职直投</div><div class="brand-subtitle">目标公司直投台</div></div><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="appSidebar" aria-expanded="${!sidebarCollapsed}" aria-label="切换侧栏" title="切换侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button></div>
    <section class="human-work" aria-labelledby="humanWorkTitle"><div class="human-work-eyebrow">需要你</div><div id="humanWorkTitle" class="human-work-title">今天的投递</div>${primary}<div class="human-work-secondary"><button type="button" data-view="all" title="缺邮箱，需要 Agent 补线索"><strong>${attention.blocked}</strong><span>缺邮箱</span></button><button type="button" data-view="sent" title="已批准或已发出"><strong>${desk.counts.sent}</strong><span>已发送</span></button></div></section>
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
  <nav class="modal-tabs" aria-label="帮助与设置标签"><button class="${helpTab === "guide" ? "active" : ""}" type="button" data-help-tab="guide">指南</button><button class="${helpTab === "resources" ? "active" : ""}" type="button" data-help-tab="resources">资源</button><button class="${helpTab === "connection" ? "active" : ""}" type="button" data-help-tab="connection">连接</button></nav>
  <div class="modal-body">
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
    ? `<section class="content"><div class="list-panel"><div class="list-head"><div><strong>${meta.label}</strong><span>${items.length} ${meta.noun}</span></div><span>按匹配度排序</span></div><div class="work-list">${renderRows(items, selected?.id)}</div></div><aside class="detail-panel">${selected ? renderCompanyDetail(selected) : '<div class="empty-detail">从左侧选择一家公司</div>'}</aside></section>`
    : `<section class="content content-single">${renderProfile()}</section>`;
  root.innerHTML = `<div class="app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}">${renderSidebar()}<main class="main">
    <div class="mobile-topbar"><button class="mobile-sidebar-toggle" type="button" data-mobile-sidebar aria-controls="appSidebar" aria-label="打开侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button><div class="mobile-topbar-copy"><div class="mobile-view-title">${meta.label}</div><div class="mobile-view-meta">${meta.list ? `${items.length} ${meta.noun}` : desk.profile.ready ? "已就绪" : `缺 ${desk.profile.missing.length} 项`}</div></div><button class="mobile-help-button" type="button" data-open-help aria-label="帮助与设置">帮助</button></div>
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
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal" role="dialog" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KJ</div><div><p class="eyebrow">WORKSPACE SETUP</p><h1 id="setupTitle">${title}</h1></div></div><div class="setup-body"><p><strong>${escapeHtml(authStatus?.baseUrl || "Busabase")}</strong> 鉴权已就绪。</p>${body}<div class="setup-notice" data-setup-status hidden></div></div><div class="setup-footer setup-footer-split">${canProvision ? '<button class="connect-button" type="button" data-provision>初始化工作区</button>' : retryOnly ? '<button class="connect-button" type="button" data-retry-setup>重新检查</button>' : ""}<a class="text-link" href="?demo=1#/to-send">进入演示数据</a></div></section></div>`;
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

const renderConnectSetup = (status = {}) => {
  const oauthError = new URLSearchParams(window.location.search).get("oauth_error");
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal setup-connect" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KJ</div><div><p class="eyebrow">KELLY 求职直投</p><h1 id="setupTitle">连接 Busabase</h1></div></div><form class="setup-body connection-form" method="post" action="/auth/start">${oauthError ? `<div class="setup-error" role="alert">${escapeHtml(oauthError)}</div>` : ""}${status.expired ? '<div class="setup-notice">登录已过期，请重新连接。</div>' : ""}<fieldset class="connection-options"><legend>服务器</legend><label class="connection-option active"><input type="radio" name="server_mode" value="cloud" checked /><span><strong>Busabase Cloud</strong><small>busabase.com</small></span></label><label class="connection-option"><input type="radio" name="server_mode" value="custom" /><span><strong>自定义服务器</strong><small>自托管或企业地址</small></span></label></fieldset><label class="custom-url" hidden><span>Busabase URL</span><input type="url" name="custom_base_url" inputmode="url" placeholder="https://busabase.example.com" autocomplete="url" /></label><input type="hidden" name="base_url" value="${escapeHtml(status.cloudBaseUrl || "https://busabase.com")}" /><button class="connect-button" type="submit">连接 Busabase</button></form><div class="setup-footer setup-footer-split"><span class="setup-security">OAuth 凭证仅保存在本机 ~/.busabase/airapps</span><a class="text-link" href="?demo=1#/to-send">进入演示数据</a></div></section></div>`;
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
  const input = {};
  root.querySelectorAll("[data-profile]").forEach((element) => {
    input[element.dataset.profile] = element.value;
  });
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
      window.location.hash = "#/settings/guide";
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
    const loopbackHost =
      ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) ||
      window.location.hostname.endsWith(".localhost");
    const busabaseHosted = window.self !== window.top || window.location.pathname.startsWith("/api/airapp-preview/");
    const standaloneLocalRuntime = loopbackHost && !busabaseHosted;
    if (!demo && standaloneLocalRuntime) {
      authStatus = await fetch("/auth/status", { headers: { accept: "application/json" } }).then((response) =>
        response.json(),
      );
      if (!authStatus.connected) {
        renderConnectSetup(authStatus);
        return;
      }
    }
    const provider = await getProvider();
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
