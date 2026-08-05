// Domain model for Kelly Homework Coach's child-friendly homework desk,
// ported verbatim where a matching function already existed (same variable
// names, same order of operations, only TS types stripped) from the retired
// lib/types.ts and lib/data-provider/local-file-provider.ts. Kelly Homework
// Coach never had a busabase-provider.ts to carry forward, so this Base
// design (questions / mistakes / papers / reviews / settings) is new.
//
// Architectural change from the retired local-file shape: a reviewer's
// decision now lives directly on the review's own Busabase record (decision
// fields alongside the raw review fields) instead of a separate
// decisions.json bucket keyed by review id — same pattern used across this
// batch of Busabase-only conversions (see kelly-finance, kelly-disclosure-
// tracker). The retired agent_tasks.json queue is gone too: a "task" was
// always just a review whose status is changes_requested, so it is derived
// on read (pendingAgentTasks()) instead of stored separately — reads are
// always live under Busabase, so there is nothing to go stale. The retired
// activity_log array is dropped entirely: grep of the retired app/app.js
// shows it was never rendered anywhere in the UI, so there is no reader to
// port it for.

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

// Ported verbatim from nextStatusForDecision() in the retired
// lib/data-provider/local-file-provider.ts.
export function statusForAction(action = "") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return "needs_review";
}

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields). One helper per Base, mirroring
// baseCheckFields() in kelly-finance's finance-model.js.
export function baseQuestionFields({
  question_id = "",
  ref = 0,
  title = "",
  subject = "",
  grade = "",
  topic = "",
  source = "text",
  status = "needs_review",
  difficulty = "medium",
  photo_label = "",
  prompt_text = "",
  student_answer = "",
  correct_answer = "",
  outcome = "in_progress",
  confidence = 0,
  created_at = "",
  tags = [],
  explanation = emptyExplanation(),
  mistake_id = "",
} = {}) {
  return {
    question_id,
    ref: Number(ref) || 0,
    title,
    subject,
    grade,
    topic,
    source,
    status,
    difficulty,
    photo_label,
    prompt_text,
    student_answer,
    correct_answer,
    outcome,
    confidence: Number(confidence) || 0,
    created_at,
    tags: JSON.stringify(tags || []),
    explanation: JSON.stringify(explanation || {}),
    mistake_id,
  };
}

export function baseMistakeFields({
  mistake_id = "",
  question_id = "",
  ref = 0,
  subject = "",
  topic = "",
  mistake_type = "",
  status = "needs_review",
  last_seen = "",
  next_review_at = "",
  attempts = 0,
  review_history = [],
  analysis = emptyMistakeAnalysis(),
} = {}) {
  return {
    mistake_id,
    question_id,
    ref: Number(ref) || 0,
    subject,
    topic,
    mistake_type,
    status,
    last_seen,
    next_review_at,
    attempts: Number(attempts) || 0,
    review_history: JSON.stringify(review_history || []),
    analysis: JSON.stringify(analysis || {}),
  };
}

export function basePaperFields({
  paper_id = "",
  ref = 0,
  title = "",
  subject = "",
  grade = "",
  status = "needs_review",
  generated_at = "",
  focus_topics = [],
  linked_mistakes = [],
  question_count = 0,
  estimated_minutes = 0,
  difficulty_mix = {},
  items = [],
  analysis = emptyPaperAnalysis(),
} = {}) {
  return {
    paper_id,
    ref: Number(ref) || 0,
    title,
    subject,
    grade,
    status,
    generated_at,
    focus_topics: JSON.stringify(focus_topics || []),
    linked_mistakes: JSON.stringify(linked_mistakes || []),
    question_count: Number(question_count) || 0,
    estimated_minutes: Number(estimated_minutes) || 0,
    difficulty_mix: JSON.stringify(difficulty_mix || {}),
    items: JSON.stringify(items || []),
    analysis: JSON.stringify(analysis || {}),
  };
}

