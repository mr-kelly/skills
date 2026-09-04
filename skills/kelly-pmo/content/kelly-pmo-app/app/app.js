import { messages } from "./i18n/messages.js";
import { NATIVE_VIEW_TYPES, PMO_REFERENCE_TABLE_KEYS, appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  HEALTH_LEVELS,
  MILESTONE_STATUSES,
  PROJECT_STATUSES,
  computeMetrics,
  isMilestoneDueSoon,
  milestonesWithProject,
} from "./js/pmo-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const qs = new URLSearchParams(location.search);
const state = {
  projects: [],
  milestones: [],
  risks: [],
  reports: [],
  decisions: [],
  settings: {},
  metrics: {},
  totals: {},
  pagination: {},
  route: parseRoute(),
  query: "",
  lang: normalizeLang(qs.get("lang") || localStorage.getItem("kelly-pmo-language") || "auto"),
  demo: qs.has("demo"),
  busy: false,
  selectedProjectId: "",
};
const SIDEBAR_KEY = "kelly-pmo.sidebarCollapsed";
const els = Object.fromEntries(
  [
    "content",
    "title",
    "subtitle",
    "sync",
    "search",
    "refresh",
    "mobileRefresh",
    "sidebarToggle",
    "mobileSidebarToggle",
    "sidebarScrim",
    "mobileViewTitle",
    "mobileViewMeta",
    "newProjectBtn",
    "settingsModal",
    "settingsBody",
    "settingsClose",
    "language",
    "countDecisions",
    "countReports",
    "countRisk",
  ].map((id) => [id, document.getElementById(id)]),
);

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}
function normalizeLang(value) {
  const lang = String(value || "auto").toLowerCase();
  return lang.startsWith("zh") ? "zh" : lang === "en" ? "en" : "auto";
}
function activeLang() {
  return state.lang === "auto"
    ? navigator.languages?.some((item) => item.toLowerCase().startsWith("zh"))
      ? "zh"
      : "en"
    : state.lang;
}
function t(key, vars = {}) {
  let value = messages[activeLang()]?.[key] || messages.en[key] || key;
  for (const [name, replacement] of Object.entries(vars)) value = value.replace(`{${name}}`, replacement);
  return value;
}
function enumLabel(value) {
  return messages[activeLang()]?.enum?.[value] || messages.en.enum?.[value] || String(value || "").replaceAll("_", " ");
}
function e(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}
function isMobile() {
  return matchMedia("(max-width: 720px)").matches;
}
function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}
function setCollapsed(value, persist = true) {
  document.body.classList.toggle("sidebar-collapsed", Boolean(value));
  els.sidebarToggle?.setAttribute("aria-expanded", String(!value));
  if (persist) localStorage.setItem(SIDEBAR_KEY, value ? "1" : "0");
}
function syncShell() {
  if (isMobile()) {
    setCollapsed(false, false);
    setSidebarOpen(false);
  } else {
    setSidebarOpen(false);
    setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1", false);
  }
}
function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-GB", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
function badge(value) {
  return `<span class="badge ${e(value)}"><span class="status-dot"></span>${e(enumLabel(value))}</span>`;
}
function projectById(id) {
  return state.projects.find((item) => item.id === id);
}
function queryRows(rows) {
  const q = state.query.trim().toLowerCase();
  return q
    ? rows.filter((row) =>
        Object.values(row).some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(q),
        ),
      )
    : rows;
}
function projectMilestones() {
  return milestonesWithProject(state.milestones, state.projects);
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.search.placeholder = t("search");
  els.newProjectBtn.textContent = t("newProject");
  els.refresh.title = t("refresh");
  els.language.value = state.lang;
  for (const option of els.language.options)
    option.textContent = { auto: t("auto"), en: "English", zh: "中文" }[option.value];
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  Object.assign(state, {
    projects: data.projects || [],
    milestones: data.milestones || [],
    risks: data.risks || [],
    reports: data.reports || [],
    decisions: data.decisions || [],
    settings: data.settings || {},
    metrics: data.metrics || {},
    totals: data.totals || {},
    pagination: data.pagination || {},
    onboarding: data.onboarding || {},
    generated_at: data.generated_at,
  });
  window.dispatchEvent(new CustomEvent("kelly-pmo:state", { detail: data }));
  if (!state.selectedProjectId || !projectById(state.selectedProjectId))
    state.selectedProjectId = state.projects[0]?.id || "";
  render();
}

