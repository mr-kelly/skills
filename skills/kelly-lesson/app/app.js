import { messages } from "./i18n/messages.js";
import { renderChecks, renderPlanDetail, renderPlans, renderReview, renderSettings } from "./js/lesson-views.js";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  reviewFilter: "all",
  checkRuleFilter: "all",
  checkTeacherFilter: "all",
  checkResultFilter: "all",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-lesson-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-lesson.sidebarCollapsed";
const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

export const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
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
  failedCount: document.querySelector("#count-failed"),
  revisionCount: document.querySelector("#count-revision"),
  language: document.querySelector("#language"),
};

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
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

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function normalizeLang(lang) {
  return String(lang || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : lang || "auto";
}

export function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  render();
}

export async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "plans"
      ? "#/plans"
      : scenario === "checks"
        ? "#/checks"
        : scenario === "review"
          ? "#/review"
          : scenario === "detail"
            ? "#/plans/plan-math-linear-eq"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function plans() {
  return state.snapshot?.plans || [];
}

export function checks() {
  return state.snapshot?.checks || [];
}

export function rules() {
  return state.snapshot?.rules || [];
}

export function reviewItems() {
  return state.snapshot?.review_items || [];
}

export function teachers() {
  return state.snapshot?.teachers || [];
}

export function planById(planId) {
  return plans().find((item) => item.plan_id === planId) || null;
}

export function teacherById(teacherId) {
  return teachers().find((item) => item.teacher_id === teacherId) || null;
}

export function ruleById(ruleId) {
  return rules().find((item) => item.rule_id === ruleId) || null;
}

export function reviewForPlan(planId) {
  return reviewItems().find((item) => item.plan_id === planId) || null;
}

export function decisionFor(reviewId) {
  return state.settings?.decisions?.decisions?.[reviewId] || null;
}

// Overlay the recorded human decision onto the item's stored status. This
// mirrors scripts/execute_decisions.ts and scripts/export_plans.ts, which
// both treat any recorded decision as authoritative regardless of when the
// snapshot was last regenerated — a per-item action (approve/block/etc.)
// should never appear "stale" just because run_checks.ts rewrote
// snapshot.generated_at for the whole snapshot (including untouched plans).
export function effectiveReviewStatus(item) {
  const decision = decisionFor(item.review_id);
  if (!decision || !DECISION_STATUS[decision.action]) return item.status;
  return DECISION_STATUS[decision.action];
}

export function effectivePlanStatus(plan) {
  const item = reviewForPlan(plan.plan_id);
  if (!item) return plan.status;
  const decision = decisionFor(item.review_id);
  if (!decision || !DECISION_STATUS[decision.action]) return plan.status;
  return DECISION_STATUS[decision.action];
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const reviewCount = reviewItems().filter((item) => effectiveReviewStatus(item) === "needs_review").length;
  const failedCount = checks().filter((item) => item.result === "fail").length;
  const revisionCount = plans().filter((item) => effectivePlanStatus(item) === "changes_requested").length;
  els.syncStatus.textContent =
    snapshot && plans().length
      ? `${snapshot.school?.name || ""}`.trim() || `${plans().length} ${t("plans")}`
      : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.failedCount) els.failedCount.textContent = failedCount;
  if (els.revisionCount) els.revisionCount.textContent = revisionCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("awaitingReview")}`
      : `${plans().length} ${t("plans")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "plans") return t("plans");
  if (view === "checks") return t("checks");
  if (view === "review") return t("review");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function resultBadge(result) {
  return `<span class="result-badge ${escapeHtml(result)}">${escapeHtml(enumLabel(result, "result"))}</span>`;
}

export function severityBadge(severity) {
  return `<span class="severity-badge ${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

export function sourceBadge(source) {
  return `<span class="source-badge ${escapeHtml(source)}">${escapeHtml(enumLabel(source, "source"))}</span>`;
}

export function scoreCell(score) {
  const value = Number(score || 0);
  const tone = value >= 90 ? "good" : value >= 70 ? "mid" : "low";
  return `<span class="score ${tone}">${value}</span>`;
}

export function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function warnings(planId = "") {
  const items = (state.snapshot?.warnings || []).filter((item) => !planId || !item.plan_id || item.plan_id === planId);
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

export function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  // plans_approved/plans_in_revision come from the last run_checks.ts/ingest
  // pass and are never rewritten by POST /api/decision, so recompute them
  // here from the same effectivePlanStatus() overlay the rest of the page
  // (teacher table, review queue, status badges) already uses — otherwise
  // these cards go stale the instant a dean approves/blocks a plan.
  const approved = plans().filter((item) => ["approved", "done"].includes(effectivePlanStatus(item))).length;
  const inRevision = plans().filter((item) => effectivePlanStatus(item) === "changes_requested").length;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("plansTotal")}</span><strong>${metrics.plan_count || 0}</strong></div>
      <div class="metric"><span>${t("approved")}</span><strong>${approved}</strong></div>
      <div class="metric"><span>${t("inRevision")}</span><strong>${inRevision}</strong></div>
      <div class="metric"><span>${t("passRate")}</span><strong>${metrics.compliance_pass_rate || 0}%</strong></div>
    </div>
  `;
}

