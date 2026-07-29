import { appConfig } from "./config.js?v=0.3.0";
import { getProvider } from "./providers/index.js?v=0.3.0";
import { createStrategyDesk } from "./strategy-model.js?v=0.3.0";

const root = document.querySelector("#app");
const money = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const price = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const viewMeta = {
  strategies: { label: "策略", noun: "个策略", eyebrow: "STRATEGY DESK" },
  l1: { label: "L1 初筛", noun: "个候选", eyebrow: "DISCOVERY" },
  l2: { label: "L2 纸面验证", noun: "个候选", eyebrow: "PAPER VALIDATION" },
  l3: { label: "L3 毕业观察", noun: "个候选", eyebrow: "GRADUATION WATCH" },
  ledger: { label: "虚拟账本", noun: "个账户", eyebrow: "VIRTUAL LEDGER" },
};

let currentState;
let desk;
let contentRoute = { view: "strategies", id: null };
let lastContentHash = "#/strategies";
let sidebarCollapsed = false;
let helpTab = "guide";
let authStatus = null;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatPercent = (value, signed = true) =>
  value === null || !Number.isFinite(value) ? "--" : `${signed && value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

const tone = (value) => {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
};

const parseHash = () => {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "settings") {
    return { view: "settings", tab: ["guide", "resources", "connection"].includes(parts[1]) ? parts[1] : "guide" };
  }
  return {
    view: viewMeta[parts[0]] ? parts[0] : "strategies",
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
  }, 2400);
};

const strategyName = (key) => desk.strategies.find((strategy) => strategy.key === key)?.name || key;

const itemsForView = (view) => {
  if (view === "strategies") return desk.strategies;
  if (view === "l1") return desk.levels.L1;
  if (view === "l2") return desk.levels.L2;
  if (view === "l3") return desk.levels.L3;
  if (view === "ledger") return desk.strategies.filter((strategy) => strategy.account);
  return [];
};

const stageBadge = (stage) => `<span class="stage-badge stage-${stage.toLowerCase()}">${stage}</span>`;

const renderStageMix = (
  strategy,
) => `<span class="stage-mix" aria-label="L1 ${strategy.stageCounts.L1}，L2 ${strategy.stageCounts.L2}，L3 ${strategy.stageCounts.L3}">
  ${["L1", "L2", "L3"].map((stage) => `<i class="mix-${stage.toLowerCase()}" style="--mix:${strategy.candidates.length ? strategy.stageCounts[stage] : 0}"></i>`).join("")}
</span>`;

const renderStrategyRow = (
  strategy,
  active,
  index,
) => `<button class="work-row strategy-row ${active ? "active" : ""}" type="button" data-select-id="${escapeHtml(strategy.id)}">
  <span class="row-marker" aria-hidden="true"></span>
  <span class="row-rank">${String(index + 1).padStart(2, "0")}</span>
  <span class="row-main">
    <span class="row-kicker">${escapeHtml(strategy.family)} · ${escapeHtml(strategy.status)}</span>
    <span class="row-title"><strong>${escapeHtml(strategy.name)}</strong>${renderStageMix(strategy)}</span>
    <span class="row-subtitle">${strategy.candidates.length} 个候选 · ${strategy.positions.length} 个虚拟持仓 · ${escapeHtml(strategy.rebalance)}</span>
  </span>
  <span class="row-value"><strong class="${tone(strategy.account?.returnRate ?? null)}">${formatPercent(strategy.account?.returnRate ?? null)}</strong><span class="excess-value ${tone(strategy.account?.excessReturn ?? null)}">超额 ${formatPercent(strategy.account?.excessReturn ?? null)}</span></span>
</button>`;

const renderCandidateRow = (
  candidate,
  active,
) => `<button class="work-row candidate-row ${active ? "active" : ""}" type="button" data-select-id="${escapeHtml(candidate.id)}">
  <span class="row-marker" aria-hidden="true"></span>
  <span class="row-main">
    <span class="row-kicker">${escapeHtml(strategyName(candidate.strategyKey))}</span>
    <span class="row-title"><strong>${escapeHtml(candidate.code)}</strong><span>${escapeHtml(candidate.name)}</span></span>
    <span class="row-subtitle">${candidate.latestPrice === null ? "价格待补" : `$${price.format(candidate.latestPrice)}`} · <span class="${tone(candidate.dailyChange)}">${formatPercent(candidate.dailyChange)}</span> · 复核 ${escapeHtml(candidate.nextReview)}</span>
  </span>
  <span class="row-score score-${candidate.confidence >= 70 ? "high" : candidate.confidence >= 58 ? "mid" : "low"}"><strong>${candidate.confidence}</strong><span>综合分</span></span>
