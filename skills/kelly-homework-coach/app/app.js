import { messages, resolveLanguage } from "./i18n/messages.js";

const app = document.getElementById("app");
const scrim = document.getElementById("sidebarScrim");
const state = {
  data: null,
  route: parseRoute(),
  lang: resolveLanguage(),
  query: "",
  filter: "all",
  settingsTab: "guide",
  localPhotoName: "",
  busy: false,
};

function t(key) {
  return messages[state.lang]?.[key] || messages.en[key] || key;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [view = "student", id = ""] = hash.split("/");
  const allowed = new Set(["student", "mistakes", "papers", "review", "settings"]);
  return { view: allowed.has(view) ? view : "student", id };
}

function routeTo(view, id = "") {
  window.location.hash = `#/${view}${id ? `/${id}` : ""}`;
}

function apiPath(path) {
  return `${path}${window.location.search || ""}`;
}

function isMobile() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  if (scrim) scrim.hidden = !open;
}

function setMobileDetailOpen(open) {
  document.body.classList.toggle("mobile-detail-open", Boolean(open && isMobile()));
}

function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  return ["TEXTAREA", "INPUT", "SELECT"].includes(active.tagName) && active.type !== "search";
}

async function loadState({ quiet = false } = {}) {
  if (isEditing() && quiet) return;
  try {
    const response = await fetch(apiPath("/api/state"), { cache: "no-store" });
    state.data = await response.json();
    render();
  } catch (error) {
    app.innerHTML = `<main class="setup"><section class="setup-panel"><h1>Kelly Homework Coach</h1><p class="note">${esc(error.message)}</p></section></main>`;
  }
}

function statusChip(status) {
  const map = {
    needs_review: ["warn", t("needsReview")],
    changes_requested: ["warn", t("requestChanges")],
    approved: ["accent", t("ready")],
    done: ["ok", t("done")],
    blocked: ["bad", t("blocked")],
  };
  const [kind, label] = map[status] || ["", status];
  return `<span class="chip ${kind}">${esc(label)}</span>`;
}

function outcomeChip(outcome) {
  const map = {
    correct: ["ok", t("correct")],
    wrong: ["bad", t("wrong")],
    uncertain: ["warn", t("uncertain")],
    in_progress: ["accent", t("inProgress")],
  };
  const [kind, label] = map[outcome] || ["", outcome];
  return `<span class="chip ${kind}">${esc(label)}</span>`;
}

function render() {
  if (!state.data) return;
  state.lang = resolveLanguage();
  state.route = parseRoute();
  if (!state.data.demo && state.data.setup?.state !== "ready") {
    renderSetup();
    return;
  }
  renderShell();
}

function renderSetup() {
  const setup = state.data.setup || {};
  const config = state.data.config_summary || {};
  const prompt = [
    "/kelly-homework-coach Help me configure this app.",
    `Provider: ${setup.provider || "not selected"}.`,
    `Non-secret config: ${setup.recommended_config || "~/.config/kelly-homework-coach/config.json"}.`,
    `Example config: ${setup.example_config || "skills/kelly-homework-coach/config.example.json"}.`,
    "Do not ask me to paste passwords, API keys, cookies, or student private files into chat.",
    "Set up grade, subjects, answer policy, photo-retention policy, practice-paper defaults, and export preferences.",
  ].join("\n");
  app.className = "";
  app.innerHTML = `
    <main class="setup">
      <section class="setup-panel">
        <div>
          <h1>${esc(t("setupTitle"))}</h1>
          <p class="note">${esc(t("setupCopy"))}</p>
        </div>
        <div class="provider-grid">
          ${providerCard("local", t("local"), t("localCopy"), setup.provider === "local" && setup.provider_selected)}
          ${providerCard("busabase", t("busabase"), t("busabaseCopy"), setup.provider === "busabase" && setup.provider_selected)}
        </div>
        <div class="split">
          <section class="settings-card">
            <h3>${esc(t("checklist"))}</h3>
            ${checkRow(t("providerSelected"), Boolean(setup.provider_selected))}
            ${checkRow(t("config"), Boolean(config.config_path && !config.is_example))}
            ${checkRow(t("onboarding"), Boolean(state.data.onboarding?.completed))}
          </section>
          <section class="settings-card">
            <h3>${esc(t("language"))}</h3>
            ${languagePicker()}
            <button class="plain" data-complete-onboarding type="button">${esc(t("completeDemoSetup"))}</button>
            <p class="note">${esc(config.is_example ? "Create a private config before normal workflow opens." : "Private config detected.")}</p>
          </section>
        </div>
        <section class="settings-card">
          <h3>${esc(t("copyPrompt"))}</h3>
          <pre class="prompt-box" id="setupPrompt">${esc(prompt)}</pre>
          <button class="primary" data-copy="#setupPrompt" type="button">${esc(t("copyPrompt"))}</button>
        </section>
      </section>
    </main>
  `;
}

