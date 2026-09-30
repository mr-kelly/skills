import { messages, resolveLanguage } from "./i18n/messages.js";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import {
  buildPaperAttempt,
  buildPracticeRequest,
  computeMistakeFromRow,
  computePaperFromRow,
  computeQuestionFromRow,
  computeReviewFromRow,
  gradeAnswer,
  isGradeable,
  paperItems,
  statusForAction,
} from "./js/homework-model.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

import { appConfig } from "./js/config.js?v=0.1.0";

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
  pagination: {},
  totalCount: {},
  workflowCount: null,
  loadingMore: {},
  loadMoreError: {},
  hasLoadedMore: false,
  notice: "",
  flashId: "",
  run: null,
  reopenedReviewId: "",
  studentFeedback: {},
  mistakeDrafts: {},
  mistakeSubmissions: {},
  mistakeRequestIds: {},
  causeStatus: {},
  attemptReviewRequests: {},
};

const PAGE_TARGETS = {
  questions: { snapshotKey: "questions", idKey: "question_id", normalize: computeQuestionFromRow },
  mistakes: { snapshotKey: "mistakes", idKey: "mistake_id", normalize: computeMistakeFromRow },
  papers: { snapshotKey: "papers", idKey: "paper_id", normalize: computePaperFromRow },
  reviews: { snapshotKey: "review_items", idKey: "review_id", normalize: computeReviewFromRow },
};

function t(key) {
  return messages[state.lang]?.[key] || messages.en[key] || key;
}

// `{n}` / `{name}` interpolation, for the headline and eyebrow only. Two
// placeholders is the whole feature: a headline that needs more than that is
// a paragraph wearing a headline's clothes.
function tf(key, vars) {
  return Object.entries(vars).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key));
}

// A parent reads "add to the mistake notebook", never `add_to_mistake_book`.
// The raw value is this app's contract with scripts/execute_decisions.mjs, not
// a label -- the reader can neither recognise it nor click it, so it says
// nothing while looking like content. An unknown action degrades to its
// humanised form, never to the id and never to "-".
const ACTION_LABELS = {
  add_to_mistake_book: "actionAddToMistakeBook",
  mark_understood: "actionMarkUnderstood",
  queue_practice_paper: "actionQueuePracticePaper",
  export_paper_plan: "actionExportPaperPlan",
  request_revision: "actionRequestRevision",
  block_item: "actionBlockItem",
  revise_explanation: "actionReviseExplanation",
};

function actionLabel(action) {
  const key = ACTION_LABELS[action];
  if (!action || action === "no_action") return t("noFollowup");
  return key ? t(key) : String(action || "").replace(/_/g, " ");
}

// Colour family. index.html ships the default (`sage-clay` -- botanical and
// calm, the family editorial-visual-system.md names for education); the Style
// tab is the only thing that overrides it. Register and light/dark are not
// offered: `desk` is correct for an app whose first screen is a queue, and
// dark follows the OS.
const THEME_FAMILIES = [
  ["ink-paper", "familyInkPaper", "familyInkPaperCopy"],
  ["rose-ochre", "familyRoseOchre", "familyRoseOchreCopy"],
  ["mauve-plum", "familyMauvePlum", "familyMauvePlumCopy"],
  ["coral-amber", "familyCoralAmber", "familyCoralAmberCopy"],
  ["sage-clay", "familySageClay", "familySageClayCopy"],
  ["ink-blush", "familyInkBlush", "familyInkBlushCopy"],
  ["graphite", "familyGraphite", "familyGraphiteCopy"],
];
const DEFAULT_FAMILY = document.documentElement.dataset.theme || "sage-clay";

function activeFamily() {
  const saved = localStorage.getItem("khc-theme") || "";
  return THEME_FAMILIES.some(([id]) => id === saved) ? saved : DEFAULT_FAMILY;
}

function applyFamily() {
  document.documentElement.dataset.theme = activeFamily();
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

const causeStorageKey = `homework-cause-requests:${appConfig.spaceId}:${appConfig.appId}`;
let restoredCauseRequests = false;
function rememberCauseRequests() {
  if (state.data?.demo) return;
  try {
    sessionStorage.setItem(causeStorageKey, JSON.stringify(state.mistakeRequestIds));
  } catch {}
}
async function syncCauseRequests(provider) {
  if (state.data?.demo) return;
  if (!restoredCauseRequests) {
    restoredCauseRequests = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(causeStorageKey) || "{}");
      for (const [id, request] of Object.entries(saved).slice(0, 5)) {
        if (typeof request === "string" && /^crq[a-zA-Z0-9]+$/.test(request)) state.mistakeRequestIds[id] = request;
      }
    } catch {}
  }
  for (const [id, requestId] of Object.entries(state.mistakeRequestIds).slice(0, 5)) {
    try {
      const status = await provider.getMistakeRequestStatus({ requestId, mistake_id: id });
      if (status === "merged") {
        delete state.mistakeSubmissions[id];
        delete state.mistakeDrafts[id];
        delete state.mistakeRequestIds[id];
        state.causeStatus[id] = t("causeSaved");
      } else if (["rejected", "abandoned"].includes(status)) {
        delete state.mistakeSubmissions[id];
        delete state.mistakeRequestIds[id];
        state.causeStatus[id] = t("causeNeedsChanges");
      } else {
        state.mistakeSubmissions[id] = t("causePending");
        state.causeStatus[id] = status === "conflict" ? t("causeConflict") : t("causePending");
      }
    } catch {
      state.mistakeSubmissions[id] ||= t("causePending");
      state.causeStatus[id] = t("causeLookupFailed");
    }
  }
  rememberCauseRequests();
}

async function loadState({ quiet = false } = {}) {
  if (isEditing() && quiet) return;
  if (quiet && state.hasLoadedMore) return;
  // The 20s background refresh exists to pick up what the agent wrote to
  // Busabase since the last paint. In demo mode there is no second writer --
  // the provider hands back the same fixture every time -- so a quiet refresh
  // can only do one thing: throw away the decisions the operator just made in
  // this tab. Found by recording the demo and watching the sidebar counters
  // snap back to 4/1 twenty seconds after an approval.
  if (quiet && state.data?.demo) return;
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.data = data;
  await syncCauseRequests(provider);
  state.pagination = data.pagination || {};
  state.totalCount = data.totalCount || {};
  state.workflowCount = data.workflowCount || null;
  if (!quiet) state.hasLoadedMore = false;
  window.dispatchEvent(new CustomEvent("kelly-homework-coach:state", { detail: data }));
  render();
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
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  state.route = parseRoute();
  renderShell();
}