export function baseReviewFields({
  review_id = "",
  ref = 0,
  target_type = "question",
  target_id = "",
  title = "",
  status = "needs_review",
  summary = "",
  risk = [],
  proposed_action = "no_action",
  reason = "",
  suggestions = [],
  suggested_note = "",
  decision_action = "",
  decision_comment = "",
  decided_at = "",
  execution_status = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  return {
    review_id,
    ref: Number(ref) || 0,
    target_type,
    target_id,
    title,
    status,
    summary,
    risk: JSON.stringify(risk || []),
    proposed_action,
    reason,
    suggestions: JSON.stringify(suggestions || []),
    suggested_note,
    decision_action,
    decision_comment,
    decided_at,
    execution_status,
    execution_detail,
    executed_at,
  };
}

function emptyExplanation() {
  return { kid_summary: "", steps: [], key_concept: "", self_check: "", next_hint: "" };
}

function emptyMistakeAnalysis() {
  return { root_cause: "", misconception: "", fix_strategy: "", similar_prompt: "", parent_note: "" };
}

function emptyPaperAnalysis() {
  return { wrong_count: 0, strengths: [], review_plan: [], deep_notes: "" };
}

function parseJsonArray(value = "") {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value = "") {
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Normalizes a Busabase `questions` row (already snake_cased by the
// provider) into the structured HomeworkQuestion shape the UI renders.
export function computeQuestionFromRow({
  question_id = "",
  ref = 0,
  title = "",
  subject = "",
  grade = "",
  topic = "",
  source = "text",
  status = "needs_review",
  difficulty = "medium",
  photo_label = "",
  prompt_text = "",
  student_answer = "",
  correct_answer = "",
  outcome = "in_progress",
  confidence = 0,
  created_at = "",
  tags = "",
  explanation = "",
  mistake_id = "",
} = {}) {
  return {
    question_id,
    ref: Number(ref) || 0,
    title,
    subject,
    grade,
    topic,
    source,
    status,
    difficulty,
    photo_label,
    prompt_text,
    student_answer,
    correct_answer,
    outcome,
    confidence: Number(confidence) || 0,
    created_at,
    tags: parseJsonArray(tags),
    explanation: { ...emptyExplanation(), ...parseJsonObject(explanation) },
    mistake_id,
  };
}

// Normalizes a Busabase `mistakes` row into the structured MistakeItem shape.
export function computeMistakeFromRow({
  mistake_id = "",
  question_id = "",
  ref = 0,
  subject = "",
  topic = "",
  mistake_type = "",
  status = "needs_review",
  last_seen = "",
  next_review_at = "",
  attempts = 0,
  review_history = "",
  analysis = "",
} = {}) {
  return {
    mistake_id,
    question_id,
    ref: Number(ref) || 0,
    subject,
    topic,
    mistake_type,
    status,
    last_seen,
    next_review_at,
    attempts: Number(attempts) || 0,
    review_history: parseJsonArray(review_history),
    analysis: { ...emptyMistakeAnalysis(), ...parseJsonObject(analysis) },
  };
}

// Normalizes a Busabase `papers` row into the structured PracticePaper shape.
export function computePaperFromRow({
  paper_id = "",
  ref = 0,
  title = "",
  subject = "",
  grade = "",
  status = "needs_review",
  generated_at = "",
  focus_topics = "",
  linked_mistakes = "",
  question_count = 0,
  estimated_minutes = 0,
  difficulty_mix = "",
  items = "",
  analysis = "",
} = {}) {
  return {
    paper_id,
    ref: Number(ref) || 0,
    title,
    subject,
    grade,
    status,
    generated_at,
    focus_topics: parseJsonArray(focus_topics),
    linked_mistakes: parseJsonArray(linked_mistakes),
    question_count: Number(question_count) || 0,
    estimated_minutes: Number(estimated_minutes) || 0,
    difficulty_mix: parseJsonObject(difficulty_mix),
    items: parseJsonArray(items),
    analysis: { ...emptyPaperAnalysis(), ...parseJsonObject(analysis) },
  };
}

// Normalizes a Busabase `reviews` row into the structured ReviewItem shape,
// with the decision assembled from decision_action/decision_comment/
// decided_at (mirrors computeCheckFromRow() in kelly-finance's
// finance-model.js).
export function computeReviewFromRow({
  review_id = "",
  ref = 0,
  target_type = "question",
  target_id = "",
  title = "",
  status = "needs_review",
  summary = "",
  risk = "",
  proposed_action = "no_action",
  reason = "",
  suggestions = "",
  suggested_note = "",
  decision_action = "",
  decision_comment = "",
  decided_at = "",
  execution_status = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  const decision = decision_action
    ? { action: decision_action, comment: decision_comment || "", decided_at: decided_at || "" }
    : undefined;
  return {
    review_id,
    ref: Number(ref) || 0,
    target_type,
    target_id,
    title,
    status,
    summary,
    risk: parseJsonArray(risk),
    proposed_action,
    reason,
    suggestions: parseJsonArray(suggestions),
    suggested_note,
    // Flat pass-through fields (kept alongside the nested `decision`/
    // `execution` convenience objects below) so this normalized shape can
    // round-trip straight back into baseReviewFields() without a second,
    // shape-mismatched mapping step — see submitReview() in
    // providers/busabase-provider.js and scripts/execute_decisions.mjs.
    decision_action,
    decision_comment,
    decided_at,
    execution_status,
    execution_detail,
    executed_at,
    decision,
    execution: decision_action
      ? { status: execution_status || "", detail: execution_detail || "", executed_at: executed_at || "" }
      : undefined,
  };
}

// A "task" in the retired agent_tasks.json was always exactly a review that
// had been sent back with request_changes; there is no separate queue in the
// Busabase-only shape, so it is derived from the reviews list on every read.
// Mirrors TASK_BY_TARGET's mapping from the retired local-file-provider.ts.
const TASK_BY_TARGET = { question: "explain_again", mistake: "review_mistake", paper: "revise_paper" };

export function pendingAgentTasks(reviews = []) {
  return reviews
    .filter((item) => item.status === "changes_requested")
    .map((item) => ({
      task_id: `task-${item.review_id}`,
      type: TASK_BY_TARGET[item.target_type] || "review_mistake",
      review_id: item.review_id,
      target_id: item.target_id,
      ref: item.ref,
      comment: item.decision?.comment || "",
      requested_at: item.decision?.decided_at || "",
      status: "queued",
    }));
}

// Ported verbatim (reverse-engineered against the retired demo dataset,
// where mistakes_total/papers_generated exactly equal array length and
// active_questions/due_reviews exactly equal the not-done count): the two
// remaining fields (mastery_score, questions_analyzed) are an all-time
// aggregate history that the visible question/mistake/paper lists cannot
// reproduce (the retired demo has questions_analyzed=18 against only 3
// question rows), so they stay authored values from the settings row,
// carried straight through instead of recomputed.
export function computeMetrics({
  questions = [],
  mistakes = [],
  papers = [],
  mastery_score = 0,
  questions_analyzed = 0,
} = {}) {
  return {
    active_questions: questions.filter((item) => item.status !== "done").length,
    mistakes_total: mistakes.length,
    due_reviews: mistakes.filter((item) => item.status !== "done").length,
    papers_generated: papers.length,
    mastery_score: Number(mastery_score) || 0,
    questions_analyzed: Number(questions_analyzed) || 0,
  };
}

// Assembles the full HomeworkSnapshot shape the UI renders, mirroring the
// retired HomeworkSnapshot interface (lib/types.ts) minus activity_log (see
// module comment). `questions`/`mistakes`/`papers`/`reviews` must already be
// normalized via the compute*FromRow() helpers above.
export function assembleSnapshot({
  profile = { display_name: "", grade: "", language: "Auto", timezone: "" },
  questions = [],
  mistakes = [],
  papers = [],
  reviews = [],
  mastery_score = 0,
  questions_analyzed = 0,
} = {}) {
  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-homework-coach",
    profile,
    metrics: computeMetrics({ questions, mistakes, papers, mastery_score, questions_analyzed }),
    questions,
    mistakes,
    papers,
    review_items: reviews,
    warnings:
      questions.length || mistakes.length || papers.length
        ? []
        : [
            {
              id: "no-snapshot",
              severity: "info",
              message:
                "No homework has been recorded yet. Photograph a question or ask the agent to prepare a demo homework batch.",
            },
          ],
  };
}

// Ported verbatim from sanitizeObject() in the retired
// lib/data-provider/local-file-provider.ts: never leaks a secret-shaped
// value, only whether one is set.
export function sanitizeObject(input = {}) {
  const blocked = new Set(["api_key", "token", "password", "secret", "cookie"]);
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    output[key] = [...blocked].some((needle) => key.toLowerCase().includes(needle)) ? Boolean(value) : value;
  }
  return output;
}

// Ported in spirit from summarizeConfig() in the retired
// local-file-provider.ts; `payload` is the parsed settings row's JSON.
export function buildConfigSummary(payload = {}) {
  const profile = payload.student_profile || {};
  return {
    config_source: "busabase",
    student_profile: {
      display_name: String(profile.display_name || ""),
      grade: String(profile.grade || ""),
      language: String(profile.language || "Auto"),
      timezone: String(profile.timezone || ""),
    },
    subjects: Array.isArray(payload.subjects) ? payload.subjects.map(String) : [],
    learning_policy: sanitizeObject(payload.learning_policy || {}),
    practice_defaults: sanitizeObject(payload.practice_defaults || {}),
    export: sanitizeObject(payload.export || {}),
  };
}

function L(zh, en, zhText) {
  return zh ? zhText : en;
}

// Deterministic, explicitly-labeled demo dataset — ported verbatim (same
// fixed timestamp, same question/mistake/paper/review figures) from the
// retired app/server/demo.ts's demoSnapshot(). Shared by
// js/providers/demo-provider.js so the offline ?demo= scenario always
// matches what the retired server used to return. activity_log is dropped
// (see module comment); every image field stays a photo_label string, never
// a real photo or data URL.
export function demoSnapshot(lang = "en") {
  const zh = lang.startsWith("zh");
  const now = "2026-07-11T09:30:00.000Z";

  const questions = [
    {
      question_id: "q-subtract-302",
      ref: 1,
      title: L(zh, "763 - 428 with regrouping", "763 - 428 退位減法"),
      subject: L(zh, "Math", "數學"),
      grade: L(zh, "Grade 4", "小四"),
      topic: L(zh, "Subtraction with regrouping", "退位減法"),
      source: "photo",
      status: "needs_review",
      difficulty: "medium",
      photo_label: L(zh, "Homework photo, page 18 question 6", "作業相：第18頁第6題"),
      prompt_text: L(zh, "Calculate 763 - 428. Show your work.", "計算 763 - 428，並列出計算過程。"),
      student_answer: "345",
      correct_answer: "335",
      outcome: "wrong",
      confidence: 0.92,
      created_at: "2026-07-11T07:40:00.000Z",
      tags: [L(zh, "borrowing", "退位"), L(zh, "place value", "位值")],
      mistake_id: "m-borrowing-01",
      explanation: {
        kid_summary: L(
          zh,
          "You were very close. The tens column needs one more check after borrowing from the hundreds.",
          "你已經好接近。借位之後，十位要再檢查一次。",
        ),
        steps: [
          L(
            zh,
            "Ones: 3 cannot take away 8, so borrow 1 ten. 13 - 8 = 5.",
            "個位：3 不夠減 8，向十位借 1。13 - 8 = 5。",
          ),
          L(zh, "Tens: 6 became 5 after lending. 5 - 2 = 3.", "十位：6 借走 1 之後變成 5。5 - 2 = 3。"),
          L(zh, "Hundreds: 7 - 4 = 3. So the answer is 335.", "百位：7 - 4 = 3。所以答案是 335。"),
        ],
        key_concept: L(
          zh,
          "Borrowing changes the next column before you subtract it.",
          "借位會令隔離一欄先改變，再做減法。",
        ),
        self_check: L(zh, "Check by adding 335 + 428. It should return 763.", "用加法驗算：335 + 428 應該等於 763。"),
        next_hint: L(
          zh,
          "Circle the column you borrowed from so you remember it changed.",
          "圈住借位嗰一欄，就會記得佢已經變咗。",
        ),
      },
    },
    {
      question_id: "q-fraction-pizza",
      ref: 2,
      title: L(zh, "Compare 3/8 and 1/2", "比較 3/8 同 1/2"),
      subject: L(zh, "Math", "數學"),
      grade: L(zh, "Grade 4", "小四"),
      topic: L(zh, "Fractions", "分數"),
      source: "text",
      status: "approved",
      difficulty: "medium",
      prompt_text: L(zh, "Which is greater: 3/8 or 1/2? Explain.", "3/8 同 1/2 邊個較大？解釋原因。"),
      student_answer: L(zh, "3/8 because 3 is bigger than 1", "3/8，因為 3 比 1 大"),
      correct_answer: "1/2",
      outcome: "wrong",
      confidence: 0.88,
      created_at: "2026-07-10T16:20:00.000Z",
      tags: [L(zh, "same denominator", "同分母"), L(zh, "comparison", "比較")],
      mistake_id: "m-fraction-compare",
      explanation: {
        kid_summary: L(
          zh,
          "For fractions, the bottom number tells how big each piece is. We need pieces of the same size before comparing.",
          "比較分數時，下面個數字話你知每份有幾大。要先變成同一種大小先好比較。",
        ),
        steps: [
          L(zh, "Turn 1/2 into eighths: half of 8 pieces is 4 pieces.", "將 1/2 變成八份：8 份的一半是 4 份。"),
          L(zh, "So 1/2 = 4/8.", "所以 1/2 = 4/8。"),
          L(zh, "Compare 3/8 and 4/8. 4/8 is bigger.", "比較 3/8 同 4/8，4/8 較大。"),
        ],
        key_concept: L(zh, "Compare fractions using pieces of the same size.", "比較分數要用同一大小的份數。"),
        self_check: L(
          zh,
          "Draw two equal bars. Shade 3 of 8 pieces and 4 of 8 pieces.",
          "畫兩條一樣長的條，分成 8 份，分別塗 3 份同 4 份。",
        ),
        next_hint: L(
          zh,
          "When denominators differ, try making them the same first.",
          "分母唔同時，試下先變成相同分母。",
        ),
      },
    },
    {
      question_id: "q-chinese-main-idea",
      ref: 3,
      title: L(zh, "Find the main idea of a short passage", "找出短文中心意思"),
      subject: L(zh, "Chinese", "中文"),
      grade: L(zh, "Grade 4", "小四"),
      topic: L(zh, "Reading comprehension", "閱讀理解"),
      source: "photo",
      status: "done",
      difficulty: "easy",
      photo_label: L(zh, "Workbook photo, reading passage", "補充練習相：閱讀短文"),
      prompt_text: L(zh, "What is the main idea of the passage?", "這篇短文的中心思想是什麼？"),
      student_answer: L(zh, "The child watered the plant every day.", "小朋友每天替植物澆水。"),
      correct_answer: L(zh, "Small daily care helps living things grow.", "每天細心照顧，能幫助生命成長。"),
      outcome: "correct",
      confidence: 0.79,
      created_at: "2026-07-09T12:00:00.000Z",
      tags: [L(zh, "main idea", "中心思想")],
      explanation: {
        kid_summary: L(
          zh,
          "Your answer found an important event. Now lift it into the bigger message.",
          "你搵到重要事件，再提升一步講大意就更好。",
        ),
        steps: [
          L(zh, "Ask: what does the story want us to learn?", "問自己：故事想教我哋咩？"),
          L(zh, "The plant grows because someone cares every day.", "植物長大，是因為有人每天照顧。"),
          L(zh, "So the main idea is about small daily care.", "所以中心意思係每日細心照顧。"),
        ],
        key_concept: L(zh, "Main idea is bigger than one event.", "中心思想比單一事件更大。"),
        self_check: L(
          zh,
          "If your answer can cover the whole passage, it is likely a main idea.",
          "如果答案可以概括全文，就較接近中心思想。",
        ),
        next_hint: L(zh, "Use 'This passage tells us...' to begin.", "可以用「本文告訴我們……」開頭。"),
      },
    },
  ];

  const mistakes = [
    {
      mistake_id: "m-borrowing-01",
      question_id: "q-subtract-302",
      ref: 1,
      subject: L(zh, "Math", "數學"),
      topic: L(zh, "Subtraction with regrouping", "退位減法"),
      mistake_type: L(zh, "Borrowed column not updated", "借位後未更新該欄"),
      status: "needs_review",
      last_seen: "2026-07-11",
      next_review_at: "2026-07-12",
      attempts: 2,
      review_history: ["2026-07-08", "2026-07-11"],
      analysis: {
        root_cause: L(
          zh,
          "The student subtracts each column correctly but forgets the column changed after borrowing.",
          "學生每欄計算都識，但借位後容易忘記被借走的一欄已經改變。",
        ),
        misconception: L(
          zh,
          "Borrowing is treated as a one-time trick instead of a place-value exchange.",
          "將借位當成一次性技巧，而不是位值交換。",
        ),
        fix_strategy: L(
          zh,
          "Mark the borrowed-from digit immediately, then say the new digit out loud.",
          "借位後立即改寫被借的一位，並讀出新數字。",
        ),
        similar_prompt: "604 - 278 = ?",
        parent_note: L(
          zh,
          "Use two short regrouping questions daily for three days; stop once she explains the borrow aloud.",
          "每日做兩題退位題，連續三日；當她能講出借位改變，就可以停。",
        ),
      },
    },
    {
      mistake_id: "m-fraction-compare",
      question_id: "q-fraction-pizza",
      ref: 2,
      subject: L(zh, "Math", "數學"),
      topic: L(zh, "Fractions", "分數"),
      mistake_type: L(zh, "Compared numerators only", "只比較分子"),
      status: "changes_requested",
      last_seen: "2026-07-10",
      next_review_at: "2026-07-12",
      attempts: 1,
      review_history: ["2026-07-10"],
      analysis: {
        root_cause: L(
          zh,
          "The numerator looks more visible, so the denominator is ignored.",
          "分子較顯眼，所以忽略分母代表每份大小。",
        ),
        misconception: L(zh, "Bigger top number always means bigger fraction.", "以為分子越大，分數一定越大。"),
        fix_strategy: L(
          zh,
          "Draw bars or convert to the same denominator before comparing.",
          "先畫長條或化成同分母，再比較。",
        ),
        similar_prompt: "2/3 or 5/12: which is greater?",
        parent_note: L(
          zh,
          "Use food or paper strips; keep language concrete before symbols.",
          "用食物或紙條示範，先具體後符號。",
        ),
      },
    },
    {
      mistake_id: "m-main-idea",
      question_id: "q-chinese-main-idea",
      ref: 3,
      subject: L(zh, "Chinese", "中文"),
      topic: L(zh, "Reading comprehension", "閱讀理解"),
      mistake_type: L(zh, "Main idea too narrow", "中心思想太窄"),
      status: "done",
      last_seen: "2026-07-09",
      next_review_at: "2026-07-16",
      attempts: 3,
      review_history: ["2026-07-02", "2026-07-06", "2026-07-09"],
      analysis: {
        root_cause: L(
          zh,
          "The answer repeats one event rather than the message behind the events.",
          "答案重複一件事，未提升到文章訊息。",
        ),
        misconception: L(zh, "Main idea equals the most recent sentence.", "以為中心思想等於最後或最明顯一句。"),
        fix_strategy: L(
          zh,
          "Ask 'What does the whole story teach?' after naming events.",
          "先講事件，再問「整篇想教我咩？」",
        ),
        similar_prompt: L(zh, "A passage about sharing toys with a new classmate.", "一篇關於同新同學分享玩具的短文。"),
        parent_note: L(
          zh,
          "Ask for one event plus one lesson after reading bedtime stories.",
          "親子閱讀後問一件事加一個道理。",
        ),
      },
    },
  ];

  const papers = [
    {
      paper_id: "paper-fractions-01",
      ref: 1,
      title: L(zh, "Fraction Comparison Mini Paper", "分數比較小測"),
      subject: L(zh, "Math", "數學"),
      grade: L(zh, "Grade 4", "小四"),
      status: "changes_requested",
      generated_at: "2026-07-11T08:00:00.000Z",
      focus_topics: [L(zh, "Fractions", "分數"), L(zh, "Equivalent fractions", "等值分數")],
      linked_mistakes: ["m-fraction-compare"],
      question_count: 8,
      estimated_minutes: 25,
      difficulty_mix: { easy: 0.35, medium: 0.5, challenge: 0.15 },
      items: [
        L(zh, "Compare 3/8 and 1/2", "比較 3/8 同 1/2"),
        L(zh, "Draw 2/4 and 1/2", "畫出 2/4 同 1/2"),
        L(zh, "Word problem: sharing a cake", "應用題：分享蛋糕"),
      ],
      analysis: {
        wrong_count: 2,
        strengths: [
          L(zh, "Understands equal parts when drawn", "畫圖時明白平均分"),
          L(zh, "Explains in full sentences", "能用完整句子解釋"),
        ],
        review_plan: [
          L(zh, "Start with visual bars", "先用圖像長條"),
          L(zh, "Convert to same denominator", "再化成同分母"),
          L(zh, "Finish with one word problem", "最後做一道應用題"),
        ],
        deep_notes: L(
          zh,
          "The main gap is symbolic comparison before the visual model is stable.",
          "主要差距是圖像模型未穩定前，就太快做符號比較。",
        ),
      },
    },
    {
      paper_id: "paper-mixed-01",
      ref: 2,
      title: L(zh, "Weekend Review: Regrouping + Reading", "週末複習：退位減法 + 閱讀"),
      subject: L(zh, "Mixed", "綜合"),
      grade: L(zh, "Grade 4", "小四"),
      status: "approved",
      generated_at: "2026-07-10T15:10:00.000Z",
      focus_topics: [L(zh, "Regrouping", "退位"), L(zh, "Main idea", "中心思想")],
      linked_mistakes: ["m-borrowing-01", "m-main-idea"],
      question_count: 10,
      estimated_minutes: 30,
      difficulty_mix: { easy: 0.4, medium: 0.45, challenge: 0.15 },
      items: ["604 - 278", "800 - 356", L(zh, "Read a short plant-care passage", "閱讀一篇照顧植物短文")],
      analysis: {
        wrong_count: 1,
        strengths: [
          L(zh, "Better self-checking on subtraction", "減法驗算進步"),
          L(zh, "Can find passage events", "能找出短文事件"),
        ],
        review_plan: [
          L(zh, "Do regrouping first while fresh", "精神最好時先做退位"),
          L(zh, "End with one reading reflection", "最後做一題閱讀反思"),
        ],
        deep_notes: L(
          zh,
          "Accuracy improves when the student writes the borrowed digit immediately.",
          "學生即時改寫借位數字時，準確率明顯提升。",
        ),
      },
    },
  ];

  const review_items = [
    {
      review_id: "rv-math-borrowing",
      ref: 1,
      target_type: "question",
      target_id: "q-subtract-302",
      title: L(zh, "Approve explanation for 763 - 428", "審核 763 - 428 講解"),
      status: "needs_review",
      summary: L(zh, "Wrong answer caused by forgetting the borrowed tens digit.", "錯因是退位後忘記十位已改變。"),
      risk: [L(zh, "child-facing", "學生可見")],
      proposed_action: "add_to_mistake_book",
      reason: L(
        zh,
        "The explanation is ready and the mistake card is useful for review.",
        "講解已準備好，錯題卡適合加入複習。",
      ),
      suggestions: [
        L(zh, "Keep the three-step explanation", "保留三步講解"),
        L(zh, "Ask student to verify with addition", "請學生用加法驗算"),
      ],
      suggested_note: L(zh, "Looks good. Please add this to the mistake notebook.", "可以，請加入錯題本。"),
    },
    {
      review_id: "rv-fraction-card",
      ref: 2,
      target_type: "mistake",
      target_id: "m-fraction-compare",
      title: L(zh, "Review fraction misconception card", "審核分數錯因卡"),
      status: "changes_requested",
      summary: L(zh, "The card should use a picture example before symbols.", "錯題卡應先用圖像例子，再用符號。"),
      risk: [L(zh, "concept gap", "概念差距")],
      proposed_action: "revise_explanation",
      reason: L(zh, "The current explanation may still be too symbolic.", "目前講解可能仍然太符號化。"),
      suggestions: [
        L(zh, "Add a pizza/bar model", "加入薄餅或長條模型"),
        L(zh, "Use 1/2 = 4/8 before comparing", "先用 1/2 = 4/8 再比較"),
      ],
      suggested_note: L(zh, "Revise with a visual example first.", "請先用圖像例子重寫。"),
      decision: {
        action: "request_changes",
        comment: L(zh, "Use a picture example before symbols, please.", "請先用圖像例子，再用符號。"),
        decided_at: "2026-07-10T16:30:00.000Z",
      },
    },
    {
      review_id: "rv-paper-fractions",
      ref: 3,
      target_type: "paper",
      target_id: "paper-fractions-01",
      title: L(zh, "Approve fraction mini paper", "審核分數小測"),
      status: "needs_review",
      summary: L(
        zh,
        "8-question paper focused on fraction comparison; last two items are challenging.",
        "8 題分數比較小測，最後兩題較有挑戰。",
      ),
      risk: [L(zh, "paper export", "試卷導出")],
      proposed_action: "export_paper_plan",
      reason: L(zh, "Parent/teacher approval is required before export.", "導出前需要家長或老師審核。"),
      suggestions: [
        L(zh, "Reduce challenge level if student is tired", "如果學生累，可降低挑戰題"),
        L(zh, "Keep one word problem", "保留一道應用題"),
      ],
      suggested_note: L(zh, "Approve after making the final two questions easier.", "最後兩題調淺後可以批准。"),
    },
    {
      review_id: "rv-weekend-paper",
      ref: 4,
      target_type: "paper",
      target_id: "paper-mixed-01",
      title: L(zh, "Weekend mixed review ready", "週末綜合複習已準備"),
      status: "approved",
      summary: L(
        zh,
        "Mixed paper combines one math gap and one reading gap.",
        "綜合練習包含一個數學差距和一個閱讀差距。",
      ),
      risk: [L(zh, "paper export", "試卷導出")],
      proposed_action: "export_paper_plan",
      reason: L(zh, "Ready for local export as Markdown.", "可以本地導出為 Markdown。"),
      suggestions: [L(zh, "Do not exceed 30 minutes", "不要超過 30 分鐘")],
      suggested_note: L(zh, "Approved for weekend practice.", "批准作週末練習。"),
      decision: { action: "approve", comment: L(zh, "Approved.", "已批准。"), decided_at: "2026-07-11T08:42:00.000Z" },
    },
  ];

  return {
    ...assembleSnapshot({
      profile: {
        display_name: L(zh, "Mia", "晴晴"),
        grade: L(zh, "Grade 4", "小四"),
        language: zh ? "zh-HK" : "en",
        timezone: "Asia/Hong_Kong",
      },
      questions,
      mistakes,
      papers,
      reviews: review_items,
      mastery_score: 74,
      questions_analyzed: 18,
    }),
    generated_at: now,
    source: "kelly-homework-coach-demo",
  };
}