function providerCard(provider, title, copy, selected) {
  return `
    <section class="provider-card">
      <div class="chips">${selected ? '<span class="chip ok">Selected</span>' : ""}</div>
      <h3>${esc(title)}</h3>
      <p class="note">${esc(copy)}</p>
      <button class="${selected ? "plain" : "primary"}" data-select-provider="${esc(provider)}" type="button">${esc(t("choose"))}</button>
    </section>
  `;
}

function checkRow(label, ok) {
  return `<div class="check-row"><span class="check-dot ${ok ? "ok" : ""}"></span><span>${esc(label)}</span></div>`;
}

function renderShell() {
  const snapshot = state.data.snapshot || {};
  const counts = statusCounts(snapshot.review_items || []);
  const mobileTitle = navLabel(state.route.view);
  app.className = "app-shell";
  app.innerHTML = `
    ${renderSidebar(snapshot, counts)}
    <main class="main">
      <div class="mobile-topbar">
        <button class="mobile-sidebar-toggle" data-open-sidebar type="button" aria-label="Open sidebar"><span class="panel-icon"></span></button>
        <div class="mobile-title">${esc(mobileTitle)}</div>
        <button class="icon-button" data-open-settings type="button" aria-label="${esc(t("settings"))}">...</button>
      </div>
      <section class="content">
        ${renderListPanel(snapshot)}
        ${renderDetailPanel(snapshot)}
      </section>
    </main>
    ${state.route.view === "settings" ? renderSettingsModal() : ""}
  `;
  setMobileDetailOpen(Boolean(state.route.id));
}

function renderSidebar(snapshot, counts) {
  const metrics = snapshot.metrics || {};
  return `
    <aside class="sidebar" id="appSidebar">
      <div class="brand">
        <div class="brand-icon">HC</div>
        <div class="brand-copy">
          <div class="brand-title">${esc(t("appTitle"))}</div>
          <div class="brand-subtitle">${esc(t("appSubtitle"))}</div>
        </div>
        <button class="sidebar-toggle" data-toggle-sidebar type="button" aria-label="Toggle sidebar"><span class="panel-icon"></span></button>
      </div>
      <section class="human-work">
        <strong>${esc(t("humanWork"))}</strong>
        <div class="attention-grid">
          <div class="attention-metric"><b>${counts.needs_review + counts.changes_requested}</b><span>${esc(t("needsReview"))}</span></div>
          <div class="attention-metric"><b>${counts.approved}</b><span>${esc(t("readyForAgent"))}</span></div>
          <div class="attention-metric"><b>${metrics.due_reviews || 0}</b><span>${esc(t("dueReviews"))}</span></div>
          <div class="attention-metric"><b>${counts.blocked}</b><span>${esc(t("blockedCount"))}</span></div>
        </div>
      </section>
      <nav class="nav">
        ${navButton("student", t("student"), snapshot.questions?.length || 0)}
        ${navButton("mistakes", t("mistakes"), snapshot.mistakes?.length || 0)}
        ${navButton("papers", t("papers"), snapshot.papers?.length || 0)}
        ${navButton("review", t("review"), snapshot.review_items?.length || 0)}
      </nav>
      <div class="filter">
        ${filterButton("all", t("all"), (snapshot.review_items || []).length)}
        ${filterButton("needs_review", t("needsReview"), counts.needs_review)}
        ${filterButton("approved", t("ready"), counts.approved)}
        ${filterButton("done", t("done"), counts.done)}
        ${filterButton("blocked", t("blocked"), counts.blocked)}
      </div>
      <div class="sidebar-footer">
        <button class="plain" data-route="settings" type="button"><span>${esc(t("settings"))}</span></button>
      </div>
    </aside>
  `;
}

