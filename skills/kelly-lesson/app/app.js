import { messages } from "./i18n/messages.js";

const state = {
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

const els = {
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

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  render();
}

async function loadState() {
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

function checks() {
  return state.snapshot?.checks || [];
}

function rules() {
  return state.snapshot?.rules || [];
}

function reviewItems() {
  return state.snapshot?.review_items || [];
}

function teachers() {
  return state.snapshot?.teachers || [];
}

function planById(planId) {
  return plans().find((item) => item.plan_id === planId) || null;
}

function teacherById(teacherId) {
  return teachers().find((item) => item.teacher_id === teacherId) || null;
}

function ruleById(ruleId) {
  return rules().find((item) => item.rule_id === ruleId) || null;
}

function reviewForPlan(planId) {
  return reviewItems().find((item) => item.plan_id === planId) || null;
}

function decisionFor(reviewId) {
  return state.settings?.decisions?.decisions?.[reviewId] || null;
}

function effectiveReviewStatus(item) {
  const decision = decisionFor(item.review_id);
  if (!decision) return item.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return item.status;
}

function effectivePlanStatus(plan) {
  const item = reviewForPlan(plan.plan_id);
  if (!item) return plan.status;
  const decision = decisionFor(item.review_id);
  if (!decision) return plan.status;
  const generatedAt = Date.parse(state.snapshot?.generated_at || 0) || 0;
  const decidedAt = Date.parse(decision.decided_at || 0) || 0;
  if (decidedAt >= generatedAt && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  return plan.status;
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

function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function resultBadge(result) {
  return `<span class="result-badge ${escapeHtml(result)}">${escapeHtml(enumLabel(result, "result"))}</span>`;
}

function severityBadge(severity) {
  return `<span class="severity-badge ${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

function sourceBadge(source) {
  return `<span class="source-badge ${escapeHtml(source)}">${escapeHtml(enumLabel(source, "source"))}</span>`;
}

function scoreCell(score) {
  const value = Number(score || 0);
  const tone = value >= 90 ? "good" : value >= 70 ? "mid" : "low";
  return `<span class="score ${tone}">${value}</span>`;
}

function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

function warnings(planId = "") {
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

function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  return `
    <div class="metrics">
      <div class="metric"><span>${t("plansTotal")}</span><strong>${metrics.plan_count || 0}</strong></div>
      <div class="metric"><span>${t("approved")}</span><strong>${metrics.plans_approved || 0}</strong></div>
      <div class="metric"><span>${t("inRevision")}</span><strong>${metrics.plans_in_revision || 0}</strong></div>
      <div class="metric"><span>${t("passRate")}</span><strong>${metrics.compliance_pass_rate || 0}%</strong></div>
    </div>
  `;
}

function filteredPlans() {
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

function filteredChecks() {
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

function filteredReviewItems() {
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

function renderPlans() {
  els.title.textContent = t("plans");
  const items = filteredPlans();
  els.subtitle.textContent = `${items.length} ${t("plans")} · ${state.snapshot?.school?.name || ""}`;
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    ${
      items.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("plan")}</th><th>${t("subject")}</th><th>${t("grade")}</th><th>${t("unit")}</th><th>${t("teacher")}</th><th>${t("source")}</th><th>${t("score")}</th><th>${t("status")}</th><th>${t("lastUpdated")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
              <tr>
                <td><a href="#/plans/${encodeURIComponent(item.plan_id)}"><span class="strong">${t("planRef")} #${item.ref} · ${escapeHtml(item.title)}</span></a></td>
                <td>${escapeHtml(item.subject)}</td>
                <td>${escapeHtml(item.grade)}</td>
                <td>${escapeHtml(item.unit || "")}</td>
                <td>${escapeHtml(teacherById(item.teacher_id)?.name || "")}</td>
                <td>${sourceBadge(item.source)}</td>
                <td>${scoreCell(item.compliance_score)}</td>
                <td>${statusBadge(effectivePlanStatus(item))}</td>
                <td>${date(item.updated_at)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("noPlans")}</div>`
    }
  `;
}

function sectionList(title, values) {
  if (!values?.length) return "";
  return `
    <div class="section-block">
      <h2>${title}</h2>
      <ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
    </div>
  `;
}

function sectionText(title, value) {
  if (!value) return "";
  return `
    <div class="section-block">
      <h2>${title}</h2>
      <p>${escapeHtml(value)}</p>
    </div>
  `;
}

function renderPlanDetail() {
  const plan = planById(state.route.id);
  if (!plan) {
    renderPlans();
    return;
  }
  const sections = plan.sections || {};
  const planChecks = checks().filter((item) => item.plan_id === plan.plan_id);
  const review = reviewForPlan(plan.plan_id);
  const teacher = teacherById(plan.teacher_id);
  const locked = Boolean(state.settings?.lock);
  const noteValue = state.edits[`note:${plan.plan_id}`] ?? plan.notes ?? "";
  els.title.textContent = `${t("planRef")} #${plan.ref} · ${plan.title}`;
  els.subtitle.textContent = `${plan.subject} · ${plan.grade} · ${teacher?.name || ""} · ${enumLabel(effectivePlanStatus(plan))}`;
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings(plan.plan_id)}
    <section class="detail">
      <div class="detail-main">
        ${sectionList(t("objectives"), sections.objectives)}
        ${sectionList(t("keyPoints"), [...(sections.key_points || []), ...(sections.difficulties || [])])}
        ${sectionList(t("materials"), sections.materials)}
        ${
          sections.stages?.length
            ? `
          <div class="section-block">
            <h2>${t("lessonFlow")}</h2>
            <div class="stage-table table-wrap">
              <table>
                <thead><tr><th>${t("stage")}</th><th>${t("minutes")}</th><th>${t("activities")}</th></tr></thead>
                <tbody>
                  ${sections.stages
                    .map(
                      (item) => `
                    <tr>
                      <td class="strong">${escapeHtml(item.name)}</td>
                      <td class="num">${Number(item.minutes || 0) || "—"}</td>
                      <td>${escapeHtml(item.activities || "")}</td>
                    </tr>
                  `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
        `
            : ""
        }
        ${sectionText(t("boardPlan"), sections.board_plan)}
        ${sectionText(t("homework"), sections.homework)}
        ${sectionText(t("safetyNotes"), sections.safety_notes)}
        ${sectionText(t("reflection"), sections.reflection)}
        ${sectionList(t("curriculumRefs"), sections.curriculum_refs)}
      </div>
      <aside class="detail-side">
        <div>
          <h2>${t("planDetail")}</h2>
          <dl>
            <dt>${t("status")}</dt><dd>${statusBadge(effectivePlanStatus(plan))}</dd>
            <dt>${t("score")}</dt><dd>${scoreCell(plan.compliance_score)}</dd>
            <dt>${t("source")}</dt><dd>${sourceBadge(plan.source)}</dd>
            <dt>${t("teacher")}</dt><dd>${escapeHtml(teacher?.name || "")}</dd>
            <dt>${t("unit")}</dt><dd>${escapeHtml(plan.unit || "")}</dd>
            <dt>${t("duration")}</dt><dd>${plan.duration_minutes || 0} / ${plan.class_length_minutes || 45} ${t("min")}</dd>
            <dt>${t("lastUpdated")}</dt><dd>${date(plan.updated_at)}</dd>
          </dl>
        </div>
        <div>
          <h2>${t("complianceChecks")}</h2>
          ${
            planChecks
              .map(
                (item) => `
            <div class="check-row">
              ${resultBadge(item.result)}
              <span>
                <strong>${escapeHtml(ruleById(item.rule_id)?.name || item.rule_id)}</strong>
                <small>${escapeHtml(item.evidence || "")}</small>
              </span>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noChecks")}</div>`
          }
        </div>
        <div class="notes-panel">
          <h2>${t("editNotes")}</h2>
          <textarea id="planNote" rows="3" data-plan="${escapeHtml(plan.plan_id)}" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${locked || !review ? "disabled" : ""}>${escapeHtml(noteValue)}</textarea>
          <div class="notes-actions">
            <button id="saveNote" type="button" ${locked || !review ? "disabled" : ""}>${t("saveNote")}</button>
            <span class="muted">${t("notesHint")}</span>
          </div>
        </div>
      </aside>
    </section>
  `;
  const noteField = els.content.querySelector("#planNote");
  noteField?.addEventListener("input", () => {
    state.edits[`note:${plan.plan_id}`] = noteField.value;
  });
  els.content.querySelector("#saveNote")?.addEventListener("click", () => {
    if (!review) return;
    submitDecision(review.review_id, "revise", { comment: noteField?.value ?? "" });
  });
}

function renderChecks() {
  els.title.textContent = t("checks");
  const items = filteredChecks();
  const all = checks();
  const passCount = all.filter((item) => item.result === "pass").length;
  const warnCount = all.filter((item) => item.result === "warn").length;
  const failCount = all.filter((item) => item.result === "fail").length;
  els.subtitle.textContent = `${all.length} ${t("checksTotal")} · ${failCount} ${t("failedChecks")}`;
  els.content.innerHTML = `
    ${warnings()}
    <div class="metrics">
      <div class="metric"><span>${t("checks")}</span><strong>${all.length}</strong></div>
      <div class="metric"><span>${enumLabel("pass", "result")}</span><strong>${passCount}</strong></div>
      <div class="metric"><span>${enumLabel("warn", "result")}</span><strong>${warnCount}</strong></div>
      <div class="metric"><span>${enumLabel("fail", "result")}</span><strong>${failCount}</strong></div>
    </div>
    <div class="check-filters">
      <select id="ruleFilter" aria-label="${t("rule")}">
        <option value="all">${t("all")} · ${t("rule")}</option>
        ${rules()
          .map(
            (rule) =>
              `<option value="${escapeHtml(rule.rule_id)}" ${state.checkRuleFilter === rule.rule_id ? "selected" : ""}>${escapeHtml(rule.name)}</option>`,
          )
          .join("")}
      </select>
      <select id="teacherFilter" aria-label="${t("teacher")}">
        <option value="all">${t("all")} · ${t("teacher")}</option>
        ${teachers()
          .map(
            (teacher) =>
              `<option value="${escapeHtml(teacher.teacher_id)}" ${state.checkTeacherFilter === teacher.teacher_id ? "selected" : ""}>${escapeHtml(teacher.name)}</option>`,
          )
          .join("")}
      </select>
      <select id="resultFilter" aria-label="${t("result")}">
        <option value="all">${t("all")} · ${t("result")}</option>
        ${["pass", "warn", "fail", "agent_review"].map((result) => `<option value="${result}" ${state.checkResultFilter === result ? "selected" : ""}>${escapeHtml(enumLabel(result, "result"))}</option>`).join("")}
      </select>
    </div>
    ${
      items.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("plan")}</th><th>${t("teacher")}</th><th>${t("rule")}</th><th>${t("severity")}</th><th>${t("result")}</th><th>${t("evidence")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const plan = planById(item.plan_id);
                const rule = ruleById(item.rule_id);
                return `
                <tr>
                  <td><a href="#/plans/${encodeURIComponent(item.plan_id)}"><span class="strong">${t("planRef")} #${plan?.ref || ""} · ${escapeHtml(plan?.title || item.plan_id)}</span></a></td>
                  <td>${escapeHtml(teacherById(plan?.teacher_id)?.name || "")}</td>
                  <td>${escapeHtml(rule?.name || item.rule_id)}</td>
                  <td>${severityBadge(item.severity)}</td>
                  <td>${resultBadge(item.result)}</td>
                  <td>${escapeHtml(item.evidence || "")}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("noChecks")}</div>`
    }
  `;
  els.content.querySelector("#ruleFilter")?.addEventListener("change", (event) => {
    state.checkRuleFilter = event.target.value;
    render();
  });
  els.content.querySelector("#teacherFilter")?.addEventListener("change", (event) => {
    state.checkTeacherFilter = event.target.value;
    render();
  });
  els.content.querySelector("#resultFilter")?.addEventListener("change", (event) => {
    state.checkResultFilter = event.target.value;
    render();
  });
}

function reviewFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count =
            value === "all"
              ? reviewItems().length
              : reviewItems().filter((item) => effectiveReviewStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.reviewFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

function renderReview() {
  els.title.textContent = t("review");
  const items = filteredReviewItems();
  const reviewCount = reviewItems().filter((item) => effectiveReviewStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("awaitingReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${reviewFilters()}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveReviewStatus(item);
            const plan = planById(item.plan_id);
            const teacher = teacherById(plan?.teacher_id);
            const decision = decisionFor(item.review_id);
            const edits = state.edits[item.review_id] || {};
            const draft = edits.draft ?? decision?.draft ?? item.feedback_draft ?? "";
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-review="${escapeHtml(item.review_id)}">
            <header class="queue-head">
              <span class="queue-ref">${t("planRef")} #${item.ref}</span>
              ${statusBadge(status)}
              ${plan ? sourceBadge(plan.source) : ""}
              <span class="queue-score muted">${t("score")} ${plan ? scoreCell(plan.compliance_score) : ""}</span>
            </header>
            <div class="queue-meta">
              ${plan ? `<a href="#/plans/${encodeURIComponent(plan.plan_id)}">${escapeHtml(plan.title)}</a> · ${escapeHtml(plan.subject)} · ${escapeHtml(plan.grade)}` : escapeHtml(item.plan_id)}
              ${teacher ? ` · ${escapeHtml(teacher.name)}` : ""}
            </div>
            <p class="queue-summary"><span class="muted">${t("complianceSummary")}:</span> ${escapeHtml(item.compliance_summary || "")}</p>
            ${
              item.suggestions?.length
                ? `
              <span class="queue-label">${t("suggestions")}</span>
              <ul class="queue-suggestions">${item.suggestions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
            `
                : ""
            }
            <label class="queue-label">${t("feedbackDraft")}</label>
            <textarea class="queue-draft" data-field="draft" rows="7" ${disabled}>${escapeHtml(draft)}</textarea>
            <label class="queue-label">${t("reviewNote")}</label>
            <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${decision ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noReviewItems")}</div>`
      }
    </div>
  `;
  bindReviewEvents();
}

function bindReviewEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.reviewFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.review;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      const draft = card.querySelector('[data-field="draft"]')?.value ?? "";
      const note = card.querySelector('[data-field="note"]')?.value ?? "";
      submitDecision(card.dataset.review, button.dataset.action, { comment: note, draft });
    });
  });
}

async function submitDecision(reviewId, action, { comment = "", draft } = {}) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const body = { review_id: reviewId, action, comment };
  if (draft !== undefined) body.draft = draft;
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = payload.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[reviewId];
  state.notice = t("saved");
  await loadState();
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const school = summary.school || {};
  const exportPrefs = summary.export || {};
  const feedback = summary.feedback || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("school")}</h2>
        <dl>
          <dt>${t("schoolName")}</dt><dd>${escapeHtml(school.name || "")}</dd>
          <dt>${t("kind")}</dt><dd>${escapeHtml(enumLabel(school.kind, "kind"))}</dd>
          <dt>${t("term")}</dt><dd>${escapeHtml(school.term || "")}</dd>
          <dt>${t("classLength")}</dt><dd>${school.class_length_minutes || 45} ${t("min")}</dd>
        </dl>
        <div class="chip-list">${(summary.subjects || []).map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join("")}</div>
        <div class="chip-list">${(summary.grades || []).map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join("")}</div>
      </section>
      <section>
        <h2>${t("templateSections")}</h2>
        ${
          (summary.template_sections || [])
            .map(
              (section) => `
          <div class="settings-row">
            <strong>${escapeHtml(section.label)}</strong>
            <span class="muted">${escapeHtml(section.key)}</span>
            <span>${section.required ? `<span class="tag">${t("required")}</span>` : ""}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("complianceRules")}</h2>
        ${
          (summary.compliance_rules || [])
            .map(
              (rule) => `
          <div class="settings-row">
            <strong>${escapeHtml(rule.name)}</strong>
            <span>${severityBadge(rule.severity)}</span>
            <span class="muted">${escapeHtml(enumLabel(rule.type, "type"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("exportPrefs")}</h2>
        <dl>
          <dt>${t("format")}</dt><dd>${escapeHtml(exportPrefs.format || "markdown")}</dd>
          <dt>${t("outDir")}</dt><dd>${escapeHtml(exportPrefs.out_dir || "exports")}</dd>
          <dt>${t("docxViaAgent")}</dt><dd>${exportPrefs.docx_via_agent ? t("yes") : t("no")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("feedbackHandoff")}</h2>
        <dl>
          <dt>${t("handoffSkill")}</dt><dd>${escapeHtml(feedback.handoff_skill || "")}</dd>
          <dt>${t("requiresApproval")}</dt><dd>${feedback.requires_approval ? t("yes") : t("no")}</dd>
        </dl>
        ${
          (feedback.secret_envs || []).length
            ? `
          <div class="settings-row">
            <strong>${(feedback.secret_envs || []).join(", ")}</strong>
            <span></span>
            <span class="${feedback.secrets_ready ? "ok" : "warn"}">${feedback.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `
            : ""
        }
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "plans" && state.route.id) renderPlanDetail();
  else if (state.route.view === "plans") renderPlans();
  else if (state.route.view === "checks") renderChecks();
  else if (state.route.view === "review") renderReview();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

function escapeHtml(value) {
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