export function filteredPlans() {
  const query = state.query.trim().toLowerCase();
  if (!query) return plans();
  return plans().filter((item) =>
    [
      item.title,
      item.subject,
      item.grade,
      item.unit,
      item.source,
      effectivePlanStatus(item),
      teacherById(item.teacher_id)?.name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function filteredChecks() {
  const query = state.query.trim().toLowerCase();
  return checks().filter((item) => {
    if (state.checkRuleFilter !== "all" && item.rule_id !== state.checkRuleFilter) return false;
    const plan = planById(item.plan_id);
    if (state.checkTeacherFilter !== "all" && plan?.teacher_id !== state.checkTeacherFilter) return false;
    if (state.checkResultFilter !== "all" && item.result !== state.checkResultFilter) return false;
    if (!query) return true;
    return [ruleById(item.rule_id)?.name, item.evidence, item.result, plan?.title, teacherById(plan?.teacher_id)?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

export function filteredReviewItems() {
  const query = state.query.trim().toLowerCase();
  return reviewItems().filter((item) => {
    const status = effectiveReviewStatus(item);
    if (state.reviewFilter !== "all" && status !== state.reviewFilter) return false;
    if (!query) return true;
    const plan = planById(item.plan_id);
    return [
      plan?.title,
      plan?.subject,
      plan?.grade,
      item.compliance_summary,
      item.feedback_draft,
      status,
      teacherById(plan?.teacher_id)?.name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function configOrdered(values, configured = []) {
  const collator = new Intl.Collator(activeLang() === "zh" ? "zh-Hans" : "en", { numeric: true });
  return [...new Set(values)].sort((a, b) => {
    const ai = configured.indexOf(a);
    const bi = configured.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? configured.length : ai) - (bi === -1 ? configured.length : bi);
    return collator.compare(a, b);
  });
}

function coverageTable() {
  const summary = state.settings?.config_summary || {};
  const grades = configOrdered(
    plans().map((item) => item.grade),
    summary.grades,
  );
  const subjects = configOrdered(
    plans().map((item) => item.subject),
    summary.subjects,
  );
  if (!grades.length) return `<div class="empty-inline">${t("noPlans")}</div>`;
  return `
    <div class="coverage-grid">
      <table>
        <thead>
          <tr><th>${t("subject")}</th>${grades.map((grade) => `<th>${escapeHtml(grade)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${subjects
            .map(
              (subject) => `
            <tr>
              <td class="strong">${escapeHtml(subject)}</td>
              ${grades
                .map((grade) => {
                  const count = plans().filter((item) => item.subject === subject && item.grade === grade).length;
                  return `<td><span class="coverage-count ${count ? "" : "zero"}">${count}</span></td>`;
                })
                .join("")}
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${state.snapshot.school?.name || ""} · ${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const awaiting = reviewItems().filter((item) => effectiveReviewStatus(item) === "needs_review");
  const activity = (state.snapshot?.activity_log || [])
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8);
  const teacherRows = teachers().map((teacher) => {
    const own = plans().filter((item) => item.teacher_id === teacher.teacher_id);
    const approved = own.filter((item) => ["approved", "done"].includes(effectivePlanStatus(item))).length;
    const revision = own.filter((item) => effectivePlanStatus(item) === "changes_requested").length;
    const needsReview = own.filter((item) => effectivePlanStatus(item) === "needs_review").length;
    const avg = own.length
      ? Math.round(own.reduce((sum, item) => sum + Number(item.compliance_score || 0), 0) / own.length)
      : 0;
    return { teacher, own, approved, revision, needsReview, avg };
  });
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("coverage")}</h2>
        ${coverageTable()}
      </div>
      <div class="overview-panel">
        <h2>${t("reviewQueue")}</h2>
        ${
          awaiting
            .map((item) => {
              const plan = planById(item.plan_id);
              return `
            <a class="due-row" href="#/review">
              <span><strong>${t("planRef")} #${item.ref} · ${escapeHtml(plan?.title || item.plan_id)}</strong><small>${escapeHtml(item.compliance_summary || "")}</small></span>
              <span class="due-meta">${statusBadge(effectiveReviewStatus(item))}${plan ? `<small>${scoreCell(plan.compliance_score)}</small>` : ""}</span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noReviewItems")}</div>`
        }
      </div>
      <div class="overview-panel wide">
        <h2>${t("teacherStatus")}</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>${t("teacher")}</th><th>${t("subject")}</th><th>${t("grades")}</th><th>${t("plans")}</th><th>${t("approved")}</th><th>${t("inRevision")}</th><th>${t("status")}</th><th>${t("avgScore")}</th></tr>
            </thead>
            <tbody>
              ${teacherRows
                .map(
                  ({ teacher, own, approved, revision, needsReview, avg }) => `
                <tr>
                  <td class="strong">${escapeHtml(teacher.name)}</td>
                  <td>${escapeHtml(teacher.subject)}</td>
                  <td>${(teacher.grades || []).map((grade) => `<span class="tag">${escapeHtml(grade)}</span>`).join(" ")}</td>
                  <td>${own.length}</td>
                  <td>${approved}</td>
                  <td>${revision}</td>
                  <td>${statusBadge(needsReview ? "needs_review" : revision ? "changes_requested" : "done")}</td>
                  <td>${scoreCell(avg)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="overview-panel wide">
        <h2>${t("recentActivity")}</h2>
        ${
          activity
            .map(
              (item) => `
          <div class="activity-row">
            <span class="badge">${escapeHtml(enumLabel(item.actor, "actor"))}</span>
            <span><small>${escapeHtml(item.detail)}</small></span>
            <span class="muted">${date(item.at)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noActivity")}</div>`
        }
      </div>
    </section>
  `;
}

export function render() {
  renderShell();
  if (state.route.view === "plans" && state.route.id) renderPlanDetail();
  else if (state.route.view === "plans") renderPlans();
  else if (state.route.view === "checks") renderChecks();
  else if (state.route.view === "review") renderReview();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
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

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-lesson-language", state.lang);
  if (state.demo) {
    loadState().catch(() => render());
    return;
  }
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