function navButton(view, label, count) {
  const active = state.route.view === view ? "active" : "";
  return `<button class="${active}" data-route="${view}" type="button"><span>${esc(label)}</span><small>${count}</small></button>`;
}

function filterButton(filter, label, count) {
  const active = state.filter === filter ? "active" : "";
  return `<button class="${active}" data-filter="${filter}" type="button"><span>${esc(label)}</span><small>${count}</small></button>`;
}

function statusCounts(items) {
  return items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { needs_review: 0, changes_requested: 0, approved: 0, done: 0, blocked: 0 },
  );
}

function navLabel(view) {
  return (
    {
      student: t("student"),
      mistakes: t("mistakes"),
      papers: t("papers"),
      review: t("review"),
      settings: t("settings"),
    }[view] || t("student")
  );
}

function collectionFor(snapshot, view = state.route.view) {
  if (view === "mistakes") return snapshot.mistakes || [];
  if (view === "papers") return snapshot.papers || [];
  if (view === "review") return snapshot.review_items || [];
  return snapshot.questions || [];
}

function idFor(item, view = state.route.view) {
  if (!item) return "";
  if (view === "mistakes") return item.mistake_id;
  if (view === "papers") return item.paper_id;
  if (view === "review") return item.review_id;
  return item.question_id;
}

function filteredItems(snapshot) {
  let items = collectionFor(snapshot);
  if (state.route.view === "review" && state.filter !== "all") {
    items = items.filter((item) => item.status === state.filter);
  }
  const query = state.query.trim().toLowerCase();
  if (query) {
    items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  }
  return items;
}

function selectedItem(snapshot) {
  const view = state.route.view === "settings" ? "student" : state.route.view;
  const items = collectionFor(snapshot, view);
  return items.find((item) => idFor(item, view) === state.route.id) || items[0] || null;
}

function renderListPanel(snapshot) {
  const view = state.route.view === "settings" ? "student" : state.route.view;
  const items = filteredItems(snapshot);
  const metrics = snapshot.metrics || {};
  const showMetrics = view === "student";
  return `
    <section class="list-panel">
      <div class="panel-header">
        <div class="panel-title">
          <div>
            <h1>${esc(navLabel(view))}</h1>
            <p>${esc(snapshot.profile?.display_name || "Student")} · ${esc(snapshot.profile?.grade || "")}</p>
          </div>
          ${state.data.lock ? `<span class="chip warn">${esc(t("locked"))}</span>` : ""}
        </div>
        <input class="search" type="search" value="${esc(state.query)}" data-search placeholder="${esc(t("search"))}" />
      </div>
      ${
        showMetrics
          ? `<div class="metric-grid">
              ${metric(t("mastery"), `${metrics.mastery_score || 0}%`)}
              ${metric(t("dueReviews"), metrics.due_reviews || 0)}
              ${metric(t("analyzed"), metrics.questions_analyzed || 0)}
              ${metric(t("activeQuestions"), metrics.active_questions || 0)}
            </div>
            <div class="section" style="padding: 0 16px 14px;">${renderPhotoBox()}</div>`
          : ""
      }
      <div class="row-list">
        ${items.length ? items.map((item) => renderRow(item, view)).join("") : `<div class="note" style="padding:16px;">${esc(t("noItems"))}</div>`}
      </div>
    </section>
  `;
}

