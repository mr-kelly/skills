import {
  attentionBadge,
  clarityBar,
  date,
  els,
  escapeHtml,
  filteredIdeas,
  ideaById,
  loadState,
  lockBanner,
  noticeBanner,
  pagerControl,
  render,
  stageBadge,
  state,
  t,
  warnings,
} from "../app.js";
import { DOC_KINDS, STAGES } from "./ideas-model.js?v=0.1.0";
import { hydrateDocumentVisuals, renderMarkdownDocument } from "./markdown-renderer.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";

const DOC_TABS = ["overview", "questions", ...DOC_KINDS];

function ideaRow(idea) {
  const active = state.route.id === idea.record_id ? "active" : "";
  const oneLiner = idea.one_liner || `<span class="muted">${t("noOneLiner")}</span>`;
  return `
    <a class="row idea-row ${active}" href="#/ideas/${encodeURIComponent(idea.record_id)}">
      <div class="row-main">
        <div class="row-title">${escapeHtml(idea.title)}</div>
        <div class="row-sub">${oneLiner}</div>
      </div>
      <div class="row-meta">
        ${stageBadge(idea.stage)}
        ${attentionBadge(idea)}
      </div>
    </a>
  `;
}

export function renderIdeas() {
  const ideas = filteredIdeas();
  els.title.textContent = t("ideasTitle");
  els.subtitle.textContent = t("ideasSubtitle").replace("{count}", String(ideas.length));
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    <div class="list-pane">
      ${ideas.length ? ideas.map(ideaRow).join("") : `<div class="empty">${t("noIdeas")}</div>`}
    </div>
    ${pagerControl("ideas")}
  `;
}

function questionCard(question) {
  const answered = question.status === "answered";
  const skipped = question.status === "skipped";
  const stateClass = answered ? "answered" : skipped ? "skipped" : "open";
  const why = question.why_asking ? `<p class="question-why">${escapeHtml(question.why_asking)}</p>` : "";
  const body = answered
    ? `<blockquote class="question-answer">${escapeHtml(question.answer)}</blockquote>`
    : skipped
      ? `<p class="muted">${t("questionSkipped")}</p>`
      : `
        <textarea class="question-input" data-answer-for="${escapeHtml(question.record_id)}"
          rows="3" placeholder="${t("answerPlaceholder")}"></textarea>
        <div class="question-actions">
          <button type="button" class="btn primary" data-answer="${escapeHtml(question.record_id)}">${t("submitAnswer")}</button>
          <button type="button" class="btn quiet" data-skip="${escapeHtml(question.record_id)}">${t("skipQuestion")}</button>
        </div>
      `;
  return `
    <li class="question ${stateClass}">
      <div class="question-head">
        <span class="badge stage">${t(`stage_${question.stage}`)}</span>
        <span class="question-text">${escapeHtml(question.question)}</span>
      </div>
      ${why}
      ${body}
    </li>
  `;
}

function overviewTab(idea) {
  const field = (label, value) =>
    `<div class="field"><dt>${label}</dt><dd>${value ? escapeHtml(value) : `<span class="muted">${t("notAnswered")}</span>`}</dd></div>`;
  const advance = idea.advance;
  let gate = "";
  if (advance.reason === "complete") {
    gate = `<div class="gate done">${t("gateComplete")}</div>`;
  } else if (advance.reason === "parked") {
    gate = `<div class="gate parked">${t("gateParked")}</div>`;
  } else if (advance.canAdvance) {
    gate = `
      <div class="gate ready">
        <p>${t("gateReady").replace("{stage}", t(`stage_${advance.target}`))}</p>
        <button type="button" class="btn primary" data-advance="${escapeHtml(idea.record_id)}">
          ${t("advanceTo").replace("{stage}", t(`stage_${advance.target}`))}
        </button>
      </div>
    `;
  } else {
    const blockers = advance.missingFields.length
      ? advance.missingFields.map((f) => t(`field_${f}`)).join("、")
      : t("openQuestionsCount").replace("{count}", String(advance.openQuestions.length));
    gate = `<div class="gate blocked"><p>${t("gateBlocked").replace("{blockers}", escapeHtml(blockers))}</p></div>`;
  }
  return `
    ${gate}
    <dl class="fields">
      ${field(t("field_one_liner"), idea.one_liner)}
      ${field(t("field_who"), idea.who)}
      ${field(t("field_problem"), idea.problem)}
      ${field(t("field_why_now"), idea.why_now)}
    </dl>
    ${idea.notes ? `<section class="notes"><h3>${t("notes")}</h3><p>${escapeHtml(idea.notes)}</p></section>` : ""}
  `;
}

function documentTab(idea, kind) {
  const doc = idea.documents[kind];
  if (!doc) {
    const reachable = STAGES.indexOf(idea.stage) >= STAGES.indexOf(kind);
    return `<div class="empty">${reachable ? t("docNotWritten") : t("docLocked").replace("{stage}", t(`stage_${kind}`))}</div>`;
  }
  const gaps = doc.gaps.length
    ? `<div class="gaps"><h4>${t("gaps")}</h4><ul>${doc.gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul></div>`
    : "";
  return `
    <div class="doc">
      <div class="doc-head">
        <span class="badge ${doc.status === "已完善" ? "ok" : "draft"}">${escapeHtml(doc.status)}</span>
        <span class="muted">v${doc.version} · ${date(doc.updated_at)}</span>
      </div>
      ${gaps}
      <article class="doc-body">${renderMarkdownDocument(doc.body)}</article>
    </div>
  `;
}

export function renderIdeaDetail() {
  const idea = ideaById(state.route.id);
  if (!idea) {
    els.title.textContent = t("ideasTitle");
    els.content.innerHTML = `<div class="empty">${t("ideaNotFound")}</div>`;
    return;
  }
  const tab = DOC_TABS.includes(state.route.tab) ? state.route.tab : "overview";
  els.title.textContent = idea.title;
  els.subtitle.textContent = idea.one_liner || t("noOneLiner");

  const openCount = idea.questions.filter((q) => q.status === "open").length;
  const tabs = DOC_TABS.map((key) => {
    const label = key === "overview" ? t("tabOverview") : key === "questions" ? t("tabQuestions") : key.toUpperCase();
    const badge = key === "questions" && openCount ? `<span class="tab-badge">${openCount}</span>` : "";
    return `<a class="tab ${key === tab ? "active" : ""}" href="#/ideas/${encodeURIComponent(idea.record_id)}/${key}">${label}${badge}</a>`;
  }).join("");

  let body;
  if (tab === "overview") body = overviewTab(idea);
  else if (tab === "questions") {
    body = idea.questions.length
      ? `<ul class="questions">${idea.questions.map(questionCard).join("")}</ul>`
      : `<div class="empty">${t("noQuestions")}</div>`;
  } else body = documentTab(idea, tab);

  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    <a class="back-to-list" href="#/ideas">${t("backToList")}</a>
    <header class="detail-head">
      <div class="detail-badges">${stageBadge(idea.stage)}${attentionBadge(idea)}</div>
      ${clarityBar(idea)}
    </header>
    <nav class="tabs">${tabs}</nav>
    <div class="tab-body">${body}</div>
  `;
  bindDetailEvents();
  void hydrateDocumentVisuals(els.content);
}

function bindDetailEvents() {
  els.content.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.answer;
      const input = els.content.querySelector(`[data-answer-for="${CSS.escape(id)}"]`);
      const answer = String(input?.value || "").trim();
      if (!answer) {
        state.notice = t("answerEmpty");
        render();
        return;
      }
      await applyAndReload({ action: "answer", question_id: id, answer });
    });
  });
  els.content.querySelectorAll("[data-skip]").forEach((button) => {
    button.addEventListener("click", () => applyAndReload({ action: "skip", question_id: button.dataset.skip }));
  });
  els.content.querySelectorAll("[data-advance]").forEach((button) => {
    button.addEventListener("click", () => applyAndReload({ action: "advance", idea_id: button.dataset.advance }));
  });
}