function attentionItems() {
  const rows = [];
  for (const item of state.decisions.filter((row) => row.status === "needs_review"))
    rows.push({
      type: "decision",
      label: `Decision #${item.ref || "-"}`,
      title: item.title,
      href: "#/decisions",
      status: item.status,
    });
  for (const item of state.projects.filter((row) => row.health === "red"))
    rows.push({
      type: "project",
      label: enumLabel("red"),
      title: item.name,
      href: `#/projects/${item.id}`,
      status: item.health,
    });
  for (const item of projectMilestones().filter((row) => row.status === "blocked" || row.status === "at_risk"))
    rows.push({
      type: "milestone",
      label: formatDate(item.due_date),
      title: item.title,
      href: "#/milestones",
      status: item.status,
    });
  return rows.slice(0, 8);
}

function metricCard(label, value, detail, tone = "") {
  return `<article class="metric ${tone}"><span>${e(label)}</span><strong>${e(value)}</strong><small>${e(detail)}</small></article>`;
}
function progressBar(value, tone = "green") {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress-track" aria-label="${pct}%"><span class="${e(tone)}" style="width:${pct}%"></span></div>`;
}

function renderOverview() {
  const m = computeMetrics(
    state.projects,
    state.milestones,
    state.risks,
    state.reports,
    state.decisions,
    state.generated_at,
  );
  const attention = attentionItems();
  const programMap = new Map();
  for (const item of state.projects) {
    const group = programMap.get(item.program) || { count: 0, progress: 0, red: 0 };
    group.count += 1;
    group.progress += item.progress;
    group.red += item.health === "red" ? 1 : 0;
    programMap.set(item.program, group);
  }
  const programs = [...programMap.entries()]
    .map(
      ([name, item]) =>
        `<div class="program-row"><span><strong>${e(name || t("unassigned"))}</strong><small>${t("projectCount", { count: item.count })}</small></span><div>${progressBar(Math.round(item.progress / item.count), item.red ? "red" : "green")}<small>${Math.round(item.progress / item.count)}%</small></div></div>`,
    )
    .join("");
  const upcoming = projectMilestones()
    .filter((item) => isMilestoneDueSoon(item, state.generated_at))
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 6)
    .map(
      (item) =>
        `<a class="compact-row" href="#/projects/${e(item.project_id)}"><span><strong>${e(item.title)}</strong><small>${e(item.project?.name || "")} · ${formatDate(item.due_date)}</small></span>${badge(item.status)}</a>`,
    )
    .join("");
  els.content.innerHTML = `
    <section class="overview-hero"><div><span class="eyebrow">${t("portfolioPulse")}</span><h2>${e(state.settings.portfolio_name || t("portfolio"))}</h2><p>${t("overviewLead")}</p></div><span class="as-of">${t("asOf")} ${formatDate(state.generated_at)}</span></section>
    <div class="metrics">${metricCard(t("activeProjects"), m.active, t("ofProjects", { count: state.totals.projects ?? state.projects.length }))}${metricCard(t("averageProgress"), `${m.average_progress}%`, t("loadedPortfolio"))}${metricCard(t("redProjects"), m.red_projects, t("needRecovery"), m.red_projects ? "danger" : "")}${metricCard(t("decisionsDue"), m.decisions, t("needDecision"), m.decisions ? "warning" : "")}</div>
    <div class="overview-grid"><section class="panel attention-panel"><div class="section-head"><div><span class="eyebrow">${t("humanAttention")}</span><h2>${t("attentionTitle")}</h2></div><span class="count-chip">${attention.length}</span></div><div class="stack-list">${attention.map((item) => `<a class="attention-row" href="${item.href}"><span><small>${e(item.label)}</small><strong>${e(item.title)}</strong></span>${badge(item.status)}</a>`).join("") || `<div class="empty-state"><strong>${t("allClear")}</strong><span>${t("noAttention")}</span></div>`}</div></section>
    <section class="panel"><div class="section-head"><h2>${t("programHealth")}</h2></div><div class="program-list">${programs || `<div class="empty-state">${t("empty")}</div>`}</div></section>
    <section class="panel wide"><div class="section-head"><h2>${t("nextMilestones")}</h2><a href="#/milestones">${t("viewAll")}</a></div><div class="stack-list">${upcoming || `<div class="empty-state">${t("empty")}</div>`}</div></section></div>`;
}