function metric(label, value) {
  return `<div class="metric"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

function renderPhotoBox() {
  return `
    <div class="photo-box">
      <div class="row-top">
        <strong>${esc(t("photoDesk"))}</strong>
        <span class="chip accent">${esc(t("selectedOnly"))}</span>
      </div>
      <input type="file" accept="image/*" data-local-photo />
      <p class="note">${esc(state.localPhotoName || t("localPhoto"))}</p>
      <button class="primary" data-copy-prompt="photo" type="button">${esc(t("askAgent"))}</button>
    </div>
  `;
}

function renderRow(item, view) {
  const id = idFor(item, view);
  const active = state.route.id === id || (!state.route.id && selectedItem(state.data.snapshot) === item);
  const title = item.title;
  const summary = item.summary || item.prompt_text || item.analysis?.root_cause || item.analysis?.deep_notes || "";
  let chips = statusChip(item.status);
  if (view === "student") chips += outcomeChip(item.outcome);
  if (view === "mistakes") chips += `<span class="chip">${esc(item.topic)}</span>`;
  if (view === "papers") chips += `<span class="chip">${esc(item.question_count)} ${esc(t("questionCount"))}</span>`;
  if (view === "review") chips += `<span class="chip">${esc(item.proposed_action)}</span>`;
  return `
    <button class="row ${active ? "active" : ""}" data-select-id="${esc(id)}" data-select-view="${esc(view)}" type="button">
      <div class="row-top">
        <div class="row-title">${esc(refLabel(view, item.ref))} · ${esc(title)}</div>
      </div>
      <div class="row-summary">${esc(summary)}</div>
      <div class="chips">${chips}</div>
    </button>
  `;
}

function refLabel(view, ref) {
  if (view === "mistakes") return `${t("mistakeRef")} #${ref}`;
  if (view === "papers") return `${t("paperRef")} #${ref}`;
  if (view === "review") return `${t("reviewRef")} #${ref}`;
  return `${t("questionRef")} #${ref}`;
}

function renderDetailPanel(snapshot) {
  const view = state.route.view === "settings" ? "student" : state.route.view;
  const item = selectedItem(snapshot);
  return `
    <aside class="detail-panel">
      <div class="detail-actions-top">
        <button class="plain back-to-list" data-back-list type="button">${esc(t("back"))}</button>
        ${view === "review" && item ? reviewActions(item) : studentActions(view, item)}
      </div>
      <div class="detail-scroll">
        ${item ? renderDetail(item, view, snapshot) : `<p class="note">${esc(t("noItems"))}</p>`}
      </div>
    </aside>
  `;
}

function studentActions(view, item) {
  if (!item) return "";
  if (view === "student") {
    return `
      <button class="primary" data-understand="${esc(item.question_id)}" type="button">${esc(t("iUnderstand"))}</button>
      <button class="plain" data-need-help="${esc(item.question_id)}" type="button">${esc(t("stillNeedHelp"))}</button>
    `;
  }
  if (view === "papers")
    return `<button class="primary" data-route="review" type="button">${esc(t("review"))}</button>`;
  return `<button class="plain" data-route="review" type="button">${esc(t("review"))}</button>`;
}

function reviewActions(item) {
  const disabled = state.data.lock ? "disabled" : "";
  return `
    <button class="primary" data-decision-action="approve" data-review-id="${esc(item.review_id)}" ${disabled} type="button">${esc(t("approve"))}</button>
    <button class="plain" data-decision-action="request_changes" data-review-id="${esc(item.review_id)}" ${disabled} type="button">${esc(t("requestChanges"))}</button>
    <button class="danger" data-decision-action="block" data-review-id="${esc(item.review_id)}" ${disabled} type="button">${esc(t("block"))}</button>
  `;
}

function renderDetail(item, view, snapshot) {
  if (view === "mistakes") return renderMistake(item);
  if (view === "papers") return renderPaper(item);
  if (view === "review") return renderReviewItem(item, snapshot);
  return renderQuestion(item);
}