async function applyAndReload(payload) {
  try {
    const provider = await getProvider();
    await provider.applyDecision(payload);
    await loadState();
  } catch (error) {
    state.notice = String(error?.message || error);
    render();
  }
}

// Sidebar BRD / MRD / PRD: show that document for the currently selected idea.
// With nothing selected yet, list the ideas that have one so the operator picks
// a subject first -- a document view with no idea behind it would be a blank
// screen with no way forward.
export function renderDocumentView(kind) {
  const idea = ideaById(state.selectedIdeaId);
  els.title.textContent = kind.toUpperCase();
  if (!idea) {
    const withDoc = filteredIdeas().filter((item) => item.documents[kind]);
    els.subtitle.textContent = t("pickIdeaFirst");
    els.content.innerHTML = `
      ${lockBanner()}
      ${noticeBanner()}
      <div class="list-pane">
        ${
          withDoc.length
            ? withDoc.map(ideaRow).join("")
            : `<div class="empty">${t("noDocsOfKind").replace("{kind}", kind.toUpperCase())}</div>`
        }
      </div>
    `;
    return;
  }
  els.subtitle.textContent = idea.title;
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    <header class="detail-head">
      <div class="detail-badges">${stageBadge(idea.stage)}${attentionBadge(idea)}</div>
      ${clarityBar(idea)}
    </header>
    <nav class="tabs">
      <a class="tab" href="#/ideas/${encodeURIComponent(idea.record_id)}">${t("tabOverview")}</a>
      <a class="tab" href="#/ideas/${encodeURIComponent(idea.record_id)}/questions">${t("tabQuestions")}</a>
    </nav>
    <div class="tab-body">${documentTab(idea, kind)}</div>
  `;
  void hydrateDocumentVisuals(els.content);
}

export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  const bases = state.settings?.resources || [];
  els.title.textContent = t("settingsTitle");
  els.subtitle.textContent = "";
  els.content.innerHTML = `
    ${lockBanner()}
    <section class="settings-block">
      <h3>${t("connection")}</h3>
      <dl class="fields">
        <div class="field"><dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "")}</dd></div>
        <div class="field"><dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd></div>
      </dl>
    </section>
    <section class="settings-block">
      <h3>${t("operator")}</h3>
      <dl class="fields">
        <div class="field"><dt>${t("name")}</dt><dd>${escapeHtml(operator.name || "")}</dd></div>
        <div class="field"><dt>${t("role")}</dt><dd>${escapeHtml(operator.role || "")}</dd></div>
      </dl>
    </section>
    ${
      bases.length
        ? `<section class="settings-block"><h3>${t("resources")}</h3><ul>${bases
            .map((b) => `<li>${escapeHtml(b.name || b.key)}</li>`)
            .join("")}</ul></section>`
        : ""
    }
  `;
}