function projectListItem(item, selected) {
  return `<a class="project-row ${selected ? "selected" : ""}" href="#/projects/${e(item.id)}" data-project-id="${e(item.id)}"><span class="health-stripe ${e(item.health)}"></span><span class="project-row-main"><strong>${e(item.name)}</strong><small>${e(item.program)} · ${e(item.owner)}</small>${progressBar(item.progress, item.health)}</span><span class="project-row-meta"><b>${item.progress}%</b>${badge(item.status)}</span></a>`;
}
function projectDetail(item) {
  if (!item)
    return `<div class="empty-state large"><strong>${t("selectProject")}</strong><span>${t("selectProjectHint")}</span></div>`;
  const milestones = projectMilestones().filter((row) => row.project_id === item.id);
  const risks = state.risks.filter((row) => row.project_id === item.id && row.status !== "closed");
  const latest = state.reports
    .filter((row) => row.project_id === item.id)
    .sort((a, b) => String(b.period_key).localeCompare(String(a.period_key)))[0];
  return `<div class="detail-scroll"><a class="back-to-list" href="#/projects">← ${t("projects")}</a><div class="detail-heading"><div><span class="eyebrow">${e(item.program)}</span><h2>${e(item.name)}</h2><p>${e(item.next_action)}</p></div>${badge(item.health)}</div>
    <div class="detail-facts"><span><small>${t("owner")}</small><strong>${e(item.owner)}</strong></span><span><small>${t("sponsor")}</small><strong>${e(item.sponsor)}</strong></span><span><small>${t("targetDate")}</small><strong>${formatDate(item.target_date)}</strong></span><span><small>${t("budget")}</small><strong>${e(item.budget)}</strong></span></div>
    <section class="detail-section"><div class="section-head"><h3>${t("deliveryProgress")}</h3><strong>${item.progress}%</strong></div>${progressBar(item.progress, item.health)}</section>
    <section class="detail-section"><div class="section-head"><h3>${t("milestones")}</h3><span>${milestones.length}</span></div>${milestones.map((row) => `<div class="compact-row"><span><strong>${e(row.title)}</strong><small>${e(row.owner)} · ${formatDate(row.due_date)}</small></span>${badge(row.status)}</div>`).join("") || `<div class="empty-state">${t("empty")}</div>`}</section>
    <section class="detail-section"><div class="section-head"><h3>${t("risks")}</h3><span>${risks.length}</span></div>${risks.map((row) => `<div class="compact-row"><span><strong>${e(row.title)}</strong><small>${e(row.mitigation)}</small></span>${badge(row.impact)}</div>`).join("") || `<div class="empty-state">${t("empty")}</div>`}</section>
    <section class="detail-section"><div class="section-head"><h3>${t("latestReport")}</h3><span>${e(latest?.period_key || "-")}</span></div><p>${e(latest?.summary || t("noReport"))}</p></section></div>`;
}