function renderQuestion(question) {
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(question.status)}${outcomeChip(question.outcome)}<span class="chip">${esc(question.subject)}</span><span class="chip">${esc(question.topic)}</span></div>
      <h2 class="question-title">${esc(question.title)}</h2>
      <p>${esc(question.prompt_text)}</p>
      <div class="answer-grid">
        <div class="answer-box"><span>${esc(t("studentAnswer"))}</span><b>${esc(question.student_answer)}</b></div>
        <div class="answer-box"><span>${esc(t("correctAnswer"))}</span><b>${esc(question.correct_answer)}</b></div>
      </div>
      <p class="note">${esc(question.explanation?.kid_summary || "")}</p>
    </section>
    <section class="section">
      <h3>${esc(t("gentleSteps"))}</h3>
      <ol class="step-list">
        ${(question.explanation?.steps || []).map((step, index) => `<li><span class="step-num">${index + 1}</span><span>${esc(step)}</span></li>`).join("")}
      </ol>
    </section>
    ${infoSection(t("keyConcept"), question.explanation?.key_concept)}
    ${infoSection(t("selfCheck"), question.explanation?.self_check)}
    ${infoSection(t("nextHint"), question.explanation?.next_hint)}
  `;
}

function renderMistake(mistake) {
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(mistake.status)}<span class="chip">${esc(mistake.subject)}</span><span class="chip">${esc(t("attempts"))}: ${esc(mistake.attempts)}</span></div>
      <h2 class="question-title">${esc(mistake.mistake_type)}</h2>
      <p>${esc(t("topic"))}: ${esc(mistake.topic)} · ${esc(t("due"))}: ${esc(mistake.next_review_at)}</p>
    </section>
    ${infoSection(t("rootCause"), mistake.analysis?.root_cause)}
    ${infoSection("Misconception", mistake.analysis?.misconception)}
    ${infoSection(t("fixStrategy"), mistake.analysis?.fix_strategy)}
    ${infoSection(t("similarPrompt"), mistake.analysis?.similar_prompt)}
    ${infoSection(t("parentNote"), mistake.analysis?.parent_note)}
  `;
}

function renderPaper(paper) {
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(paper.status)}<span class="chip">${esc(paper.subject)}</span><span class="chip">${esc(paper.estimated_minutes)} ${esc(t("minutes"))}</span></div>
      <h2 class="question-title">${esc(paper.title)}</h2>
      <div class="builder-grid">
        ${metric(t("questionCount"), paper.question_count)}
        ${metric(t("wrongCount"), paper.analysis?.wrong_count || 0)}
        ${metric(t("focus"), (paper.focus_topics || []).join(", "))}
      </div>
    </section>
    <section class="section">
      <h3>${esc(t("buildPaper"))}</h3>
      <div class="paper-builder">
        <div class="builder-grid">
          <div class="field"><label>${esc(t("questionCount"))}</label><input value="${esc(paper.question_count)}" readonly /></div>
          <div class="field"><label>${esc(t("minutes"))}</label><input value="${esc(paper.estimated_minutes)}" readonly /></div>
          <div class="field"><label>${esc(t("focus"))}</label><input value="${esc((paper.focus_topics || []).join(", "))}" readonly /></div>
        </div>
      </div>
    </section>
    <section class="section">
      <h3>Items</h3>
      ${(paper.items || []).map((entry) => `<div class="paper-item">${esc(entry)}</div>`).join("")}
    </section>
    ${listSection(t("strengths"), paper.analysis?.strengths)}
    ${listSection(t("reviewPlan"), paper.analysis?.review_plan)}
    ${infoSection(t("deepNotes"), paper.analysis?.deep_notes)}
  `;
}

function renderReviewItem(item, snapshot) {
  const target = findTarget(snapshot, item);
  const decision = state.data.decisions?.decisions?.[item.review_id];
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(item.status)}${(item.risk || []).map((risk) => `<span class="chip warn">${esc(risk)}</span>`).join("")}</div>
      <h2 class="question-title">${esc(item.title)}</h2>
      <p>${esc(item.summary)}</p>
      <div class="split">
        <div class="answer-box"><span>${esc(t("proposedAction"))}</span><b>${esc(item.proposed_action)}</b></div>
        <div class="answer-box"><span>${esc(t("reason"))}</span><p>${esc(item.reason)}</p></div>
      </div>
    </section>
    ${listSection(t("suggestions"), item.suggestions)}
    ${infoSection(t("suggestedNote"), item.suggested_note)}
    <section class="section">
      <h3>${esc(t("reviewNote"))}</h3>
      <div class="field">
        <textarea id="reviewNote">${esc(decision?.comment || item.suggested_note || "")}</textarea>
      </div>
    </section>
    ${target ? `<section class="section"><h3>Target</h3>${targetSummary(target, item.target_type)}</section>` : ""}
  `;
}