</button>`;

const renderLedgerRow = (
  strategy,
  active,
) => `<button class="work-row ledger-row ${active ? "active" : ""}" type="button" data-select-id="${escapeHtml(strategy.id)}">
  <span class="row-marker" aria-hidden="true"></span>
  <span class="row-main">
    <span class="row-kicker">${escapeHtml(strategy.account.name)}</span>
    <span class="row-title"><strong>${escapeHtml(strategy.name)}</strong></span>
    <span class="row-subtitle">${strategy.positions.length} 个虚拟持仓 · 现金 ${formatPercent(strategy.account.cashRate, false)}</span>
    <span class="row-allocation"><i style="width:${Math.max(0, Math.min(100, (1 - (strategy.account.cashRate || 0)) * 100))}%"></i></span>
  </span>
  <span class="row-value"><strong>${money.format(strategy.account.nav)}</strong><span class="${tone(strategy.account.excessReturn)}">超额 ${formatPercent(strategy.account.excessReturn)}</span></span>
</button>`;

const renderRows = (view, items, selectedId) => {
  if (!items.length) return '<div class="empty-state">当前分层没有候选。</div>';
  return items
    .map((item, index) => {
      if (view === "strategies") return renderStrategyRow(item, item.id === selectedId, index);
      if (view === "ledger") return renderLedgerRow(item, item.id === selectedId);
      return renderCandidateRow(item, item.id === selectedId);
    })
    .join("");
};

const fact = (label, value, extraClass = "") =>
  `<div class="detail-fact ${extraClass}"><span>${label}</span><strong>${value}</strong></div>`;

const scoreBar = (label, value) =>
  `<div class="score-line"><span>${label}</span><div><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div><strong>${value}</strong></div>`;

const renderStageLanes = (strategy) =>
  `<div class="stage-lanes">${["L1", "L2", "L3"]
    .map(
      (stage) =>
        `<div class="stage-lane"><span>${stageBadge(stage)}<small>${{ L1: "研究池", L2: "纸面验证", L3: "毕业观察" }[stage]}</small></span><div>${
          strategy.candidates
            .filter((candidate) => candidate.stage === stage)
            .map((candidate) => `<b>${escapeHtml(candidate.code)}</b>`)
            .join("") || "<em>--</em>"
        }</div></div>`,
    )
    .join("")}</div>`;

const renderStrategyDetail = (strategy) => {
  const account = strategy.account;
  const investedRate = account?.cashRate === null || account?.cashRate === undefined ? null : 1 - account.cashRate;
  return `<div class="detail-scroll">
    <button class="back-to-list" type="button" data-back-to-list>&larr; 返回策略</button>
    <div class="detail-heading"><div><p class="eyebrow">${escapeHtml(strategy.family)}</p><h2>${escapeHtml(strategy.name)}</h2></div><span class="status-pill">${escapeHtml(strategy.status)}</span></div>
    <div class="strategy-performance">
      <div class="confidence-dial" style="--score:${strategy.confidence}"><span><strong>${strategy.confidence}</strong><small>置信度</small></span></div>
      <div><span>虚拟收益</span><strong class="${tone(account?.returnRate ?? null)}">${formatPercent(account?.returnRate ?? null)}</strong><small>基准 ${formatPercent(account?.benchmarkReturn ?? null)}</small></div>
      <div><span>超额收益</span><strong class="${tone(account?.excessReturn ?? null)}">${formatPercent(account?.excessReturn ?? null)}</strong><small>vs ${escapeHtml(strategy.benchmark)}</small></div>
      <div><span>最大回撤</span><strong class="negative">${formatPercent(account?.maxDrawdown ?? null, false)}</strong><small>${escapeHtml(strategy.rebalance)}</small></div>
    </div>
    <div class="capital-allocation"><div><span>虚拟资金使用</span><strong>${formatPercent(investedRate, false)}</strong></div><div><i style="width:${Math.max(0, Math.min(100, (investedRate || 0) * 100))}%"></i></div><small>持仓 ${money.format((account?.nav || 0) - (account?.cash || 0))} · 现金 ${money.format(account?.cash || 0)}</small></div>
    <section class="detail-section"><h3>核心假设</h3><p class="detail-copy">${escapeHtml(strategy.thesis)}</p></section>
    <section class="detail-section"><h3>选股与失效</h3><dl class="detail-list"><div><dt>入选规则</dt><dd>${escapeHtml(strategy.selectionRule)}</dd></div><div><dt>失效条件</dt><dd>${escapeHtml(strategy.invalidationRule)}</dd></div><div><dt>复核频率</dt><dd>${escapeHtml(strategy.rebalance)}</dd></div></dl></section>
    <section class="detail-section"><h3>候选分层</h3>${renderStageLanes(strategy)}</section>
  </div>`;
};

const renderCandidateDetail = (candidate) => {
  const checks = [
    ["研究假设", !candidate.thesis.startsWith("尚未")],
    ["关键证据", !candidate.evidence.startsWith("尚未")],
    ["失效条件", !candidate.invalidation.startsWith("尚未")],
    ["数据新鲜", candidate.freshness === "fresh"],
  ];
  const nextStage = { L1: "进入 L2 前", L2: "进入 L3 前", L3: "持续观察" }[candidate.stage];
  return `<div class="detail-scroll">
    <button class="back-to-list" type="button" data-back-to-list>&larr; 返回${viewMeta[contentRoute.view].label}</button>
    <div class="detail-heading"><div><p class="eyebrow">${escapeHtml(candidate.exchange)} · ${escapeHtml(strategyName(candidate.strategyKey))}</p><h2>${escapeHtml(candidate.code)} <span>${escapeHtml(candidate.name)}</span></h2></div>${stageBadge(candidate.stage)}</div>
    <div class="candidate-performance"><div><span>综合分</span><strong>${candidate.confidence}</strong><small>/ 100</small></div><div><span>参考价</span><strong>${candidate.latestPrice === null ? "--" : `$${price.format(candidate.latestPrice)}`}</strong><small class="${tone(candidate.dailyChange)}">${formatPercent(candidate.dailyChange)}</small></div><div><span>下次复核</span><strong>${escapeHtml(candidate.nextReview.slice(5))}</strong><small>${escapeHtml(nextStage)}</small></div></div>
    <section class="detail-section"><h3>选股评分</h3><div class="score-stack">${scoreBar("质量", candidate.qualityScore)}${scoreBar("估值", candidate.valueScore)}${scoreBar("催化", candidate.catalystScore)}</div></section>
    <section class="detail-section"><h3>判断依据</h3><dl class="detail-list"><div><dt>入选理由</dt><dd>${escapeHtml(candidate.thesis)}</dd></div><div><dt>关键证据</dt><dd>${escapeHtml(candidate.evidence)}</dd></div><div><dt>失效条件</dt><dd>${escapeHtml(candidate.invalidation)}</dd></div></dl></section>
    <section class="detail-section"><div class="section-head-inline"><h3>晋级检查</h3><span>${checks.filter(([, done]) => done).length}/${checks.length} 就绪</span></div><div class="readiness-grid">${checks.map(([label, done]) => `<div class="readiness-item ${done ? "done" : "waiting"}"><i></i><span>${label}</span><strong>${done ? "已就绪" : "待补充"}</strong></div>`).join("")}</div></section>
    <div class="detail-boundary">${candidate.stage === "L1" ? "当前边界：仅进入研究池" : candidate.stage === "L2" ? "当前边界：正在虚拟账本验证" : "当前边界：已毕业，仍只做虚拟观察"}</div>
  </div>`;
};

const renderLedgerDetail = (strategy) => {
  const account = strategy.account;
  return `<div class="detail-scroll">
    <button class="back-to-list" type="button" data-back-to-list>&larr; 返回虚拟账本</button>
    <div class="detail-heading"><div><p class="eyebrow">VIRTUAL ACCOUNT</p><h2>${escapeHtml(strategy.name)}</h2></div><span class="status-pill">模拟</span></div>
    <div class="ledger-hero"><div><span>当前净值</span><strong>${money.format(account.nav)}</strong><small>本金 ${money.format(account.nominalCapital)}</small></div><div><span>累计收益</span><strong class="${tone(account.returnRate)}">${formatPercent(account.returnRate)}</strong><small class="${tone(account.excessReturn)}">超额 ${formatPercent(account.excessReturn)}</small></div></div>
    <div class="capital-allocation"><div><span>账户仓位</span><strong>${formatPercent(1 - (account.cashRate || 0), false)}</strong></div><div><i style="width:${Math.max(0, Math.min(100, (1 - (account.cashRate || 0)) * 100))}%"></i></div><small>持仓 ${money.format(account.nav - account.cash)} · 现金 ${money.format(account.cash)}</small></div>
    <section class="detail-section"><h3>账户摘要</h3><div class="fact-grid">${fact("虚拟盈亏", money.format(account.pnl), tone(account.pnl))}${fact("超额收益", formatPercent(account.excessReturn), tone(account.excessReturn))}${fact("基准收益", formatPercent(account.benchmarkReturn))}${fact("最大回撤", formatPercent(account.maxDrawdown, false), "negative")}</div></section>
    <section class="detail-section"><h3>虚拟持仓</h3><div class="position-table"><div class="position-table-head"><span>标的</span><span>权重</span><span>盈亏</span></div>${strategy.positions.map((position) => `<div class="position-table-row"><span><strong>${escapeHtml(position.code)}</strong><small>成本 ${position.entryPrice === null ? "--" : `$${price.format(position.entryPrice)}`} · 参考 ${position.latestPrice === null ? "--" : `$${price.format(position.latestPrice)}`}</small><i><b style="width:${Math.max(0, Math.min(100, (position.weight || 0) * 100))}%"></b></i></span><span>${formatPercent(position.weight, false)}</span><span class="${tone(position.pnl)}">${position.pnl === null ? "--" : money.format(position.pnl)}</span></div>`).join("") || '<div class="empty-state">暂无虚拟持仓。</div>'}</div></section>
    <p class="ledger-stamp">更新于 ${escapeHtml(account.updatedAt)} · 不连接券商，不产生真实订单</p>
  </div>`;
};

const renderDetail = (view, item) => {
  if (!item) return '<div class="empty-detail">从左侧选择一条记录</div>';
  if (view === "strategies") return renderStrategyDetail(item);
  if (view === "ledger") return renderLedgerDetail(item);
  return renderCandidateDetail(item);
};

const renderFunnel = () => `<section class="workflow-band"><div class="funnel" aria-label="选股漏斗">
  ${[
    ["l1", "L1", "初筛", desk.levels.L1.length],
    ["l2", "L2", "纸面验证", desk.levels.L2.length],
    ["l3", "L3", "毕业观察", desk.levels.L3.length],
  ]
    .map(
      ([view, level, label, count], index) =>
        `<button class="funnel-step ${contentRoute.view === view ? "active" : ""}" type="button" data-view="${view}">${stageBadge(level)}<span><strong>${label}</strong><small>${count} 个候选</small></span>${index < 2 ? '<i aria-hidden="true">›</i>' : ""}</button>`,
    )
    .join("")}