function renderShell() {
  const snapshot = state.data.snapshot || {};
  const counts = state.workflowCount || statusCounts(snapshot.review_items || []);
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
        ${renderListPanel(snapshot, counts)}
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
          <div class="attention-metric is-live"><b>${counts.needs_review + counts.changes_requested}</b><span>${esc(t("openForYou"))}</span></div>
          <div class="attention-metric"><b>${counts.approved}</b><span>${esc(t("readyForAgent"))}</span></div>
          <div class="attention-metric"><b>${metrics.due_reviews || 0}</b><span>${esc(t("dueReviews"))}</span></div>
          <div class="attention-metric"><b>${counts.blocked}</b><span>${esc(t("blockedCount"))}</span></div>
        </div>
      </section>
      <nav class="nav">
        ${navButton("student", t("student"), totalFor("questions", snapshot.questions?.length || 0))}
        ${navButton("mistakes", t("mistakes"), totalFor("mistakes", snapshot.mistakes?.length || 0))}
        ${navButton("papers", t("papers"), totalFor("papers", snapshot.papers?.length || 0))}
        ${navButton("review", t("review"), totalFor("reviews", snapshot.review_items?.length || 0))}
      </nav>
      <div class="filter">
        ${filterButton("all", t("all"), totalFor("reviews", (snapshot.review_items || []).length))}
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

function totalFor(key, loaded) {
  return state.totalCount[key] ?? `${loaded}${state.pagination[key] ? "+" : ""}`;
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

function baseKeyForView(view) {
  if (view === "mistakes") return "mistakes";
  if (view === "papers") return "papers";
  if (view === "review") return "reviews";
  return "questions";
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

// The headline is a sentence about the work, not the page name -- "3 things
// need your judgment." is what the reader is here for; "Review" is what the
// nav rail already told them. The lede says what to do next.
function panelIntro(view, snapshot, counts) {
  const name = snapshot.profile?.display_name || t("studentName");
  if (view === "mistakes") {
    const due = (snapshot.mistakes || []).filter((item) => item.status !== "done").length;
    return { headline: tf("headlineMistakes", { n: due }), lede: t("ledeMistakes") };
  }
  if (view === "papers") {
    return { headline: tf("headlinePapers", { n: (snapshot.papers || []).length }), lede: t("ledePapers") };
  }
  if (view === "review") {
    const open = counts.needs_review + counts.changes_requested;
    return {
      headline: open ? tf("headlineReview", { n: open }) : t("headlineReviewClear"),
      lede: t("ledeReview"),
    };
  }
  const open = (snapshot.questions || []).filter((item) => item.status !== "done").length;
  return {
    headline: open ? tf("headlineStudent", { name, n: open }) : tf("headlineStudentClear", { name }),
    lede: t("ledeStudent"),
  };
}

function renderListPanel(snapshot, counts) {
  const view = state.route.view === "settings" ? "student" : state.route.view;
  const items = filteredItems(snapshot);
  const metrics = snapshot.metrics || {};
  const showMetrics = view === "student";
  const intro = panelIntro(view, snapshot, counts);
  const total = collectionFor(snapshot, view).length;
  return `
    <section class="list-panel">
      <div class="panel-header">
        <p class="eyebrow">${esc(navLabel(view))} · ${esc(tf("itemsCount", { n: total }))}</p>
        <h1 class="headline">${esc(intro.headline)}</h1>
        <p class="lede">${esc(intro.lede)}</p>
        <input class="search" type="search" value="${esc(state.query)}" data-search placeholder="${esc(t("search"))}" />
      </div>
      ${
        showMetrics
          ? `<div class="metric-band">
              ${metric(t("mastery"), `${metrics.mastery_score || 0}%`)}
              ${metric(t("analyzed"), metrics.questions_analyzed || 0)}
              ${metric(t("activeQuestions"), metrics.active_questions || 0)}
            </div>
            ${renderPhotoBox()}`
          : ""
      }
      <div class="row-list">
        ${items.length ? items.map((item) => renderRow(item, view)).join("") : `<div class="note" style="padding:16px;">${esc(t("noItems"))}</div>`}
      </div>
      ${loadMoreControl(baseKeyForView(view))}
    </section>
  `;
}

function loadMoreControl(key) {
  if (!state.pagination[key]) return "";
  return `<div class="load-more"><button type="button" data-load-more="${esc(key)}" ${state.loadingMore[key] ? "disabled" : ""}>${esc(state.loadingMore[key] ? t("loadingMore") : t("loadMore"))}</button>${state.loadMoreError[key] ? `<span role="alert">${esc(t("loadMoreFailed"))}</span>` : ""}</div>`;
}

async function loadMore(key) {
  const cursor = state.pagination[key];
  const target = PAGE_TARGETS[key];
  if (!cursor || !target || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.loadMoreError[key] = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage(key, cursor);
    const current = state.data.snapshot[target.snapshotKey];
    const known = new Set(current.map((item) => item[target.idKey]));
    current.push(...page.rows.map(target.normalize).filter((item) => !known.has(item[target.idKey])));
    state.pagination[key] = page.nextCursor;
    state.hasLoadedMore = true;
  } catch {
    state.loadMoreError[key] = true;
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

function metric(label, value) {
  return `<div class="metric"><span class="metric-value">${esc(value)}</span><span class="metric-label">${esc(label)}</span></div>`;
}

function renderPhotoBox() {
  return `
    <div class="photo-box">
      <div class="photo-actions">
        <label class="photo-picker">
          <input type="file" accept="image/*" data-local-photo />
          <span>${esc(t("choosePhoto"))}</span>
        </label>
        <span class="chip accent">${esc(t("selectedOnly"))}</span>
        <button class="primary" data-copy-prompt="photo" type="button">${esc(t("askAgent"))}</button>
      </div>
      ${state.localPhotoName ? `<p class="note">${esc(state.localPhotoName)}</p>` : ""}
    </div>
  `;
}

function renderRow(item, view) {
  const id = idFor(item, view);
  const active = state.route.id === id || (!state.route.id && selectedItem(state.data.snapshot) === item);
  const target = view === "review" ? findTarget(state.data.snapshot, item) : null;
  const title = target?.title || item.title;
  const summary =
    target?.prompt_text ||
    item.prompt_text ||
    item.summary ||
    item.analysis?.root_cause ||
    item.analysis?.deep_notes ||
    "";
  let chips = statusChip(item.status);
  if (view === "student") chips += outcomeChip(item.outcome);
  if (view === "mistakes") chips += `<span class="chip">${esc(item.topic)}</span>`;
  if (view === "papers") chips += `<span class="chip">${esc(item.question_count)} ${esc(t("questionCount"))}</span>`;
  if (view === "review") chips += `<span class="chip action">${esc(nextStep(item))}</span>`;
  return `
    <button class="row ${active ? "active" : ""} ${state.flashId === id ? "is-decided" : ""}" data-select-id="${esc(id)}" data-select-view="${esc(view)}" type="button">
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
        ${view === "review" && item ? reviewActions(item) : activeRun() ? "" : studentActions(view, item)}
        ${state.notice ? `<span class="decision-state" role="status">${esc(state.notice)}</span>` : ""}
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
      ${state.studentFeedback[item.question_id] ? `<button class="plain" data-copy-student-feedback="${esc(item.question_id)}" type="button">${esc(t("copyFeedback"))}</button>` : ""}
    `;
  }
  if (view === "papers")
    return `<button class="primary" data-route="review" type="button">${esc(t("review"))}</button>`;
  return `<button class="plain" data-route="review" type="button">${esc(t("review"))}</button>`;
}

function reviewActions(item) {
  if (item.target_type === "paper") {
    const paper = (state.data?.snapshot?.papers || []).find((entry) => entry.paper_id === item.target_id);
    const attempt = paper && latestAttempt(paper);
    if (attempt) return `<span class="decision-state">${esc(t("oldPaperApprovalNote"))}</span>`;
  }
  if (["approved", "done", "blocked"].includes(item.status) && state.reopenedReviewId !== item.review_id) {
    return `<span class="decision-state">${esc(t("decisionSaved"))}</span><button class="plain" data-reopen-review="${esc(item.review_id)}" type="button">${esc(t("reReview"))}</button>`;
  }
  return `
    <button class="primary" data-decision-action="approve" data-review-id="${esc(item.review_id)}" type="button">${esc(t(item.target_type === "paper" ? "approvePaper" : "approveExplanation"))}</button>
    <button class="plain" data-decision-action="request_changes" data-review-id="${esc(item.review_id)}" type="button">${esc(t("requestChanges"))}</button>
    <button class="danger" data-decision-action="block" data-review-id="${esc(item.review_id)}" type="button">${esc(t("block"))}</button>
  `;
}

function renderDetail(item, view, snapshot) {
  if (view === "mistakes") return renderMistake(item);
  if (view === "papers") {
    const runState = activeRun();
    if (runState && runState.paper_id === item.paper_id) return renderRunner(item);
    return renderPaper(item);
  }
  if (view === "review") return renderReviewItem(item, snapshot);
  return renderQuestion(item, false);
}

function renderQuestion(question, parentReview) {
  const unverified = question.outcome === "uncertain" || !question.correct_answer;
  const explanation = `
    <div class="answer-grid">
      <div class="answer-box"><span>${esc(t("studentAnswer"))}</span><b>${esc(question.student_answer)}</b></div>
      <div class="answer-box ${unverified ? "is-flagged" : ""}"><span>${esc(t("correctAnswer"))}</span><b>${esc(question.correct_answer || t("uncertain"))}</b></div>
    </div>
    <p class="note">${esc(question.explanation?.kid_summary || "")}</p>
    <section class="section">
      <h3>${esc(t("gentleSteps"))}</h3>
      <ol class="step-list">
        ${(question.explanation?.steps || []).map((step, index) => `<li><span class="step-num">${index + 1}</span><span>${esc(step)}</span></li>`).join("")}
      </ol>
    </section>
    ${infoSection(t("keyConcept"), question.explanation?.key_concept)}
    ${infoSection(t("selfCheck"), question.explanation?.self_check)}
  `;
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(question.status)}${outcomeChip(question.outcome)}<span class="chip">${esc(question.subject)}</span><span class="chip">${esc(question.topic)}</span></div>
      <h2 class="question-title">${esc(question.title)}</h2>
      ${originalQuestion(question)}
      ${state.studentFeedback[question.question_id] ? `<p class="note" role="status">${esc(state.studentFeedback[question.question_id])}</p>` : ""}
      ${parentReview ? explanation : `${infoSection(t("nextHint"), question.explanation?.next_hint)}<details class="section" data-question-explanation><summary>${esc(t("revealQuestionExplanation"))}</summary>${explanation}</details>`}
    </section>
    ${parentReview ? infoSection(t("nextHint"), question.explanation?.next_hint) : ""}
  `;
}

function renderMistake(mistake) {
  const question = (state.data?.snapshot?.questions || []).find((q) => q.question_id === mistake.question_id);
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(mistake.status)}<span class="chip">${esc(mistake.subject)}</span><span class="chip">${esc(t("attempts"))}: ${esc(mistake.attempts)}</span></div>
      <h2 class="question-title">${esc(mistake.mistake_type)}</h2>
      <p>${esc(t("topic"))}: ${esc(mistake.topic)} · ${esc(t("due"))}: ${esc(mistake.next_review_at)}</p>
    </section>
    ${question ? originalQuestion(question) : `<p class="note">${esc(t("practiceSourceLookup"))}</p>`}
    ${infoSection(t("rootCause"), mistake.analysis?.root_cause)}
    <section class="section"><h3>${esc(t("editMistakeCause"))}</h3><p class="note">${esc(t("mistakeCauseHint"))}</p><div class="field"><label for="mistakeCause">${esc(t("mistakeCauseLabel"))}</label><textarea id="mistakeCause" data-mistake-draft="${esc(mistake.mistake_id)}" maxlength="2000">${esc(state.mistakeDrafts[mistake.mistake_id] ?? mistake.analysis?.root_cause ?? "")}</textarea></div><button class="primary" data-save-mistake="${esc(mistake.mistake_id)}" type="button" ${state.busy || state.mistakeSubmissions[mistake.mistake_id] ? "disabled" : ""}>${esc(t("submitMistakeCause"))}</button>${state.causeStatus[mistake.mistake_id] || state.mistakeSubmissions[mistake.mistake_id] ? `<p class="note" role="status">${esc(state.causeStatus[mistake.mistake_id] || state.mistakeSubmissions[mistake.mistake_id])}</p>` : ""}${state.mistakeRequestIds[mistake.mistake_id] ? `<button class="plain" data-refresh-cause type="button">${esc(t("refreshSaveStatus"))}</button>` : ""}</section>
    <section class="section"><h3>${esc(t("practiceRequest"))}</h3><p>${esc(t("practiceRequestHint"))}</p><button class="plain" data-practice-request="${esc(mistake.mistake_id)}" type="button">${esc(t("copyPracticeRequest"))}</button></section>

    ${infoSection(t("misconception"), mistake.analysis?.misconception)}
    ${infoSection(t("fixStrategy"), mistake.analysis?.fix_strategy)}
    ${infoSection(t("similarPrompt"), mistake.analysis?.similar_prompt)}
    ${infoSection(t("parentNote"), mistake.analysis?.parent_note)}
  `;
}

function practiceDiagram(item) {
  const diagram = item.diagram;
  if (!diagram) return "";
  const points = diagram.points;
  const xs = Object.values(points).map((p) => p[0]);
  const ys = Object.values(points).map((p) => p[1]);
  const left = Math.min(...xs) - 35;
  const top = Math.min(...ys) - 35;
  const width = Math.max(...xs) - left + 35;
  const height = Math.max(...ys) - top + 35;
  const poly = (labels) => labels.map((l) => points[l].join(",")).join(" ");
  const p = points;
  return `<figure class="practice-diagram"><svg role="img" aria-label="${esc(t("practiceDiagramAlt"))}" viewBox="${left} ${top} ${width} ${height}" style="width:100%;max-height:320px" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${poly(["A", "B", "C", "D", "A"])}" fill="none" stroke="currentColor" stroke-width="1.5" />
    <polyline points="${poly(["G", "E", "Q", "H"])}" fill="none" stroke="currentColor" stroke-width="2" />
    <line x1="${p.G[0]}" y1="${p.G[1]}" x2="${p.H[0]}" y2="${p.H[1]}" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 4" />
    ${Object.entries(p)
      .map(
        ([l, [x, y]]) =>
          `<text x="${x + (l === "E" ? 4 : l === "Q" ? -18 : ["A", "D", "G"].includes(l) ? -20 : 7)}" y="${y + (["A", "B", "E", "Q"].includes(l) ? -8 : 16)}" fill="currentColor">${l}</text>`,
      )
      .join("")}
  </svg><figcaption>${esc(diagram.note)} · ${esc(t("diagramNotToScale"))}</figcaption></figure>`;
}

function latestAttempt(paper) {
  return paper.analysis?.attempts?.at(-1) || null;
}

function attemptHistory(paper, parent = false) {
  const attempts = paper.analysis?.attempts || [];
  if (!attempts.length) return "";
  const reviews = paper.analysis?.attempt_reviews || [];
  return `<section class="section"><h3>${esc(t("attemptHistory"))}</h3>${attempts
    .map((attempt) => {
      const review = reviews.find((entry) => entry.attempted_at === attempt.attempted_at);
      return `<div class="paper-item"><p><b>${esc(attempt.attempted_at)}</b> · ${esc(tf("runScore", { correct: attempt.correct, total: attempt.graded }))} · ${esc(review ? t("attemptReviewed") : t("attemptPending"))}</p>
      ${parent ? (attempt.results || []).map((result) => `<div class="paper-item"><b>${esc(result.ref)}. ${esc(result.prompt)}</b><p>${esc(t("studentAnswer"))}: ${esc(result.given)}</p><p>${esc(t("firstAnswer"))}: ${esc(result.first_given)} · ${esc(result.first_outcome)}</p><p>${esc(t("answerHistory"))}: ${esc((result.answer_history || []).map((step) => step.given).join(" → "))}</p><p>${esc(t("marking"))}: ${esc(review?.verdicts?.find((v) => v.ref === result.ref)?.outcome || result.outcome)}</p></div>`).join("") : `<p class="note">${esc(t("attemptStudentNote"))}</p>`}
      ${parent && review ? `<p>${esc(t("parentNotes"))}: ${esc(review.comment)}</p>` : ""}</div>`;
    })
    .join("")}</section>`;
}

function attemptReviewForm(paper) {
  const attempt = latestAttempt(paper);
  if (
    !attempt ||
    paper.status !== "needs_review" ||
    (paper.analysis?.attempt_reviews || []).some((entry) => entry.attempted_at === attempt.attempted_at)
  )
    return "";
  const open = (attempt.results || []).filter((entry) => entry.outcome === "ungraded");
  return `<section class="section"><h3>${esc(t("reviewAttempt"))}</h3>${state.attemptReviewRequests[paper.paper_id] ? `<p role="status">${esc(t("attemptReviewPending"))} ${esc(state.attemptReviewRequests[paper.paper_id])}</p>` : ""}<p class="note">${esc(t("reviewAttemptHint"))}</p>
    ${open.map((entry) => `<div class="field"><label for="attemptVerdict${esc(entry.ref)}">${esc(entry.ref)}. ${esc(entry.prompt)}</label><select id="attemptVerdict${esc(entry.ref)}" data-attempt-verdict="${esc(entry.ref)}"><option value="">${esc(t("selectMark"))}</option><option value="correct">${esc(t("correct"))}</option><option value="wrong">${esc(t("wrong"))}</option></select></div>`).join("")}
    <div class="field"><label for="attemptNote">${esc(t("parentNotes"))}</label><textarea id="attemptNote" maxlength="2000"></textarea></div><p class="note" data-attempt-review-error role="alert" hidden></p><button class="primary" type="button" data-submit-attempt-review="${esc(paper.paper_id)}" ${state.attemptReviewRequests[paper.paper_id] ? "disabled" : ""}>${esc(t("submitAttemptReview"))}</button></section>`;
}

function renderPaper(paper) {
  const attempt = latestAttempt(paper);
  const pending =
    attempt && !(paper.analysis?.attempt_reviews || []).some((entry) => entry.attempted_at === attempt.attempted_at);
  const review = (state.data?.snapshot?.review_items || []).find(
    (item) => item.target_type === "paper" && item.target_id === paper.paper_id,
  );
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(paper.status)}<span class="chip">${esc(paper.subject)}</span><span class="chip">${esc(paper.estimated_minutes)} ${esc(t("minutes"))}</span></div>
      <h2 class="question-title">${esc(paper.title)}</h2>
      ${pending ? `<p class="note">${esc(t("attemptPending"))} ${review ? `<button class="plain" type="button" data-route="review/${esc(review.review_id)}">${esc(t("reviewAttempt"))}</button>` : esc(t("reviewLinkMissing"))}</p>` : ""}
      ${
        isGradeable(paper) && paper.status === "approved"
          ? `<div class="run-entry">
              <button class="primary" data-run-start="${esc(paper.paper_id)}" type="button">${esc(t("startPaper"))}</button>
              <span class="note">${esc(t("startPaperHint"))}</span>
            </div>`
          : `<p class="note">${esc(t(isGradeable(paper) ? "paperNeedsApproval" : "paperNotGradeable"))}</p>`
      }
      <div class="builder-grid">
        ${metric(t("questionCount"), paper.question_count)}

        ${metric(t("focus"), (paper.focus_topics || []).join(", "))}
      </div>
    </section>
    <section class="section">
      <h3>${esc(t("paperItems"))}</h3>
      ${paperItems(paper)
        .map(
          (entry) => `<div class="paper-item">${esc(entry.ref)}. ${esc(entry.prompt)}${practiceDiagram(entry)}</div>`,
        )
        .join("")}
    </section>
    ${attemptHistory(paper)}
    <p class="note">${esc(t("childPaperNote"))}</p>
  `;
}

// ── Practice runner ────────────────────────────────────────────────────────
//
// The student answers the paper one question at a time. Everything here is
// local and deterministic: no model call, no network, and the marking rule is
// gradeAnswer() so a child can be told exactly why an answer was counted
// wrong. Only "交卷" reaches Busabase, and only to update the paper's own row.

function activeRun() {
  return state.run;
}

function runPaper() {
  const runState = activeRun();
  if (!runState) return null;
  return (state.data?.snapshot?.papers || []).find((paper) => paper.paper_id === runState.paper_id) || null;
}

/**
 * hint_first is a configured policy, not a default this file gets to invent:
 * Help & Settings › Policy shows it, SKILL.md's Safety Defaults enforce it,
 * and a paper runner that dumps the answer on the first wrong attempt breaks
 * the one rule the whole skill is built around.
 */
function hintFirst() {
  return (state.data?.config_summary?.learning_policy?.answer_policy || "hint_first") === "hint_first";
}

function startRun(paperId) {
  const paper = (state.data?.snapshot?.papers || []).find((p) => p.paper_id === paperId);
  if (!paper || paper.status !== "approved" || !isGradeable(paper)) {
    window.alert(t("paperNeedsApproval"));
    return;
  }
  state.run = {
    paper_id: paperId,
    index: 0,
    answers: {},
    history: {},
    hints: {},
    tries: {},
    stage: "answer",
    outcome: "",
  };
  state.notice = "";
  render();
}

function exitRun() {
  state.run = null;
  render();
}

function currentItem() {
  const paper = runPaper();
  if (!paper) return null;
  return paperItems(paper)[activeRun().index] || null;
}

function submitRunAnswer() {
  const runState = activeRun();
  const item = currentItem();
  if (!runState || !item) return;
  const given = document.getElementById("runAnswer")?.value ?? "";
  if (!given.trim()) {
    window.alert(t("answerRequired"));
    return;
  }
  runState.answers[item.ref] = given;
  const outcome = gradeAnswer(given, item.answer);
  (runState.history[item.ref] ||= []).push({
    given,
    outcome,
    hints_used: Number(runState.hints[item.ref]) || 0,
    answered_at: new Date().toISOString(),
  });
  runState.outcome = outcome;
  runState.tries[item.ref] = (runState.tries[item.ref] || 0) + 1;

  if (outcome === "correct" || outcome === "ungraded") {
    runState.stage = "result";
  } else if (hintFirst() && runState.tries[item.ref] === 1 && item.hint) {
    // First wrong answer with a hint available: the hint, never the answer.
    runState.hints[item.ref] = (runState.hints[item.ref] || 0) + 1;
    runState.stage = "hint";
  } else {
    runState.stage = "reveal";
  }
  render();
}

function retryRunItem() {
  const runState = activeRun();
  if (!runState) return;
  runState.stage = "answer";
  runState.outcome = "";
  render();
}

function nextRunItem() {
  const runState = activeRun();
  const paper = runPaper();
  if (!runState || !paper) return;
  const total = paperItems(paper).length;
  if (runState.index + 1 >= total) runState.stage = "done";
  else {
    runState.index += 1;
    runState.stage = "answer";
    runState.outcome = "";
    runState.showHint = false;
  }
  render();
}

/**
 * Hand the finished attempt to the parent.
 *
 * The attempt is written onto the paper's own row — `papers` is already
 * documented as holding "a completed-paper analysis" — and the paper's review
 * row goes back to needs_review so it surfaces in the queue. That is the whole
 * write: no new Base, no create procedure, and nothing that the AirApp could
 * not already do.
 */
async function finishRun() {
  const runState = activeRun();
  const paper = runPaper();
  if (!runState || !paper) return;
  const attempt = buildPaperAttempt(paper, runState.answers, runState.hints, undefined, runState.history);

  if (state.data?.demo) {
    paper.analysis = {
      ...paper.analysis,
      wrong_count: attempt.wrong_count,
      attempt,
      attempts: [...(paper.analysis?.attempts || []), attempt],
    };
    paper.status = "needs_review";
    // Demo mirrors the real single-paper proposal: never reset/reuse the
    // old parent confirmation as approval of this new result.
    state.workflowCount = null;
    runState.stage = "submitted";
    state.notice = t("decisionRecordedDemo");
    render();
    return;
  }

  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    const submitted = await provider.submitPaperAttempt({ paper_id: paper.paper_id, attempt });
    runState.requestId = submitted.id;
    runState.stage = "submitted";
    state.notice = t("paperSubmitted");
    await loadState();
  } catch (error) {
    window.alert(error.message);
  } finally {
    state.busy = false;
    render();
  }
}

function runProgress(paper) {
  const runState = activeRun();
  const total = paperItems(paper).length;
  return `${runState.index + 1} / ${total}`;
}

function renderRunner(paper) {
  const runState = activeRun();
  const items = paperItems(paper);
  const item = items[runState.index];

  if (runState.stage === "done" || runState.stage === "submitted") {
    const attempt = buildPaperAttempt(paper, runState.answers, runState.hints, undefined, runState.history);
    const wrong = attempt.results.filter((result) => result.outcome === "wrong");
    const open = attempt.results.filter((result) => result.outcome === "ungraded");
    return `
      <section class="hero-answer">
        <p class="eyebrow">${esc(t("papers"))} · ${esc(paper.title)}</p>
        <h2 class="question-title">${esc(tf("runScore", { correct: attempt.correct, total: attempt.graded }))}</h2>
        <p>${esc(open.length ? tf("runOpenItems", { n: open.length }) : t("runAllMarked"))}</p>
      </section>
      ${
        wrong.length
          ? `<section class="section">
              <h3>${esc(t("runWrongList"))}</h3>
              <ul class="info-list">
                ${wrong
                  .map(
                    (result) =>
                      `<li><strong>${esc(result.ref)}. ${esc(result.prompt)}</strong><br /><span class="note">${esc(t("studentAnswer"))}: ${esc(result.given || "—")} · ${esc(t("correctAnswer"))}: ${esc(result.expected)}${result.topic ? ` · ${esc(result.topic)}` : ""}</span></li>`,
                  )
                  .join("")}
              </ul>
            </section>`
          : `<p class="note">${esc(t("runNoWrong"))}</p>`
      }
      <section class="section">
        ${
          runState.stage === "submitted"
            ? `<p class="note">${esc(state.data?.demo ? t("decisionRecordedDemo") : t("paperResultPending"))} ${esc(runState.requestId || "")}</p>
               <div class="run-actions">
                 <button class="primary" data-route="review" type="button">${esc(t("review"))}</button>
                 <button class="plain" data-run-exit type="button">${esc(t("close"))}</button>
               </div>`
            : `<div class="run-actions">
                 <button class="primary" data-run-finish type="button" ${state.busy ? "disabled" : ""}>${esc(t("runHandIn"))}</button>
                 <button class="plain" data-run-exit type="button">${esc(t("back"))}</button>
               </div>`
        }
      </section>
    `;
  }

  const given = runState.answers[item.ref] ?? "";
  return `
    <section class="hero-answer">
      <p class="eyebrow">${esc(t("papers"))} · ${esc(runProgress(paper))}${item.topic ? ` · ${esc(item.topic)}` : ""}</p>
      <h2 class="question-title">${esc(item.prompt)}</h2>
      ${practiceDiagram(item)}
      ${
        runState.stage === "answer" && runState.showHint && item.hint
          ? `<div class="run-verdict is-hint"><p>${esc(item.hint)}</p></div>`
          : ""
      }
      ${
        runState.stage === "answer"
          ? `<div class="field">
              <label for="runAnswer">${esc(t("runYourAnswer"))}</label>
              ${item.answer ? `<input id="runAnswer" type="text" value="${esc(given)}" autocomplete="off" placeholder="${esc(t("runAnswerPlaceholder"))}" />` : `<textarea id="runAnswer" rows="5" placeholder="${esc(t("explanationAnswerPlaceholder"))}">${esc(given)}</textarea>`}
            </div>
            <div class="run-actions">
              <button class="primary" data-run-submit type="button">${esc(t("runSubmit"))}</button>
              ${item.hint ? `<button class="plain" data-run-hint type="button">${esc(t("runNeedHint"))}</button>` : ""}
            </div>`
          : ""
      }
      ${
        runState.stage === "hint"
          ? `<div class="run-verdict is-hint">
              <strong>${esc(t("runNotYet"))}</strong>
              <p>${esc(item.hint)}</p>
            </div>
            <div class="run-actions">
              <button class="primary" data-run-retry type="button">${esc(t("runTryAgain"))}</button>
            </div>`
          : ""
      }
      ${
        runState.stage === "reveal"
          ? `<div class="run-verdict is-wrong">
              <strong>${esc(t("runWrong"))}</strong>
              <p>${esc(t("correctAnswer"))}: <b>${esc(item.answer)}</b></p>
              ${infoSection(t("solution"), item.explanation || t("solutionMissing"))}
              ${item.hint ? `<p class="note">${esc(item.hint)}</p>` : ""}
            </div>
            <div class="run-actions">
              <button class="primary" data-run-next type="button">${esc(t("runNext"))}</button>
            </div>`
          : ""
      }
      ${
        runState.stage === "result"
          ? `<div class="run-verdict ${runState.outcome === "correct" ? "is-correct" : "is-open"}">
              <strong>${esc(runState.outcome === "correct" ? t("runCorrect") : t("runOpenItem"))}</strong>
              ${runState.outcome === "ungraded" ? `<p class="note">${esc(t("runOpenItemNote"))}</p>` : infoSection(t("solution"), item.explanation || t("solutionMissing"))}
            </div>
            <div class="run-actions">
              <button class="primary" data-run-next type="button">${esc(t("runNext"))}</button>
            </div>`
          : ""
      }
    </section>
    <section class="section">
      <div class="run-actions">
        <button class="plain" data-run-exit type="button">${esc(t("runQuit"))}</button>
      </div>
    </section>
  `;
}

function safeImageUrl(raw) {
  if (typeof raw !== "string") return "";
  try {
    const url = new URL(raw, window.location.origin);
    return url.protocol === "https:" && /^s\d+\.busabase\.com$/i.test(url.hostname) ? url.href : "";
  } catch {
    return "";
  }
}

function originalQuestion(question) {
  const image = Array.isArray(question.original_image) ? question.original_image[0] : null;
  const imageUrl = safeImageUrl(image?.url);
  return `<section class="section original-question" aria-label="${esc(t("originalQuestion"))}"><h3>${esc(t("originalQuestion"))}</h3>${imageUrl ? `<img class="original-image" src="${esc(imageUrl)}" alt="${esc(t("originalImageAlt"))}" loading="lazy" referrerpolicy="no-referrer" />` : question.source === "photo" ? `<p class="note">${esc(t("photoNotStored"))}</p>` : ""}<p>${esc(question.prompt_text || t("missingQuestion"))}</p></section>`;
}

function nextStep(item) {
  if (item.status === "blocked") return t("blockedNext");
  if (item.status === "changes_requested") return t("revisionNext");
  if (["approved", "done"].includes(item.status))
    return !item.proposed_action || item.proposed_action === "no_action"
      ? t("confirmedNoFollowup")
      : actionLabel(item.proposed_action);
  return t("checkExplanation");
}

function renderQuestionReview(item, question) {
  const decision = item.decision;
  const settled = ["approved", "done", "blocked"].includes(item.status) && state.reopenedReviewId !== item.review_id;
  const steps = question.explanation?.steps || [];
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(item.status)}${(item.risk || []).map((risk) => `<span class="chip warn">${esc(risk)}</span>`).join("")}</div>
      <h2 class="question-title">${esc(question.title || item.title)}</h2>
      <p>${esc(t("reviewPurpose"))}</p>
      ${originalQuestion(question)}
    </section>
    <section class="section">
      <h3>${esc(t("explanationToConfirm"))}</h3>
      ${question.explanation?.kid_summary ? `<p>${esc(question.explanation.kid_summary)}</p>` : ""}
      ${steps.length ? `<ol class="step-list">${steps.map((step, index) => `<li><span class="step-num">${index + 1}</span><span>${esc(step)}</span></li>`).join("")}</ol>` : `<p class="note">${esc(t("missingExplanation"))}</p>`}
      ${infoSection(t("keyConcept"), question.explanation?.key_concept)}
    </section>
    ${item.reason || question.explanation?.self_check ? `<section class="section"><h3>${esc(t("checkPoints"))}</h3>${item.reason ? `<p>${esc(item.reason)}</p>` : ""}${question.explanation?.self_check ? `<p>${esc(question.explanation.self_check)}</p>` : ""}</section>` : ""}
    <section class="section">
      <h3>${esc(t("confirmationResult"))}</h3>
      <p>${esc(nextStep(item))}</p>
      ${settled ? `<p>${esc(decision?.comment || t("noNote"))}</p>` : `<div class="field"><label for="reviewNote">${esc(t("reviewNote"))}</label><textarea id="reviewNote">${esc(decision?.comment || item.suggested_note || "")}</textarea><p class="note">${esc(t("reviewNoteHint"))}</p></div>`}
    </section>
  `;
}

function renderPaperReview(item, paper) {
  const settled = ["approved", "done", "blocked"].includes(item.status) && state.reopenedReviewId !== item.review_id;
  return `<section class="hero-answer"><p class="eyebrow">${esc(t("parentPaperReview"))}</p><h2>${esc(paper.title)}</h2><p>${esc(t("paperReviewPurpose"))}</p>${statusChip(item.status)}<p>${esc(item.summary)}</p></section>
    ${paperItems(paper)
      .map(
        (entry) =>
          `<section class="section"><h3>${esc(entry.ref)}. ${esc(entry.prompt)}</h3>${practiceDiagram(entry)}${infoSection(t("parentAnswer"), entry.answer || entry.parent_answer || t("manualAnswer"))}${infoSection(t("solution"), entry.explanation || t("solutionMissing"))}</section>`,
      )
      .join("")}
    ${attemptHistory(paper, true)}
    ${attemptReviewForm(paper)}
    ${infoSection(t("parentNotes"), paper.analysis?.deep_notes)}
    <section class="section"><h3>${esc(t("reviewNote"))}</h3>${settled ? `<p>${esc(item.decision?.comment || t("noNote"))}</p>` : `<textarea id="reviewNote">${esc(item.decision?.comment || item.suggested_note || "")}</textarea>`}</section>`;
}

function renderReviewItem(item, snapshot) {
  const target = findTarget(snapshot, item);
  if (item.target_type === "question" && target) return renderQuestionReview(item, target);
  if (item.target_type === "paper" && target) return renderPaperReview(item, target);
  const decision = item.decision;
  const settled = ["approved", "done", "blocked"].includes(item.status) && state.reopenedReviewId !== item.review_id;
  return `
    <section class="hero-answer">
      <div class="chips">${statusChip(item.status)}${(item.risk || []).map((risk) => `<span class="chip warn">${esc(risk)}</span>`).join("")}</div>
      <h2 class="question-title">${esc(target?.title || item.title)}</h2>
      <p>${esc(t("reviewPurpose"))}</p>
      ${target?.prompt_text ? originalQuestion(target) : `<p class="note">${esc(t("missingQuestion"))}</p>`}
      <p>${esc(item.summary)}</p>
      <div class="split">
        <div class="answer-box"><span>${esc(t("nextStep"))}</span><b>${esc(nextStep(item))}</b></div>
        <div class="answer-box"><span>${esc(t("reason"))}</span><p>${esc(item.reason)}</p></div>
      </div>
    </section>
    ${listSection(t("suggestions"), item.suggestions)}
    <section class="section">
      <h3>${esc(t("reviewNote"))}</h3>
      <div class="field">
        ${settled ? `<p>${esc(decision?.comment || t("noNote"))}</p>` : `<textarea id="reviewNote">${esc(decision?.comment || item.suggested_note || "")}</textarea><p class="note">${esc(t("reviewNoteHint"))}</p>`}
      </div>
    </section>
    ${target ? `<section class="section"><h3>${esc(t("targetSection"))}</h3>${targetSummary(target, item.target_type)}</section>` : ""}
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
  if (type === "question") return renderQuestion(target, true);
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
  const tabs = ["guide", "policy", "style", "language"];
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
          ${settingsTab(config)}
        </div>
      </section>
    </div>
  `;
}

function settingsTabLabel(tab) {
  return { guide: t("guide"), policy: t("policy"), style: t("style"), language: t("language") }[tab] || tab;
}

function settingsTab(config) {
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
  if (state.settingsTab === "style") {
    return `
      <p class="note">${esc(t("styleCopy"))}</p>
      <div class="style-grid">
        ${THEME_FAMILIES.map(([id, nameKey, copyKey]) => {
          const active = activeFamily() === id ? "active" : "";
          return `<button class="style-swatch ${active}" data-family="${esc(id)}" type="button"><strong>${esc(t(nameKey))}</strong><small>${esc(t(copyKey))}</small></button>`;
        }).join("")}
      </div>
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

/**
 * Demo mode used to log "decision write skipped" and return, so every button
 * in the review queue did nothing: the app's single most important
 * interaction was unreachable in the only mode a screenshot or a recording
 * can use, and SKILL.md's "demo decisions stay in the browser and are
 * discarded on refresh" described something the code did not do.
 *
 * It now mutates the in-memory snapshot that is already rendered -- the same
 * pattern as kelly-products' postDecision() -- through the SAME
 * statusForAction() the Busabase provider calls, so the two cannot drift.
 * Nothing is persisted and nothing is sent: a refresh restores the fixture,
 * which is exactly what the ?demo= contract promises.
 */
function applyDemoDecision({ review_id, action, comment }) {
  const snapshot = state.data.snapshot || {};
  const review = (snapshot.review_items || []).find((item) => item.review_id === review_id);
  if (!review) return;
  const nextStatus = statusForAction(action);
  review.status = nextStatus;
  review.decision = { action, comment: String(comment || ""), decided_at: new Date().toISOString() };

  // The real write mirrors the status onto the target's own row; so does this.
  const targets = {
    question: [snapshot.questions, "question_id"],
    mistake: [snapshot.mistakes, "mistake_id"],
    paper: [snapshot.papers, "paper_id"],
  }[review.target_type];
  if (targets) {
    const [rows, idKey] = targets;
    const target = (rows || []).find((row) => row[idKey] === review.target_id);
    if (target) target.status = nextStatus;
  }
  state.workflowCount = null;
}

async function submitDecision(payload) {
  state.reopenedReviewId = "";
  if (state.data?.demo) {
    applyDemoDecision(payload);
    state.notice = t("decisionRecordedDemo");
    flashDecision(payload.review_id);
    return;
  }
  state.busy = true;
  try {
    const provider = await getProvider();
    await provider.submitReview(payload);
    state.notice = t("decisionRecorded");
    await loadState();
    flashDecision(payload.review_id);
  } catch (error) {
    window.alert(error.message);
  } finally {
    state.busy = false;
  }
}

/**
 * One --ease-flash highlight on the row that just took a verdict, then the
 * row settles into its new queue. Without it the most important moment in a
 * recording -- the approval landing -- happens between two frames, and a
 * viewer who does not already know what to look for sees nothing happen.
 */
function flashDecision(reviewId) {
  state.flashId = reviewId;
  render();
  window.setTimeout(() => {
    state.flashId = "";
    state.notice = "";
    render();
  }, 2400);
}

function nearestReviewForTarget(targetId) {
  return (state.data.snapshot?.review_items || []).find((item) => item.target_id === targetId);
}

async function submitMistakeCause(id) {
  if (state.busy || state.mistakeSubmissions[id]) return;
  const cause = document.getElementById("mistakeCause")?.value.trim() || "";
  if (!cause || cause.length > 2000) {
    window.alert(t("mistakeCauseRequired"));
    return;
  }
  state.mistakeDrafts[id] = cause;
  state.busy = true;
  render();
  try {
    if (state.data?.demo) {
      state.mistakeSubmissions[id] = t("mistakeCauseDemo");
    } else {
      const provider = await getProvider();
      const cr = await provider.submitMistakeCause({ mistake_id: id, cause });
      state.mistakeRequestIds[id] = cr.id;
      state.mistakeSubmissions[id] = t("causePending");
      state.causeStatus[id] = t("causePending");
      rememberCauseRequests();
    }
  } catch (error) {
    window.alert(error.message);
  } finally {
    state.busy = false;
    render();
  }
}

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.refreshCause !== undefined) {
    try {
      await loadState();
    } catch (error) {
      window.alert(error.message);
    }
    return;
  }
  if (button.dataset.practiceRequest) {
    if (state.busy) return;
    const m = (state.data?.snapshot?.mistakes || []).find((x) => x.mistake_id === button.dataset.practiceRequest);
    if (!m) return;
    state.busy = true;
    try {
      const provider = await getProvider();
      const question = state.data?.demo
        ? (state.data.snapshot.questions || []).find((q) => q.question_id === m.question_id)
        : await provider.getQuestionForMistake(m);
      const resourceContext = state.data?.demo ? {} : await provider.getPracticeContext();
      const prompt = buildPracticeRequest(m, question, {
        spaceId: appConfig.spaceId,
        ...resourceContext,
        demoOnly: Boolean(state.data?.demo),
      });
      await navigator.clipboard.writeText(prompt);
      state.notice = t("practiceCopied");
    } catch (error) {
      window.alert(error.message);
    } finally {
      state.busy = false;
      render();
    }
    return;
  }
  if (button.dataset.saveMistake) {
    await submitMistakeCause(button.dataset.saveMistake);
    return;
  }

  if (button.dataset.loadMore) {
    await loadMore(button.dataset.loadMore);
    return;
  }

  if (button.dataset.runStart) {
    startRun(button.dataset.runStart);
    return;
  }
  if (button.dataset.runSubmit !== undefined) {
    submitRunAnswer();
    return;
  }
  if (button.dataset.runHint !== undefined) {
    const runState = activeRun();
    const item = currentItem();
    if (runState && item) {
      runState.showHint = true;
      runState.hints[item.ref] = (runState.hints[item.ref] || 0) + 1;
      render();
    }
    return;
  }
  if (button.dataset.runRetry !== undefined) {
    retryRunItem();
    return;
  }
  if (button.dataset.runNext !== undefined) {
    const runState = activeRun();
    if (runState) runState.showHint = false;
    nextRunItem();
    return;
  }
  if (button.dataset.runFinish !== undefined) {
    await finishRun();
    return;
  }
  if (button.dataset.runExit !== undefined) {
    exitRun();
    return;
  }

  const route = button.dataset.route;
  if (route) {
    state.run = null;
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

  if (button.dataset.family) {
    localStorage.setItem("khc-theme", button.dataset.family);
    applyFamily();
    render();
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

  if (button.dataset.copy) {
    const target = document.querySelector(button.dataset.copy);
    await navigator.clipboard.writeText(target?.textContent || "");
    return;
  }

  if (button.dataset.copyPrompt === "photo") {
    const prompt = state.localPhotoName
      ? `/kelly-homework-coach I selected a local homework photo named "${state.localPhotoName}". Please analyze it, explain it gently, and record the result with scripts/record_homework.mjs.`
      : "/kelly-homework-coach Help me analyze the next homework photo, explain it gently, and record the result with scripts/record_homework.mjs.";
    await navigator.clipboard.writeText(prompt);
    return;
  }

  if (button.dataset.submitAttemptReview) {
    const paper = (state.data?.snapshot?.papers || []).find(
      (entry) => entry.paper_id === button.dataset.submitAttemptReview,
    );
    const attempt = paper && latestAttempt(paper);
    if (!attempt) return;
    const open = (attempt.results || []).filter((entry) => entry.outcome === "ungraded");
    const verdicts = open.map((entry) => ({
      ref: entry.ref,
      outcome: document.getElementById(`attemptVerdict${entry.ref}`)?.value || "",
    }));
    const comment = document.getElementById("attemptNote")?.value?.trim() || "";
    const errorNotice = document.querySelector("[data-attempt-review-error]");
    if (!comment || verdicts.some((v) => !["correct", "wrong"].includes(v.outcome))) {
      if (errorNotice) {
        errorNotice.textContent = t("reviewAttemptRequired");
        errorNotice.hidden = false;
        errorNotice.scrollIntoView({ block: "nearest" });
      }
      return;
    }
    if (errorNotice) errorNotice.hidden = true;
    if (state.busy || state.attemptReviewRequests[paper.paper_id]) return;
    state.busy = true;
    button.disabled = true;
    try {
      if (state.data.demo) {
        (paper.analysis.attempt_reviews ||= []).push({
          attempted_at: attempt.attempted_at,
          verdicts,
          comment,
          reviewed_at: new Date().toISOString(),
        });
        state.notice = t("decisionRecordedDemo");
        render();
      } else {
        const provider = await getProvider();
        const result = await provider.submitAttemptReview({
          paper_id: paper.paper_id,
          attempted_at: attempt.attempted_at,
          verdicts,
          comment,
        });
        state.attemptReviewRequests[paper.paper_id] = result.id;
        state.notice = `${t("attemptReviewPending")} ${result.id}`;
        render();
      }
    } catch (error) {
      if (errorNotice) {
        errorNotice.textContent = error.message;
        errorNotice.hidden = false;
      }
      button.disabled = false;
    } finally {
      state.busy = false;
    }
    return;
  }

  if (button.dataset.decisionAction) {
    const comment = document.getElementById("reviewNote")?.value || "";
    await submitDecision({
      review_id: button.dataset.reviewId,
      action: button.dataset.decisionAction,
      comment,
    });
    return;
  }

  if (button.dataset.reopenReview) {
    state.reopenedReviewId = button.dataset.reopenReview;
    render();
    return;
  }
  if (button.dataset.copyStudentFeedback) {
    const q = (state.data.snapshot.questions || []).find((q) => q.question_id === button.dataset.copyStudentFeedback);
    await navigator.clipboard.writeText(
      `${t("feedbackChatPrompt")} ${q?.title || ""}\n${q?.prompt_text || ""}\n${state.studentFeedback[q?.question_id] || ""}`,
    );
    state.notice = t("feedbackCopied");
    render();
    return;
  }
  if (button.dataset.understand || button.dataset.needHelp) {
    const id = button.dataset.understand || button.dataset.needHelp;
    state.studentFeedback[id] = button.dataset.understand ? t("studentUnderstoodLocal") : t("studentNeedsHelpLocal");
    render();
    return;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (!(event.target instanceof Element) || event.target.id !== "runAnswer") return;
  event.preventDefault();
  submitRunAnswer();
});

document.addEventListener("input", (event) => {
  if (event.target instanceof HTMLTextAreaElement && event.target.dataset.mistakeDraft)
    state.mistakeDrafts[event.target.dataset.mistakeDraft] = event.target.value;
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

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
    setInterval(() => loadState({ quiet: true }), 20000);
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    app.innerHTML = `<main class="setup"><section class="setup-panel"><h1>Kelly Homework Coach</h1><p class="note">${esc(error.message)}</p></section></main>`;
  }
}

applyFamily();
boot();
