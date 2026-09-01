export const EXAMPLE_VERDICTS = ["approve", "request_changes", "block"];
export const EVALUATION_VERDICTS = ["promote", "hold", "reject"];

const text = (value) => String(value ?? "").trim();
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeExample(row = {}) {
  return {
    example_id: text(row.example_id),
    task: text(row.task) || "app_spec",
    prompt: text(row.prompt),
    ideal_response: text(row.ideal_response),
    split: ["train", "valid", "test"].includes(text(row.split)) ? text(row.split) : "train",
    status: ["needs_review", "approved", "changes_requested", "blocked"].includes(text(row.status))
      ? text(row.status)
      : "needs_review",
    source: text(row.source),
    content_hash: text(row.content_hash),
    review_note: text(row.review_note),
    reviewed_at: text(row.reviewed_at),
    updated_at: text(row.updated_at),
    __recordId: row.__recordId,
    __headCommitId: row.__headCommitId,
  };
}

export function normalizeRun(row = {}) {
  return {
    run_id: text(row.run_id),
    title: text(row.title),
    base_model: text(row.base_model),
    base_revision: text(row.base_revision),
    method: text(row.method) || "qlora",
    status: text(row.status) || "ready",
    dataset_snapshot: text(row.dataset_snapshot),
    dataset_hash: text(row.dataset_hash),
    config: parseJson(row.config),
    claimant: text(row.claimant),
    claimed_at: text(row.claimed_at),
    heartbeat_at: text(row.heartbeat_at),
    attempt: number(row.attempt),
    adapter_file: text(row.adapter_file),
    report_file: text(row.report_file),
    error: text(row.error),
    created_at: text(row.created_at),
    completed_at: text(row.completed_at),
  };
}

export function normalizeEvaluation(row = {}) {
  return {
    evaluation_id: text(row.evaluation_id),
    run_id: text(row.run_id),
    model_role: text(row.model_role),
    dataset_hash: text(row.dataset_hash),
    case_count: number(row.case_count),
    json_valid_pct: number(row.json_valid_pct),
    schema_valid_pct: number(row.schema_valid_pct),
    exact_field_pct: number(row.exact_field_pct),
    latency_ms: number(row.latency_ms),
    report_file: text(row.report_file),
    verdict: text(row.verdict),
    decision_note: text(row.decision_note),
    evaluated_at: text(row.evaluated_at),
    __recordId: row.__recordId,
    __headCommitId: row.__headCommitId,
  };
}

export function normalizeRegistryModel(row = {}) {
  return {
    model_id: text(row.model_id),
    display_name: text(row.display_name),
    base_model: text(row.base_model),
    base_revision: text(row.base_revision),
    adapter_file: text(row.adapter_file),
    training_run_id: text(row.training_run_id),
    dataset_hash: text(row.dataset_hash),
    status: text(row.status) || "candidate",
    notes: text(row.notes),
    registered_at: text(row.registered_at),
  };
}

export function applyExampleVerdict(example, verdict, note = "", now = new Date().toISOString()) {
  if (!EXAMPLE_VERDICTS.includes(verdict)) throw new Error(`Unknown example verdict: ${verdict}`);
  const status = verdict === "approve" ? "approved" : verdict === "request_changes" ? "changes_requested" : "blocked";
  return { ...normalizeExample(example), status, review_note: text(note), reviewed_at: now, updated_at: now };
}

export function applyEvaluationVerdict(evaluation, verdict, note = "") {
  if (!EVALUATION_VERDICTS.includes(verdict)) throw new Error(`Unknown evaluation verdict: ${verdict}`);
  return { ...normalizeEvaluation(evaluation), verdict, decision_note: text(note) };
}

export function baseExampleFields(example) {
  const value = normalizeExample(example);
  return {
    example_id: value.example_id,
    task: value.task,
    prompt: value.prompt,
    ideal_response: value.ideal_response,
    split: value.split,
    status: value.status,
    source: value.source,
    content_hash: value.content_hash,
    review_note: value.review_note,
    reviewed_at: value.reviewed_at,
    updated_at: value.updated_at,
  };
}

export function baseEvaluationFields(evaluation) {
  const value = normalizeEvaluation(evaluation);
  return {
    evaluation_id: value.evaluation_id,
    run_id: value.run_id,
    model_role: value.model_role,
    dataset_hash: value.dataset_hash,
    case_count: value.case_count,
    json_valid_pct: value.json_valid_pct,
    schema_valid_pct: value.schema_valid_pct,
    exact_field_pct: value.exact_field_pct,
    latency_ms: value.latency_ms,
    report_file: value.report_file,
    verdict: value.verdict,
    decision_note: value.decision_note,
    evaluated_at: value.evaluated_at,
  };
}

export function compareEvaluations(evaluations = []) {
  const byRun = new Map();
  for (const evaluation of evaluations.map(normalizeEvaluation)) {
    if (!byRun.has(evaluation.run_id)) byRun.set(evaluation.run_id, {});
    byRun.get(evaluation.run_id)[evaluation.model_role] = evaluation;
  }
  return [...byRun.entries()].map(([run_id, pair]) => ({
    run_id,
    baseline: pair.baseline || null,
    adapter: pair.adapter || null,
    schema_delta: pair.adapter && pair.baseline ? pair.adapter.schema_valid_pct - pair.baseline.schema_valid_pct : null,
    exact_delta: pair.adapter && pair.baseline ? pair.adapter.exact_field_pct - pair.baseline.exact_field_pct : null,
  }));
}

export function buildSnapshot({ examples = [], runs = [], evaluations = [], models = [], settings = {} } = {}) {
  const normalizedExamples = examples.map(normalizeExample);
  const normalizedRuns = runs.map(normalizeRun);
  const normalizedEvaluations = evaluations.map(normalizeEvaluation);
  const normalizedModels = models.map(normalizeRegistryModel);
  const counts = {
    examples: normalizedExamples.length,
    needs_review: normalizedExamples.filter((item) => item.status === "needs_review").length,
    approved: normalizedExamples.filter((item) => item.status === "approved").length,
    train: normalizedExamples.filter((item) => item.split === "train" && item.status === "approved").length,
    valid: normalizedExamples.filter((item) => item.split === "valid" && item.status === "approved").length,
    test: normalizedExamples.filter((item) => item.split === "test" && item.status === "approved").length,
    active_runs: normalizedRuns.filter((item) => ["ready", "in_progress"].includes(item.status)).length,
    completed_runs: normalizedRuns.filter((item) => item.status === "done").length,
    candidate_models: normalizedModels.filter((item) => item.status === "candidate").length,
  };
  return {
    generated_at: new Date().toISOString(),
    counts,
    examples: normalizedExamples,
    runs: normalizedRuns,
    evaluations: normalizedEvaluations,
    comparisons: compareEvaluations(normalizedEvaluations),
    models: normalizedModels,
    settings,
  };
}