</div><div class="workflow-pulse"><span><strong>${desk.strategies.length}</strong> 策略</span><span><strong>${desk.candidates.length}</strong> 候选</span><span class="${tone(desk.ledger.excessReturn)}"><strong>${formatPercent(desk.ledger.excessReturn)}</strong> 组合超额</span></div></section>`;

const renderSidebar = () => {
  const counts = {
    strategies: desk.strategies.length,
    l1: desk.levels.L1.length,
    l2: desk.levels.L2.length,
    l3: desk.levels.L3.length,
    ledger: desk.accounts.length,
  };
  return `<aside class="sidebar ${sidebarCollapsed ? "collapsed" : ""}" id="appSidebar">
    <div class="brand"><div class="brand-icon" aria-hidden="true">KS</div><div class="brand-copy"><div class="brand-title">Kelly Invest Stock</div><div class="brand-subtitle">策略实验台</div></div><button class="sidebar-toggle" type="button" data-sidebar-toggle aria-controls="appSidebar" aria-expanded="${!sidebarCollapsed}" aria-label="切换侧栏" title="切换侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button></div>
    <section class="human-work" aria-labelledby="humanWorkTitle"><div class="human-work-eyebrow">需要你</div><div id="humanWorkTitle" class="human-work-title">候选推进</div><button class="human-work-primary" type="button" data-view="l1"><span><strong>${desk.attention.l1}</strong><span>L1 证据待补</span></span></button><div class="human-work-secondary"><button type="button" data-view="l2"><strong>${desk.attention.l2}</strong><span>纸面验证</span></button><button type="button" data-view="l3"><strong>${desk.attention.l3}</strong><span>毕业观察</span></button></div></section>
    <div class="sidebar-separator"></div>
    <nav class="filters" aria-label="工作流导航">${Object.entries(viewMeta)
      .map(
        ([key, meta]) =>
          `<button class="${contentRoute.view === key ? "active" : ""}" type="button" data-view="${key}" title="打开${meta.label}"><span>${meta.label}</span><span>${counts[key]}</span></button>`,
      )
      .join("")}</nav>
    <div class="help-box"><div class="virtual-only"><span></span>全部为虚拟账本</div><button class="help-button" type="button" data-open-help>帮助与设置</button></div>
  </aside>`;
};

const renderSummaryStrip = () => `<section class="summary-strip" aria-label="虚拟账本摘要">
  <div><span>名义本金</span><strong>${money.format(desk.ledger.nominalCapital)}</strong></div>
  <div><span>当前净值</span><strong>${money.format(desk.ledger.nav)}</strong></div>
  <div><span>虚拟盈亏</span><strong class="${tone(desk.ledger.pnl)}">${money.format(desk.ledger.pnl)}</strong></div>
  <div><span>累计收益</span><strong class="${tone(desk.ledger.returnRate)}">${formatPercent(desk.ledger.returnRate)}</strong></div>
  <div><span>组合超额</span><strong class="${tone(desk.ledger.excessReturn)}">${formatPercent(desk.ledger.excessReturn)}</strong></div>
  <div><span>现金比例</span><strong>${formatPercent(desk.ledger.cashRate, false)}</strong></div>
