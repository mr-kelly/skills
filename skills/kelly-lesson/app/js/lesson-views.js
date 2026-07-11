import {
  checks,
  date,
  decisionFor,
  effectivePlanStatus,
  effectiveReviewStatus,
  els,
  enumLabel,
  escapeHtml,
  filteredChecks,
  filteredPlans,
  filteredReviewItems,
  loadState,
  lockBanner,
  metricCards,
  noticeBanner,
  planById,
  render,
  resultBadge,
  reviewForPlan,
  reviewItems,
  ruleById,
  rules,
  scoreCell,
  severityBadge,
  sourceBadge,
  state,
  statusBadge,
  t,
  teacherById,
  teachers,
  warnings,
} from "../app.js";
export function renderPlans() {
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

export function renderPlanDetail() {
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

export function renderChecks() {
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

export function renderReview() {
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

export function renderSettings() {
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
