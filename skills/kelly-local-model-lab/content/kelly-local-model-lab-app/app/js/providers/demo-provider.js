import { applyEvaluationVerdict, applyExampleVerdict, buildSnapshot } from "../lab-model.js?v=0.1.0";

const NOW = "2026-08-29T08:00:00.000Z";

let examples = [
  {
    example_id: "EX-001",
    task: "app_spec",
    prompt: "做一个读取 GA4 流量数据的增长分析台，只读，不修改外部数据。",
    ideal_response:
      '{"name":"kelly-ga-insights","category":"growth","risk":"read-only","surface":["busabase","ga4"],"app_type":"research-desk"}',
    split: "train",
    status: "approved",
    source: "smoke-fixture",
    content_hash: "demo-001",
    reviewed_at: NOW,
  },
  {
    example_id: "EX-002",
    task: "app_spec",
    prompt: "我要一个合同审阅队列，律师确认修改意见后再交给 agent 更新草案。",
    ideal_response:
      '{"name":"kelly-contract-review","category":"legal","risk":"local-write","surface":["busabase"],"app_type":"review-queue"}',
    split: "train",
    status: "approved",
    source: "smoke-fixture",
    content_hash: "demo-002",
    reviewed_at: NOW,
  },
  {
    example_id: "EX-003",
    task: "app_spec",
    prompt: "做跨境商品上架文案，人工批准后由另一个 skill 发布到店铺。",
    ideal_response:
      '{"name":"kelly-listing-studio","category":"ecommerce","risk":"gated-write","surface":["busabase"],"app_type":"review-queue"}',
    split: "valid",
    status: "needs_review",
    source: "smoke-fixture",
    content_hash: "demo-003",
  },
  {
    example_id: "EX-004",
    task: "app_spec",
    prompt: "本地训练一个小模型，数据、实验和 adapter 都在自己的 Busabase 工作区管理。",
    ideal_response:
      '{"name":"kelly-local-model-lab","category":"platform","risk":"local-write","surface":["busabase"],"app_type":"action-console"}',
    split: "test",
    status: "needs_review",
    source: "smoke-fixture",
    content_hash: "demo-004",
  },
  {
    example_id: "EX-005",
    task: "app_spec",
    prompt: "给老师做课程备课工作台，只保存教案到 Busabase。",
    ideal_response:
      '{"name":"kelly-lesson-planner","category":"education","risk":"local-write","surface":["busabase"],"app_type":"planner"}',
    split: "train",
    status: "blocked",
    source: "smoke-fixture",
    content_hash: "demo-005",
    review_note: "需要补充年级和课程范围。",
  },
];

const runs = [
  {
    run_id: "RUN-001",
    title: "Qwen3 0.6B app-spec smoke test",
    base_model: "mlx-community/Qwen3-0.6B-4bit",
    base_revision: "pinned-on-export",
    method: "qlora",
    status: "done",
    dataset_snapshot: "drive://snapshots/app-spec-smoke-v1",
    dataset_hash: "sha256:demo-smoke-v1",
    config: { iters: 120, batch_size: 1, learning_rate: 0.0001, num_layers: 8 },
    claimant: "local-mac-worker",
    claimed_at: "2026-08-29T06:20:00.000Z",
    heartbeat_at: "2026-08-29T06:34:00.000Z",
    attempt: 1,
    adapter_file: "drive://adapters/app-spec-smoke-v1",
    report_file: "drive://reports/app-spec-smoke-v1",
    created_at: "2026-08-29T06:15:00.000Z",
    completed_at: "2026-08-29T06:35:00.000Z",
  },
  {
    run_id: "RUN-002",
    title: "Reviewed dataset v2",
    base_model: "mlx-community/Qwen3-0.6B-4bit",
    method: "qlora",
    status: "ready",
    dataset_snapshot: "drive://snapshots/app-spec-v2",
    dataset_hash: "sha256:demo-v2",
    config: { iters: 120, batch_size: 1, learning_rate: 0.0001, num_layers: 8 },
    attempt: 0,
    created_at: NOW,
  },
];

let evaluations = [
  {
    evaluation_id: "EVAL-BASE-001",
    run_id: "RUN-001",
    model_role: "baseline",
    dataset_hash: "sha256:locked-eval-v1",
    case_count: 24,
    json_valid_pct: 100,
    schema_valid_pct: 0,
    exact_field_pct: 6.67,
    latency_ms: 143.69,
    report_file: "drive://reports/app-spec-smoke-v1#baseline",
    evaluated_at: "2026-08-29T06:18:00.000Z",
    __recordId: "demo-eval-base",
    __headCommitId: "demo-eval-base-v1",
  },
  {
    evaluation_id: "EVAL-ADAPTER-001",
    run_id: "RUN-001",
    model_role: "adapter",
    dataset_hash: "sha256:locked-eval-v1",
    case_count: 24,
    json_valid_pct: 100,
    schema_valid_pct: 66.67,
    exact_field_pct: 63.33,
    latency_ms: 161.65,
    report_file: "drive://reports/app-spec-smoke-v1#adapter",
    verdict: "hold",
    decision_note: "Demo result; inspect real holdout before promotion.",
    evaluated_at: "2026-08-29T06:35:00.000Z",
    __recordId: "demo-eval-adapter",
    __headCommitId: "demo-eval-adapter-v1",
  },
];

const models = [
  {
    model_id: "qwen3-0.6b-base",
    display_name: "Qwen3 0.6B Base",
    base_model: "mlx-community/Qwen3-0.6B-4bit",
    base_revision: "pinned-on-export",
    status: "active",
    notes: "Comparison baseline.",
    registered_at: "2026-08-29T06:00:00.000Z",
  },
  {
    model_id: "app-spec-smoke-v1",
    display_name: "App Spec Smoke v1",
    base_model: "mlx-community/Qwen3-0.6B-4bit",
    base_revision: "pinned-on-export",
    adapter_file: "drive://adapters/app-spec-smoke-v1",
    training_run_id: "RUN-001",
    dataset_hash: "sha256:demo-smoke-v1",
    status: "candidate",
    notes: "Fixture-trained demonstration adapter.",
    registered_at: "2026-08-29T06:35:00.000Z",
  },
];

const settings = {
  onboarding_version: 1,
  base_model: "mlx-community/Qwen3-0.6B-4bit",
  method: "qlora",
  evaluation_gate: { min_schema_valid_pct: 90, min_exact_field_delta: 10 },
  local_worker: { required: true, status: "offline-in-demo" },
};

function state() {
  return {
    app: "kelly-local-model-lab",
    demo: true,
    demo_scenario: new URLSearchParams(window.location.search).get("demo") || "overview",
    data_provider: "demo",
    onboarding: { completed: true, config_version: "demo" },
    resources: { folder_id: "demo", base_ids: {} },
    snapshot: buildSnapshot({ examples, runs, evaluations, models, settings }),
  };
}

export const demoProvider = {
  kind: "demo",
  async getState() {
    return state();
  },
  async reviewExample(example, verdict, note = "") {
    examples = examples.map((item) =>
      item.example_id === example.example_id ? applyExampleVerdict(item, verdict, note, NOW) : item,
    );
    return state();
  },
  async decideEvaluation(evaluation, verdict, note = "") {
    evaluations = evaluations.map((item) =>
      item.evaluation_id === evaluation.evaluation_id ? applyEvaluationVerdict(item, verdict, note) : item,
    );
    return state();
  },
  async provisionResources() {
    throw new Error("Demo mode never provisions Busabase resources.");
  },
};