</section>`;

const renderHelp =
  () => `<div class="modal-backdrop" id="helpModal" aria-hidden="false"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
  <div class="modal-head"><div><div id="helpTitle" class="modal-title">帮助与设置</div><div class="modal-subtitle">Kelly Invest Stock · 策略实验台</div></div><button class="icon-button" type="button" data-close-help aria-label="关闭帮助">关闭</button></div>
  <nav class="modal-tabs" aria-label="帮助与设置标签"><button class="${helpTab === "guide" ? "active" : ""}" type="button" data-help-tab="guide">规则</button><button class="${helpTab === "resources" ? "active" : ""}" type="button" data-help-tab="resources">资源</button><button class="${helpTab === "connection" ? "active" : ""}" type="button" data-help-tab="connection">连接</button></nav>
  <div class="modal-body">
    <section class="help-tab-panel ${helpTab === "guide" ? "active" : ""}"><h2>分层规则</h2><dl class="settings-list"><div><dt>L1 初筛</dt><dd>形成假设，补齐关键证据与失效条件。</dd></div><div><dt>L2 纸面验证</dt><dd>进入虚拟账本，观察收益、回撤与策略一致性。</dd></div><div><dt>L3 毕业观察</dt><dd>通过验证后持续跟踪，仍不连接真实交易。</dd></div></dl></section>
    <section class="help-tab-panel ${helpTab === "resources" ? "active" : ""}"><h2>Busabase 资源</h2><dl class="settings-list"><div><dt>应用根节点</dt><dd><code>${escapeHtml(appConfig.folder.slug)}</code></dd></div><div><dt>结构化数据</dt><dd>${appConfig.bases.map((base) => escapeHtml(base.name)).join("、")}</dd></div><div><dt>秘密数据</dt><dd>无 Vault 要求；本地 OAuth 凭证不进入业务 Base。</dd></div></dl></section>
    <section class="help-tab-panel ${helpTab === "connection" ? "active" : ""}"><h2>连接状态</h2><dl class="settings-list"><div><dt>数据提供方</dt><dd>${currentState.provider.name === "demo" ? "固定只读演示" : "Busabase SDK"}</dd></div><div><dt>Space</dt><dd>${currentState.provider.name === "demo" ? "演示中未连接" : "由当前 AirApp 会话确定"}</dd></div><div><dt>资源版本</dt><dd>Schema v${appConfig.schemaVersion}</dd></div><div><dt>运行边界</dt><dd>本地与 AirApp 使用同一份 Hono 应用源码。</dd></div></dl></section>
  </div>