function findTarget(snapshot, item) {
  if (item.target_type === "question")
    return (snapshot.questions || []).find((target) => target.question_id === item.target_id);
  if (item.target_type === "mistake")
    return (snapshot.mistakes || []).find((target) => target.mistake_id === item.target_id);
  if (item.target_type === "paper") return (snapshot.papers || []).find((target) => target.paper_id === item.target_id);
  return null;
}

function targetSummary(target, type) {
  if (type === "question") return renderQuestion(target);
  if (type === "mistake") return renderMistake(target);
  return renderPaper(target);
}

function infoSection(title, body) {
  if (!body) return "";
  return `<section class="section"><h3>${esc(title)}</h3><div class="info-list"><li>${esc(body)}</li></div></section>`;
}

function listSection(title, items = []) {
  if (!items.length) return "";
  return `<section class="section"><h3>${esc(title)}</h3><ul class="info-list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>`;
}

function renderSettingsModal() {
  const config = state.data.config_summary || {};
  const setup = state.data.setup || {};
  const tabs = ["guide", "files", "policy", "language"];
  return `
    <div class="modal-backdrop" data-close-settings>
      <section class="modal" role="dialog" aria-modal="true" aria-label="${esc(t("settings"))}" data-modal>
        <header class="modal-head">
          <h2>${esc(t("settings"))}</h2>
          <button class="icon-button" data-route="${state.route.id ? `${state.route.view}/${state.route.id}` : "student"}" type="button">${esc(t("close"))}</button>
        </header>
        <nav class="modal-tabs">
          ${tabs.map((tab) => `<button class="${state.settingsTab === tab ? "active" : ""}" data-settings-tab="${tab}" type="button">${esc(settingsTabLabel(tab))}</button>`).join("")}
        </nav>
        <div class="modal-body">
          ${settingsTab(config, setup)}
        </div>
      </section>
    </div>
  `;
}

function settingsTabLabel(tab) {
  return { guide: t("guide"), files: t("files"), policy: t("policy"), language: t("language") }[tab] || tab;
}

function settingsTab(config, setup) {
  if (state.settingsTab === "files") {
    return `
      <section class="settings-card">
        ${settingsRow(t("provider"), setup.provider)}
        ${settingsRow(t("config"), config.config_path)}
        ${settingsRow(t("example"), setup.example_config)}
        ${settingsRow(t("recommended"), setup.recommended_config)}
        ${settingsRow(t("setupStatus"), state.data.onboarding?.completed ? "complete" : "not complete")}
      </section>
    `;
  }
  if (state.settingsTab === "policy") {
    return `
      <section class="settings-card">
        ${settingsRow(t("answerPolicy"), config.learning_policy?.answer_policy)}
        ${settingsRow(t("tone"), config.learning_policy?.tone)}
        ${settingsRow(t("storeRawPhotos"), String(config.learning_policy?.store_raw_photos))}
        ${settingsRow(t("exportApproval"), String(config.learning_policy?.parent_review_required_for_exports))}
      </section>
    `;
  }
  if (state.settingsTab === "language") {
    return `<section class="settings-card">${languagePicker()}</section>`;
  }
  return `
    <section class="settings-card">
      ${settingsRow(t("studentName"), config.student_profile?.display_name || state.data.snapshot?.profile?.display_name)}
      ${settingsRow(t("grade"), config.student_profile?.grade || state.data.snapshot?.profile?.grade)}
      ${settingsRow(t("subjects"), (config.subjects || []).join(", "))}
      ${settingsRow(t("dataProvider"), state.data.data_provider)}
    </section>
  `;
}

function settingsRow(label, value) {
  return `<div class="settings-row"><strong>${esc(label)}</strong><span>${esc(value ?? "")}</span></div>`;
}

function languagePicker() {
  const saved = localStorage.getItem("khc-language") || "auto";
  return `
    <div class="builder-grid">
      <button class="${saved === "auto" ? "primary" : "plain"}" data-lang="auto" type="button">${esc(t("auto"))}</button>
      <button class="${saved === "en" ? "primary" : "plain"}" data-lang="en" type="button">${esc(t("english"))}</button>
      <button class="${saved === "zh" ? "primary" : "plain"}" data-lang="zh" type="button">${esc(t("chinese"))}</button>
    </div>
  `;
}