function renderProjects() {
  if (state.route.id === "new") return renderProjectForm();
  const rows = queryRows(state.projects);
  const selected = projectById(state.route.id) || projectById(state.selectedProjectId) || rows[0];
  if (selected) state.selectedProjectId = selected.id;
  document.body.classList.toggle("mobile-detail-open", Boolean(state.route.id && state.route.id !== "new"));
  els.content.innerHTML = `<div class="workspace"><section class="list-panel"><div class="list-head"><div><span class="eyebrow">${t("portfolio")}</span><h2>${t("projects")}</h2></div><span>${state.totals.projects ?? rows.length}</span></div><div class="project-list">${rows.map((item) => projectListItem(item, selected?.id === item.id)).join("") || `<div class="empty-state">${t("empty")}</div>`}</div>${loadMoreButton("projects")}</section><aside class="detail-panel">${projectDetail(selected)}</aside></div>`;
}

function projectForm(item = {}) {
  const option = (values, current) =>
    values
      .map((value) => `<option value="${value}" ${value === current ? "selected" : ""}>${e(enumLabel(value))}</option>`)
      .join("");
  return `<form id="projectForm" class="project-form"><label>${t("projectName")}<input name="name" required value="${e(item.name || "")}"></label><label>${t("program")}<input name="program" value="${e(item.program || "")}"></label><label>${t("status")}<select name="status">${option(PROJECT_STATUSES, item.status || "planning")}</select></label><label>${t("health")}<select name="health">${option(HEALTH_LEVELS, item.health || "green")}</select></label><label>${t("owner")}<input name="owner" value="${e(item.owner || "")}"></label><label>${t("sponsor")}<input name="sponsor" value="${e(item.sponsor || "")}"></label><label>${t("progress")}<input name="progress" type="number" min="0" max="100" value="${e(item.progress || 0)}"></label><label>${t("targetDate")}<input name="target_date" type="date" value="${e(item.target_date || "")}"></label><label class="full">${t("nextAction")}<textarea name="next_action" rows="3">${e(item.next_action || "")}</textarea></label><button type="submit">${item.id ? t("saveChanges") : t("createProject")}</button></form>`;
}
function readProjectForm(form) {
  const data = new FormData(form);
  return Object.fromEntries(
    [...data.entries()].map(([key, value]) => [key, key === "progress" ? Number(value) : String(value)]),
  );
}
function renderProjectForm(item) {
  els.content.innerHTML = `<section class="form-page panel"><a class="back-link" href="#/projects">← ${t("projects")}</a><div class="section-head"><div><span class="eyebrow">${t("portfolio")}</span><h2>${item ? t("editProject") : t("newProject")}</h2></div></div>${projectForm(item)}</section>`;
  document.getElementById("projectForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProject(readProjectForm(event.currentTarget), item?.id);
  });
}