</section></div>`;

const renderApp = () => {
  const items = itemsForView(contentRoute.view);
  const selected = items.find((item) => item.id === contentRoute.id) || items[0] || null;
  const meta = viewMeta[contentRoute.view];
  root.innerHTML = `<div class="app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}">${renderSidebar()}<main class="main">
    <div class="mobile-topbar"><button class="mobile-sidebar-toggle" type="button" data-mobile-sidebar aria-controls="appSidebar" aria-label="打开侧栏"><span class="sidebar-toggle-icon" aria-hidden="true"></span></button><div class="mobile-topbar-copy"><div class="mobile-view-title">${meta.label}</div><div class="mobile-view-meta">${items.length} ${meta.noun}</div></div><button class="mobile-help-button" type="button" data-open-help aria-label="帮助与设置">帮助</button></div>
    <header class="workspace-head"><div><p class="eyebrow">${meta.eyebrow}</p><h1>${meta.label}</h1></div><div class="workspace-status">${currentState.provider.name === "demo" ? '<span class="snapshot-badge">DEMO</span>' : '<span class="status-dot"></span>'}<span>${escapeHtml(currentState.provider.asOf || "Busabase 当前数据")}</span><span class="read-only">只读</span><button type="button" data-refresh>刷新</button></div></header>
    ${contentRoute.view === "ledger" ? renderSummaryStrip() : renderFunnel()}
    <section class="content"><div class="list-panel"><div class="list-head"><div><strong>${meta.label}</strong><span>${items.length} ${meta.noun}</span></div>${["l1", "l2", "l3"].includes(contentRoute.view) ? "<span>按综合分排序</span>" : ""}</div><div class="work-list">${renderRows(contentRoute.view, items, selected?.id)}</div></div><aside class="detail-panel">${renderDetail(contentRoute.view, selected)}</aside></section>
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
    ? `<p>将在当前 Space 的应用 Folder 下创建 ${escapeHtml(resources)} 四个 Base。</p><p class="detail-note">结构通过一个 Busabase ChangeRequest 幂等提交；旧版资源不会被删除或继续读取。</p>`
    : `<p>${escapeHtml(reason)}</p><p class="detail-note">应用不会要求你手工创建 Node/Base 或复制 ID，也不会切换到本地数据。</p>`;
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal" role="dialog" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KS</div><div><p class="eyebrow">WORKSPACE SETUP</p><h1 id="setupTitle">${title}</h1></div></div><div class="setup-body"><p><strong>${escapeHtml(authStatus?.baseUrl || "Busabase")}</strong> 鉴权已就绪。</p>${body}<div class="setup-notice" data-setup-status hidden></div></div><div class="setup-footer setup-footer-split">${canProvision ? '<button class="connect-button" type="button" data-provision>初始化工作区</button>' : retryOnly ? '<button class="connect-button" type="button" data-retry-setup>重新检查</button>' : ""}<a class="text-link" href="?demo=1#/strategies">进入只读 Demo</a></div></section></div>`;
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
  root.innerHTML = `<div class="setup-shell"><section class="setup-modal setup-connect" aria-labelledby="setupTitle"><div class="setup-head"><div class="brand-icon" aria-hidden="true">KS</div><div><p class="eyebrow">KELLY INVEST STOCK</p><h1 id="setupTitle">连接 Busabase</h1></div></div><form class="setup-body connection-form" method="post" action="/auth/start">${oauthError ? `<div class="setup-error" role="alert">${escapeHtml(oauthError)}</div>` : ""}${status.expired ? '<div class="setup-notice">登录已过期，请重新连接。</div>' : ""}<fieldset class="connection-options"><legend>服务器</legend><label class="connection-option active"><input type="radio" name="server_mode" value="cloud" checked /><span><strong>Busabase Cloud</strong><small>busabase.com</small></span></label><label class="connection-option"><input type="radio" name="server_mode" value="custom" /><span><strong>自定义服务器</strong><small>自托管或企业地址</small></span></label></fieldset><label class="custom-url" hidden><span>Busabase URL</span><input type="url" name="custom_base_url" inputmode="url" placeholder="https://busabase.example.com" autocomplete="url" /></label><input type="hidden" name="base_url" value="${escapeHtml(status.cloudBaseUrl || "https://busabase.com")}" /><button class="connect-button" type="submit">连接 Busabase</button></form><div class="setup-footer setup-footer-split"><span class="setup-security">OAuth 凭证仅保存在本机 ~/.busabase/airapps</span><a class="text-link" href="?demo=1#/strategies">进入只读 Demo</a></div></section></div>`;
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
    if (currentState.provider.name === "demo") showToast("演示数据为 2026-07-28 固定快照。");
    else await load();
  });
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

const load = async () => {
  root.innerHTML = '<div class="boot-state">正在读取策略实验台...</div>';
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
    desk = createStrategyDesk(currentState.records);
    if (!window.location.hash) window.history.replaceState(null, "", "#/strategies");
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

load();