async function postJson(path, payload) {
  if (state.data?.demo) {
    console.info("Demo mode: local write skipped", path, payload);
    return;
  }
  state.busy = true;
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    await loadState();
  } catch (error) {
    window.alert(error.message);
  } finally {
    state.busy = false;
  }
}

function nearestReviewForTarget(targetId) {
  return (state.data.snapshot?.review_items || []).find((item) => item.target_id === targetId);
}

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button");
  if (!button) return;

  const route = button.dataset.route;
  if (route) {
    if (route.includes("/")) window.location.hash = `#/${route}`;
    else routeTo(route);
    setSidebarOpen(false);
    return;
  }

  if (button.dataset.toggleSidebar !== undefined) {
    document.body.classList.toggle("sidebar-collapsed");
    return;
  }

  if (button.dataset.openSidebar !== undefined) {
    setSidebarOpen(true);
    return;
  }

  if (button.dataset.openSettings !== undefined) {
    routeTo("settings");
    return;
  }

  if (button.dataset.backList !== undefined) {
    routeTo(state.route.view);
    setMobileDetailOpen(false);
    return;
  }

  if (button.dataset.filter) {
    state.filter = button.dataset.filter;
    render();
    return;
  }

  if (button.dataset.selectId) {
    routeTo(button.dataset.selectView || state.route.view, button.dataset.selectId);
    setSidebarOpen(false);
    return;
  }

  if (button.dataset.lang) {
    localStorage.setItem("khc-language", button.dataset.lang);
    state.lang = resolveLanguage();
    render();
    return;
  }

  if (button.dataset.settingsTab) {
    state.settingsTab = button.dataset.settingsTab;
    render();
    return;
  }

  if (button.dataset.selectProvider) {
    await postJson("/api/provider", { provider: button.dataset.selectProvider });
    return;
  }

  if (button.dataset.completeOnboarding !== undefined) {
    await postJson("/api/onboarding/complete", { config_version: "1" });
    return;
  }

  if (button.dataset.copy) {
    const target = document.querySelector(button.dataset.copy);
    await navigator.clipboard.writeText(target?.textContent || "");
    return;
  }

  if (button.dataset.copyPrompt === "photo") {
    const prompt = state.localPhotoName
      ? `/kelly-homework-coach I selected a local homework photo named "${state.localPhotoName}". Please analyze it, explain it gently, and update the App UI snapshot.`
      : "/kelly-homework-coach Help me analyze the next homework photo, explain it gently, and update the App UI snapshot.";
    await navigator.clipboard.writeText(prompt);
    return;
  }

  if (button.dataset.decisionAction) {
    const comment = document.getElementById("reviewNote")?.value || "";
    await postJson("/api/decision", {
      review_id: button.dataset.reviewId,
      action: button.dataset.decisionAction,
      comment,
    });
    return;
  }

  if (button.dataset.understand) {
    const review = nearestReviewForTarget(button.dataset.understand);
    if (review)
      await postJson("/api/decision", { review_id: review.review_id, action: "approve", comment: t("iUnderstand") });
    return;
  }

  if (button.dataset.needHelp) {
    const review = nearestReviewForTarget(button.dataset.needHelp);
    if (review)
      await postJson("/api/decision", {
        review_id: review.review_id,
        action: "request_changes",
        comment: t("stillNeedHelp"),
      });
  }
});

document.addEventListener("input", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.matches("[data-search]")) {
    state.query = event.target.value;
    render();
  }
});

document.addEventListener("change", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.matches("[data-local-photo]")) {
    const file = event.target.files?.[0];
    state.localPhotoName = file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "";
    render();
  }
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target === scrim) setSidebarOpen(false);
  if (event.target.matches("[data-close-settings]")) routeTo("student");
});

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  render();
});

window.addEventListener("resize", () => {
  if (!isMobile()) {
    setSidebarOpen(false);
    setMobileDetailOpen(false);
  }
});

loadState();
setInterval(() => loadState({ quiet: true }), 5000);