function renderMilestones() {
  const rows = queryRows(projectMilestones()).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  els.content.innerHTML = `<section class="table-page"><div class="page-intro"><div><span class="eyebrow">${t("plan")}</span><h2>${t("milestonePlan")}</h2><p>${t("milestoneLead")}</p></div></div><div class="table-card"><table><thead><tr><th>${t("milestone")}</th><th>${t("project")}</th><th>${t("owner")}</th><th>${t("due")}</th><th>${t("progress")}</th><th>${t("status")}</th><th></th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${e(item.title)}</strong><small>${e(item.evidence)}</small></td><td><a href="#/projects/${e(item.project_id)}">${e(item.project?.name || "-")}</a></td><td>${e(item.owner)}</td><td class="${isMilestoneDueSoon(item, state.generated_at) ? "due-soon" : ""}">${formatDate(item.due_date)}</td><td><div class="progress-cell"><span>${item.progress}%</span>${progressBar(item.progress, item.status === "blocked" ? "red" : "green")}</div></td><td>${badge(item.status)}</td><td><button class="ghost compact" data-milestone="${e(item.id)}" data-done="${item.status !== "done"}">${item.status === "done" ? t("reopen") : t("markDone")}</button></td></tr>`).join("")}</tbody></table>${loadMoreButton("milestones")}</div></section>`;
  els.content
    .querySelectorAll("[data-milestone]")
    .forEach((button) =>
      button.addEventListener("click", () => saveMilestone(button.dataset.milestone, button.dataset.done === "true")),
    );
}

function renderRisks() {
  const rows = queryRows(state.risks);
  els.content.innerHTML = `<section class="table-page"><div class="page-intro"><div><span class="eyebrow">${t("control")}</span><h2>${t("riskRegister")}</h2><p>${t("riskLead")}</p></div></div><div class="risk-grid">${
    rows
      .map((item) => {
        const project = projectById(item.project_id);
        return `<article class="risk-card panel"><div class="risk-card-head"><span>${badge(item.impact)}</span><span>${badge(item.status)}</span></div><h3>${e(item.title)}</h3><a href="#/projects/${e(item.project_id)}">${e(project?.name || "-")}</a><dl><dt>${t("probability")}</dt><dd>${e(enumLabel(item.probability))}</dd><dt>${t("owner")}</dt><dd>${e(item.owner)}</dd><dt>${t("reviewDate")}</dt><dd>${formatDate(item.review_date)}</dd></dl><p>${e(item.mitigation)}</p></article>`;
      })
      .join("") || `<div class="empty-state">${t("empty")}</div>`
  }</div>${loadMoreButton("risks")}</section>`;
}

function renderReports() {
  const rows = queryRows(state.reports).sort((a, b) => String(b.period_key).localeCompare(String(a.period_key)));
  els.content.innerHTML = `<section class="reports-page"><div class="page-intro"><div><span class="eyebrow">${t("research")}</span><h2>${t("weeklyReports")}</h2><p>${t("reportsLead")}</p></div></div><div class="report-feed">${
    rows
      .map((item) => {
        const project = projectById(item.project_id);
        return `<article class="report-card panel"><header><span><small>${e(item.period_key)}</small><h3>${e(project?.name || "-")}</h3></span>${badge(item.health)}</header><div class="report-progress"><strong>${item.progress}%</strong>${progressBar(item.progress, item.health)}</div><p>${e(item.summary)}</p><div class="report-columns"><div><small>${t("accomplishments")}</small><p>${e(item.accomplishments || "-")}</p></div><div><small>${t("nextPeriod")}</small><p>${e(item.next_period || "-")}</p></div><div><small>${t("blockers")}</small><p>${e(item.blockers || t("none"))}</p></div></div></article>`;
      })
      .join("") || `<div class="empty-state">${t("empty")}</div>`
  }</div>${loadMoreButton("reports")}</section>`;
}

function renderDecisions() {
  const rows = queryRows(state.decisions);
  els.content.innerHTML = `<section class="decisions-page"><div class="page-intro"><div><span class="eyebrow">${t("humanAttention")}</span><h2>${t("decisionQueue")}</h2><p>${t("decisionsLead")}</p></div></div><div class="decision-list">${rows.map((item) => `<article class="decision-card panel"><header><span><small>Decision #${item.ref || "-"}</small><h3>${e(item.title)}</h3></span>${badge(item.status)}</header><p>${e(item.summary)}</p><div class="recommendation"><small>${t("recommendation")}</small><strong>${e(item.recommendation)}</strong></div><label>${t("reviewNote")}<textarea data-decision-note="${e(item.id)}" rows="2">${e(item.decision_note)}</textarea></label><div class="decision-actions"><button data-decision="${e(item.id)}" data-action="approve">${t("approve")}</button><button class="ghost" data-decision="${e(item.id)}" data-action="changes">${t("requestChanges")}</button><button class="ghost danger" data-decision="${e(item.id)}" data-action="block">${t("block")}</button></div></article>`).join("") || `<div class="empty-state">${t("empty")}</div>`}</div>${loadMoreButton("decisions")}</section>`;
  els.content.querySelectorAll("[data-decision]").forEach((button) =>
    button.addEventListener("click", () => {
      const note =
        els.content.querySelector(`[data-decision-note="${CSS.escape(button.dataset.decision)}"]`)?.value || "";
      saveDecision(button.dataset.decision, button.dataset.action, note);
    }),
  );
}

function tableName(key, fallback) {
  if (activeLang() !== "zh") return fallback;
  return (
    {
      programs: "项目群",
      "project-teams": "项目组",
      projects: "项目计划",
      reports: "进度汇报",
      "special-tasks": "特项任务",
      communications: "沟通规划",
      resources: "人力资源",
      "functional-groups": "职能组",
      glossary: "名词管理",
      testing: "Testing",
      requirements: "需求表",
      iterations: "迭代",
    }[key] || fallback
  );
}

function renderWorkspace() {
  const bases = PMO_REFERENCE_TABLE_KEYS.map((key) => appConfig.bases.find((item) => item.key === key)).filter(Boolean);
  const selected = bases.find((item) => item.key === state.route.id) || bases[0];
  document.body.classList.toggle("mobile-detail-open", Boolean(state.route.id));
  const totalViews = bases.reduce((sum, item) => sum + (item.views?.length || 0), 0);
  const rows = bases
    .map(
      (
        item,
      ) => `<a class="workspace-table-row ${selected?.key === item.key ? "selected" : ""}" href="#/workspace/${item.key}">
        <span class="table-glyph" aria-hidden="true"></span>
        <span><strong>${e(tableName(item.key, item.name))}</strong><small>${t("recordsAndViews", {
          records: state.totals[item.key] ?? 0,
          views: item.views?.length || 0,
        })}</small></span>
        <span class="view-miniatures">${[...new Set((item.views || []).map((savedView) => savedView.type))]
          .map((type) => `<i title="${e(enumLabel(type))}">${e(type.slice(0, 1).toUpperCase())}</i>`)
          .join("")}</span>
      </a>`,
    )
    .join("");
  const viewMatrix = NATIVE_VIEW_TYPES.map((type) => {
    const nativeView = selected?.views?.find((item) => item.type === type);
    return `<div class="native-view ${nativeView ? "available" : ""}"><span class="view-glyph ${type}" aria-hidden="true"></span><span><strong>${e(enumLabel(type))}</strong><small>${nativeView ? e(nativeView.name) : t("notConfigured")}</small></span></div>`;
  }).join("");
  const fields = (selected?.fields || [])
    .map((item) => `<span class="field-chip"><strong>${e(item.name)}</strong><small>${e(item.type)}</small></span>`)
    .join("");
  const supportNodes = appConfig.supportNodes
    .map(
      (item) =>
        `<span class="support-node"><i>${e(item.type.slice(0, 2).toUpperCase())}</i><span><strong>${e(item.name)}</strong><small>${e(enumLabel(item.type))}</small></span></span>`,
    )
    .join("");
  els.content.innerHTML = `<div class="workspace resource-workspace">
    <section class="list-panel"><div class="list-head"><div><span class="eyebrow">${t("dataWorkspace")}</span><h2>${t("businessTables")}</h2></div><span>12</span></div><div class="workspace-table-list">${rows}</div><div class="workspace-total">${t("workspaceTotal", { tables: 12, views: totalViews })}</div></section>
    <aside class="detail-panel"><div class="detail-scroll resource-detail"><a class="back-to-list" href="#/workspace">← ${t("businessTables")}</a><div class="detail-heading"><div><span class="eyebrow">${t("nativeBase")}</span><h2>${e(tableName(selected.key, selected.name))}</h2><p>${e(selected.description)}</p></div><span class="count-chip">${state.totals[selected.key] ?? 0}</span></div>
      <section class="detail-section"><div class="section-head"><h3>${t("savedViews")}</h3><span>${selected.views?.length || 0}</span></div><div class="native-view-grid">${viewMatrix}</div></section>
      <section class="detail-section"><div class="section-head"><h3>${t("fields")}</h3><span>${selected.fields.length}</span></div><div class="field-cloud">${fields}</div></section>
      <section class="detail-section"><div class="section-head"><h3>${t("supportNodes")}</h3><span>${appConfig.supportNodes.length}</span></div><div class="support-node-grid">${supportNodes}</div></section>
    </div></aside>
  </div>`;
}

function renderSettings() {
  els.settingsModal.hidden = false;
  els.settingsBody.innerHTML = `<section><span class="eyebrow">${t("guide")}</span><h3>${t("guideTitle")}</h3><ol><li>${t("guide1")}</li><li>${t("guide2")}</li><li>${t("guide3")}</li></ol></section><section><span class="eyebrow">${t("portfolio")}</span><dl class="settings-grid"><dt>${t("portfolioName")}</dt><dd>${e(state.settings.portfolio_name || "-")}</dd><dt>${t("timezone")}</dt><dd>${e(state.settings.timezone || "-")}</dd><dt>${t("reportingDay")}</dt><dd>${e(state.settings.reporting_weekday || "-")}</dd><dt>${t("freshnessDays")}</dt><dd>${e(state.settings.status_freshness_days || "-")}</dd><dt>${t("capacityPolicy")}</dt><dd>${e(state.settings.resource_capacity_policy || "-")}</dd><dt>${t("decisionPolicy")}</dt><dd>${e(state.settings.decision_policy || "-")}</dd><dt>${t("onboarding")}</dt><dd>${e(state.onboarding?.status || "-")} · v${e(state.onboarding?.version || appConfig.onboarding.version)}</dd><dt>${t("connection")}</dt><dd>${state.demo ? t("demoMode") : "Busabase"}</dd></dl></section>`;
}

function loadMoreButton(key) {
  return state.pagination?.[key]
    ? `<button class="load-more ghost" data-load-more="${key}">${t("loadMore")}</button>`
    : "";
}
async function loadMore(key) {
  if (!state.pagination[key] || state.busy) return;
  state.busy = true;
  try {
    const provider = await getProvider();
    const page = await provider.fetchPage(key, state.pagination[key]);
    state[key].push(...page.rows);
    state.pagination[key] = page.nextCursor;
    state.metrics = computeMetrics(
      state.projects,
      state.milestones,
      state.risks,
      state.reports,
      state.decisions,
      state.generated_at,
    );
    render();
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}

async function saveProject(input, id = "") {
  state.busy = true;
  try {
    if (state.demo) {
      const timestamp = new Date().toISOString();
      const project = {
        id: id || `demo-${Date.now()}`,
        program: "",
        type: "",
        health: "green",
        status: "planning",
        owner: "",
        sponsor: "",
        budget: "",
        progress: 0,
        start_date: "",
        target_date: "",
        last_report_at: "",
        next_report_due: "",
        next_action: "",
        created_at: timestamp,
        updated_at: timestamp,
        ...input,
      };
      const index = state.projects.findIndex((item) => item.id === id);
      if (index >= 0) state.projects[index] = { ...state.projects[index], ...project };
      else state.projects.unshift(project);
      location.hash = `#/projects/${project.id}`;
    } else {
      const provider = await getProvider();
      const project = id ? await provider.updateProject(id, input) : await provider.createProject(input);
      await loadState();
      location.hash = `#/projects/${project.id}`;
    }
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}
async function saveMilestone(id, done) {
  state.busy = true;
  try {
    if (state.demo) {
      const item = state.milestones.find((row) => row.id === id);
      if (item)
        Object.assign(item, {
          status: done ? "done" : "in_progress",
          progress: done ? 100 : Math.min(item.progress, 95),
        });
      render();
    } else {
      await (await getProvider()).markMilestoneDone(id, done);
      await loadState();
    }
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}
async function saveDecision(id, action, note) {
  state.busy = true;
  try {
    if (state.demo) {
      const item = state.decisions.find((row) => row.id === id);
      if (item)
        Object.assign(item, {
          status: { approve: "approved", changes: "changes_requested", block: "blocked" }[action],
          decision_note: note,
          decided_at: new Date().toISOString(),
        });
      render();
    } else {
      await (await getProvider()).saveDecision(id, action, note);
      await loadState();
    }
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}
function showError(error) {
  els.content.insertAdjacentHTML(
    "afterbegin",
    `<div class="error-banner" role="alert">${e(error?.message || error)}</div>`,
  );
}

function viewTitle(view) {
  return (
    {
      overview: t("overview"),
      projects: t("projects"),
      milestones: t("milestones"),
      risks: t("risks"),
      reports: t("reports"),
      decisions: t("decisions"),
      workspace: t("workspace"),
      settings: t("settings"),
    }[view] || t("overview")
  );
}
function renderShell() {
  applyI18n();
  els.title.textContent = viewTitle(state.route.view);
  els.subtitle.textContent = state.settings.portfolio_name || t("appSubtitle");
  els.sync.textContent = state.demo ? t("demoMode") : "Busabase";
  els.mobileViewTitle.textContent = viewTitle(state.route.view);
  els.mobileViewMeta.textContent = state.settings.portfolio_name || t("appSubtitle");
  els.countDecisions.textContent = state.decisions.filter((item) => item.status === "needs_review").length;
  els.countReports.textContent = state.projects.filter(
    (item) => item.next_report_due && new Date(item.next_report_due) < new Date(state.generated_at),
  ).length;
  els.countRisk.textContent = state.risks.filter((item) => item.status !== "closed" && item.impact === "high").length;
  document
    .querySelectorAll("[data-route]")
    .forEach((link) => link.classList.toggle("active", link.dataset.route === state.route.view));
  els.newProjectBtn.hidden = !["projects", "overview"].includes(state.route.view);
}
function render() {
  renderShell();
  if (state.route.view !== "projects") document.body.classList.remove("mobile-detail-open");
  if (state.route.view !== "settings") els.settingsModal.hidden = true;
  (
    ({
      overview: renderOverview,
      projects: renderProjects,
      milestones: renderMilestones,
      risks: renderRisks,
      reports: renderReports,
      decisions: renderDecisions,
      workspace: renderWorkspace,
      settings: renderSettings,
    })[state.route.view] || renderOverview
  )();
  els.content
    .querySelectorAll("[data-load-more]")
    .forEach((button) => button.addEventListener("click", () => loadMore(button.dataset.loadMore)));
}

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  setSidebarOpen(false);
  render();
});
window.addEventListener("resize", syncShell);
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", loadState);
els.mobileRefresh.addEventListener("click", loadState);
els.sidebarToggle.addEventListener("click", () =>
  isMobile()
    ? setSidebarOpen(!document.body.classList.contains("sidebar-open"))
    : setCollapsed(!document.body.classList.contains("sidebar-collapsed")),
);
els.mobileSidebarToggle.addEventListener("click", () => setSidebarOpen(true));
els.sidebarScrim.addEventListener("click", () => setSidebarOpen(false));
els.newProjectBtn.addEventListener("click", () => {
  location.hash = "#/projects/new";
});
els.settingsClose.addEventListener("click", () =>
  history.length > 1 ? history.back() : (location.hash = "#/overview"),
);
els.settingsModal.addEventListener("click", (event) => {
  if (event.target === els.settingsModal) els.settingsClose.click();
});
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-pmo-language", state.lang);
  render();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSidebarOpen(false);
    if (!els.settingsModal.hidden) els.settingsClose.click();
  }
});

syncShell();
async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) return renderSetupRequired(error, boot);
    showError(error);
  }
}
boot();
