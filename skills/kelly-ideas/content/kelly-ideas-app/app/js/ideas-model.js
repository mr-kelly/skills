// Pure domain logic for kelly-ideas: turn normalized Busabase records (one array
// per Base, snake_case field keys) into the snapshot the UI renders.
//
// The ladder gate lives here rather than in a view, because "can this idea
// advance?" is the one rule the whole product exists to enforce, and it has to
// give the same answer to the UI, the tests, and the Agent.

export const STAGES = ["idea", "brd", "mrd", "prd"];
export const DOC_KINDS = ["brd", "mrd", "prd"];
export const QUESTION_STATUS = ["open", "answered", "skipped"];

// What must be answered before an idea may climb off a rung. Keyed by the rung
// being left, so REQUIRED_TO_LEAVE.idea is what it takes to earn a BRD.
export const REQUIRED_TO_LEAVE = {
  idea: ["one_liner", "who"],
  brd: ["problem", "why_now"],
  mrd: [],
  prd: [],
};

const STATUS_PARKED = "已搁置";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isBlank(value) {
  return !String(value ?? "").trim();
}

// One normalizer per Base, each exported so a later page appended to an
// already-normalized snapshot runs the exact same coercion the first page did.
// A second hand-copied normalizer diverges the moment either side gains a field.
export function normalizeIdeaRow(row) {
  return {
    record_id: row.record_id || "",
    title: row.title || "",
    one_liner: row.one_liner || "",
    problem: row.problem || "",
    who: row.who || "",
    why_now: row.why_now || "",
    stage: STAGES.includes(row.stage) ? row.stage : "idea",
    status: row.status || "",
    clarity: toNumber(row.clarity, 0),
    open_questions: toNumber(row.open_questions, 0),
    source: row.source || "",
    tags: parseJsonList(row.tags),
    agent_next_action: row.agent_next_action || "",
    notes: row.notes || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

export function normalizeDocumentRow(row) {
  return {
    record_id: row.record_id || "",
    idea_id: row.idea_id || "",
    kind: DOC_KINDS.includes(row.kind) ? row.kind : "brd",
    title: row.title || "",
    body: row.body || "",
    status: row.status || "",
    version: toNumber(row.version, 1),
    gaps: parseJsonList(row.gaps),
    updated_at: row.updated_at || "",
  };
}

export function normalizeQuestionRow(row) {
  const answer = row.answer || "";
  const declared = row.status || "";
  return {
    record_id: row.record_id || "",
    idea_id: row.idea_id || "",
    stage: STAGES.includes(row.stage) ? row.stage : "idea",
    question: row.question || "",
    why_asking: row.why_asking || "",
    answer,
    // A row is only "answered" when it actually carries an answer. Trusting a
    // stale status field would let an emptied answer still gate-pass.
    status: declared === "skipped" ? "skipped" : answer.trim() ? "answered" : "open",
    position: toNumber(row.position, 0),
    asked_at: row.asked_at || "",
    answered_at: row.answered_at || "",
  };
}

export const NORMALIZE_ROW_BY_KEY = {
  ideas: normalizeIdeaRow,
  documents: normalizeDocumentRow,
  questions: normalizeQuestionRow,
};

// Which required fields for leaving `stage` are still blank on this idea.
export function missingForStage(idea, stage) {
  return asArray(REQUIRED_TO_LEAVE[stage]).filter((field) => isBlank(idea?.[field]));
}

export function nextStage(stage) {
  const index = STAGES.indexOf(stage);
  if (index < 0 || index >= STAGES.length - 1) return null;
  return STAGES[index + 1];
}

// The gate. An idea advances only when its own required fields are filled AND
// no question on the current rung is still open. Parked ideas never advance.
export function advanceCheck(idea, questions = []) {
  const target = nextStage(idea.stage);
  if (idea.status === STATUS_PARKED) {
    return { canAdvance: false, target: null, missingFields: [], openQuestions: [], reason: "parked" };
  }
  if (!target) {
    return { canAdvance: false, target: null, missingFields: [], openQuestions: [], reason: "complete" };
  }
  const missingFields = missingForStage(idea, idea.stage);
  const openQuestions = asArray(questions).filter(
    (q) => q.idea_id === idea.record_id && q.stage === idea.stage && q.status === "open",
  );
  const canAdvance = missingFields.length === 0 && openQuestions.length === 0;
  return {
    canAdvance,
    target,
    missingFields,
    openQuestions,
    reason: canAdvance ? "ready" : missingFields.length ? "missing_fields" : "open_questions",
  };
}

// Clarity is derived, never trusted from the row: a stored score would drift
// the moment an answer is edited. 0-100 across ladder progress, required
// fields, and answered questions.
export function clarityFor(idea, questions = [], documents = []) {
  const stageScore = (STAGES.indexOf(idea.stage) / (STAGES.length - 1)) * 40;
  const required = ["one_liner", "who", "problem", "why_now"];
  const filled = required.filter((field) => !isBlank(idea[field])).length;
  const fieldScore = (filled / required.length) * 30;
  const mine = asArray(questions).filter((q) => q.idea_id === idea.record_id);
  const answered = mine.filter((q) => q.status !== "open").length;
  const questionScore = mine.length ? (answered / mine.length) * 20 : 0;
  const settled = asArray(documents).filter((doc) => doc.idea_id === idea.record_id && doc.status === "已完善").length;
  const docScore = Math.min(settled / DOC_KINDS.length, 1) * 10;
  return Math.round(stageScore + fieldScore + questionScore + docScore);
}

// Task language for the human attention panel, per the UI contract: say what
// the operator can do, not what state a row is in.
export function attentionFor(idea, questions = []) {
  if (idea.status === STATUS_PARKED) return "parked";
  const open = asArray(questions).filter((q) => q.idea_id === idea.record_id && q.status === "open");
  if (open.length) return "needs_answer";
  const check = advanceCheck(idea, questions);
  if (check.reason === "missing_fields") return "needs_answer";
  if (check.canAdvance) return "ready_for_agent";
  return "settled";
}

export function buildSnapshot({ ideas = [], documents = [], questions = [] } = {}) {
  const normalizedDocuments = asArray(documents).map(normalizeDocumentRow);
  const normalizedQuestions = asArray(questions).map(normalizeQuestionRow);
  const normalizedIdeas = asArray(ideas).map(normalizeIdeaRow);

  const enriched = normalizedIdeas.map((idea) => {
    const mineQuestions = normalizedQuestions
      .filter((q) => q.idea_id === idea.record_id)
      .sort((a, b) => a.position - b.position);
    const mineDocuments = normalizedDocuments.filter((doc) => doc.idea_id === idea.record_id);
    const byKind = {};
    for (const kind of DOC_KINDS) {
      byKind[kind] = mineDocuments.find((doc) => doc.kind === kind) || null;
    }
    const check = advanceCheck(idea, normalizedQuestions);
    return {
      ...idea,
      clarity: clarityFor(idea, normalizedQuestions, normalizedDocuments),
      open_questions: mineQuestions.filter((q) => q.status === "open").length,
      questions: mineQuestions,
      documents: byKind,
      advance: check,
      attention: attentionFor(idea, normalizedQuestions),
    };
  });

  return {
    ideas: enriched,
    documents: normalizedDocuments,
    questions: normalizedQuestions,
    counts: {
      total: enriched.length,
      needsAnswer: enriched.filter((i) => i.attention === "needs_answer").length,
      readyForAgent: enriched.filter((i) => i.attention === "ready_for_agent").length,
      parked: enriched.filter((i) => i.attention === "parked").length,
    },
  };
}
