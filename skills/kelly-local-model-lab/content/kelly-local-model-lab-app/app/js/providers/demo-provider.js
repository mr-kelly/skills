import { applyEvaluationVerdict, applyExampleVerdict, buildSnapshot } from "../lab-model.js?v=0.1.0";

const NOW = "2026-08-29T08:00:00.000Z";

let examples = [
  {
    example_id: "SUPPORT-qa-phone-opening",
    task: "support_qa",
    prompt: "电话接通后，客服应该怎样开场？",
    ideal_response:
      "先礼貌问候，再说明自己的公司和客服身份，最后用开放式问题询问客户需要什么帮助。问候可以结合当前时段或节日调整。",
    split: "train",
    status: "approved",
    source: "kelly-support:kb-phone-service-guide:qa-phone-opening",
    content_hash: "sha256:demo-phone-opening",
    reviewed_at: NOW,
  },
  {
    example_id: "SUPPORT-qa-phone-confirm",
    task: "support_qa",
    prompt: "没有完全听清客户的问题时，应该怎么确认？",
    ideal_response: "不要猜测客户的意思。礼貌请客户重复，并用自己的话复述关键信息，请客户确认理解是否准确。",
    split: "train",
    status: "approved",
    source: "kelly-support:kb-phone-service-guide:qa-phone-confirm",
    content_hash: "sha256:demo-phone-confirm",
    reviewed_at: NOW,
  },
  {
    example_id: "SUPPORT-qa-phone-empathy",
    task: "support_qa",
    prompt: "客户情绪激动时，客服应该如何回应？",
    ideal_response:
      "保持冷静，先表达理解和同理心，再说明当前能够采取的具体下一步；不要在尚未核实政策和权限前承诺一定解决或保证结果。",
    split: "train",
    status: "needs_review",
    source: "kelly-support:kb-phone-service-guide:qa-phone-empathy",
    content_hash: "sha256:demo-phone-empathy",
  },
  {
    example_id: "SUPPORT-qa-phone-wait",
    task: "support_qa",
    prompt: "需要客户等待查询时，要说明什么？",
    ideal_response: "说明等待的原因和大致时间，并礼貌征得客户同意。如果查询时间较长，应约定可兑现的回访方式和时间。",
    split: "train",
    status: "needs_review",
    source: "kelly-support:kb-phone-service-guide:qa-phone-wait",
    content_hash: "sha256:demo-phone-wait",
  },
  {
    example_id: "SUPPORT-qa-phone-complaint",
    task: "support_qa",
    prompt: "收到客户投诉时，合适的处理顺序是什么？",
    ideal_response:
      "先为客户受到的影响道歉并确认问题，再记录诉求，说明现在可以执行的处理步骤；暂时无法解决时，应清楚说明限制和后续安排。",
    split: "train",
    status: "needs_review",
    source: "kelly-support:kb-phone-service-guide:qa-phone-complaint",
    content_hash: "sha256:demo-phone-complaint",
  },
  {
    example_id: "SUPPORT-qa-phone-close",
    task: "support_qa",
    prompt: "电话结束前，客服应该做什么？",
    ideal_response: "确认客户当前问题已经得到回应或已约定下一步，感谢客户来电或提出意见，并用简洁礼貌的结束语收尾。",
    split: "train",
    status: "blocked",
    source: "kelly-support:kb-phone-service-guide:qa-phone-close",
    content_hash: "sha256:demo-phone-close",
    review_note: "单一来源不能同时承担训练和锁定测试；请补充独立客服材料。",
  },
];

const runs = [
  {
    run_id: "RUN-001",
    title: "Qwen3 0.6B 客服 QA 基线验证",
    task: "support_qa",
    base_model: "mlx-community/Qwen3-0.6B-4bit",
    base_revision: "pinned-on-export",
    method: "qlora",
    status: "done",
    dataset_snapshot: "drive://snapshots/support-qa-pilot-v1",
    dataset_hash: "sha256:demo-support-qa-v1",
    config: { iters: 120, batch_size: 1, learning_rate: 0.0001, num_layers: 8 },
    claimant: "local-mac-worker",
    claimed_at: "2026-08-29T06:20:00.000Z",
    heartbeat_at: "2026-08-29T06:34:00.000Z",
    attempt: 1,
    adapter_file: "drive://adapters/support-qa-pilot-v1",
    report_file: "drive://reports/support-qa-pilot-v1",
    created_at: "2026-08-29T06:15:00.000Z",
    completed_at: "2026-08-29T06:35:00.000Z",
  },
  {
    run_id: "RUN-002",
    title: "客服 QA 扩充数据集",
    task: "support_qa",
    base_model: "mlx-community/Qwen3-0.6B-4bit",
    method: "qlora",
    status: "ready",
    dataset_snapshot: "drive://snapshots/support-qa-v2",
    dataset_hash: "sha256:demo-support-v2",
    config: { iters: 120, batch_size: 1, learning_rate: 0.0001, num_layers: 8 },
    attempt: 0,
    created_at: NOW,
  },
];

let evaluations = [
  {
    evaluation_id: "EVAL-BASE-001",
    run_id: "RUN-001",
    task: "support_qa",
    model_role: "baseline",
    dataset_hash: "sha256:locked-eval-v1",
    case_count: 24,
    exact_match_pct: 8.33,
    character_f1_pct: 41.2,
    latency_ms: 143.69,
    report_file: "drive://reports/support-qa-pilot-v1#baseline",
    evaluated_at: "2026-08-29T06:18:00.000Z",
    __recordId: "demo-eval-base",
    __headCommitId: "demo-eval-base-v1",
  },
  {
    evaluation_id: "EVAL-ADAPTER-001",
    run_id: "RUN-001",
    task: "support_qa",
    model_role: "adapter",
    dataset_hash: "sha256:locked-eval-v1",
    case_count: 24,
    exact_match_pct: 33.33,
    character_f1_pct: 72.8,
    latency_ms: 161.65,
    report_file: "drive://reports/support-qa-pilot-v1#adapter",
    verdict: "hold",
    decision_note: "演示结果；只有一篇来源材料，不能据此晋级。",
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
    model_id: "support-qa-pilot-v1",
    display_name: "Support QA Pilot v1",
    base_model: "mlx-community/Qwen3-0.6B-4bit",
    base_revision: "pinned-on-export",
    adapter_file: "drive://adapters/support-qa-pilot-v1",
    training_run_id: "RUN-001",
    dataset_hash: "sha256:demo-support-qa-v1",
    status: "candidate",
    notes: "客服 QA 演示 adapter；来源不足，保持候选状态。",
    registered_at: "2026-08-29T06:35:00.000Z",
  },
];

const settings = {
  onboarding_version: 1,
  base_model: "mlx-community/Qwen3-0.6B-4bit",
  method: "qlora",
  evaluation_gate: { task: "support_qa", min_character_f1_pct: 80, min_exact_match_delta: 10 },
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
