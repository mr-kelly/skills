// Pure domain content and helpers for Kelly Digital Human, ported from the
// retired app/server/demo.ts. The project overview, personas, pipelines,
// vendor comparison, and QA checklist were never editable in the retired
// local app -- app/server/index.ts's localState() only ever read them from a
// snapshot file that no script ever wrote, always falling back to this exact
// dataset. They are curated reference content, not per-user data, so they
// stay as plain constants here (shared by both providers) instead of a
// Busabase Base. The only thing the retired app/server/index.ts's
// POST /api/decision route ever wrote was a human verdict per QA check id
// into app/.data/decisions.json -- that is the one genuinely dynamic piece,
// now a direct Busabase record per decided check (see config.js's
// "qa-decisions" Base and providers/busabase-provider.js).

export const PROJECT = {
  name: "Kelly AI Product Host",
  target_scene: "product_demo",
  recommended_path: "2d_fast",
  secondary_path: "3d_custom",
  readiness_score: 82,
  verdict: "FIX",
  launch_goal: "Ship a polished web demo in days, then decide whether a 3D brand character is worth the build.",
};

// target_latency_ms/current_latency_ms/lip_sync_score/stream_stability are
// curated static numbers ported verbatim from demo.ts. qa_passed/qa_total are
// NOT ported as static values -- they are recomputed fresh from QA_CHECKS by
// computeMetrics() below (demo.ts's hardcoded 6/8 happened to match its own
// QA_CHECKS array; deriving them for real keeps the tile correct if the
// checklist ever changes).
export const METRICS_STATIC = {
  target_latency_ms: 850,
  current_latency_ms: 620,
  lip_sync_score: 92,
  stream_stability: 98,
};

export const PERSONAS = [
  {
    id: "kelly-host-cn",
    name: "Kelly AI Host",
    path: "2d_fast",
    language: "zh-CN",
    voice: "warm product narrator",
    look: "photoreal business presenter, calm studio lighting, product-demo wardrobe",
    disclosure: "我是 AI 数字人助理，会为你演示产品流程。",
  },
  {
    id: "brand-ip-3d",
    name: "Brand IP 3D Host",
    path: "3d_custom",
    language: "zh-CN / en-US",
    voice: "confident bilingual host",
    look: "custom 3D brand character with reusable wardrobe and stage motions",
    disclosure: "This is a branded AI avatar experience.",
  },
];

export const PIPELINES = [
  {
    id: "fast-2d-stream",
    path: "2d_fast",
    label: "2D service stream",
    provider: "Silicon Intelligence / Tencent Zhiying / ZEGO-style adapter",
    input: "text or voice stream",
    output: "lip-synced video stream",
    latency_ms: 620,
    status: "ready_for_demo",
    stages: ["text", "tts", "vendor avatar", "RTC/video stream", "web player"],
  },
  {
    id: "custom-3d-engine",
    path: "3d_custom",
    label: "UE/Unity render path",
    provider: "engine project + face/body driver",
    input: "voice, intent, motion cues",
    output: "interactive rendered avatar",
    latency_ms: 1400,
    status: "prototype_needed",
    stages: ["voice", "viseme solve", "face rig", "body animation", "engine render"],
  },
];

export const VENDORS = [
  {
    id: "silicon-intelligence",
    label: "Silicon Intelligence-style 2D service",
    path: "2d_fast",
    integration: "API/SDK: send text or audio stream, receive generated avatar video stream",
    speed: "fast",
    control: "medium",
    cost: "low to medium",
    risk: "avatar licensing, voice licensing, provider lock-in",
  },
  {
    id: "tencent-zhiying",
    label: "Tencent Zhiying-style 2D service",
    path: "2d_fast",
    integration: "template presenter + clip/stream workflow for marketing and explainers",
    speed: "fast",
    control: "medium",
    cost: "low to medium",
    risk: "template limits and export workflow constraints",
  },
  {
    id: "zego-realtime",
    label: "ZEGO-style real-time stream",
    path: "2d_fast",
    integration: "RTC-first avatar route for conversational customer-service demos",
    speed: "medium",
    control: "medium",
    cost: "medium",
    risk: "network jitter, concurrent stream cost, device fallback",
  },
  {
    id: "ue-unity",
    label: "UE/Unity custom digital human",
    path: "3d_custom",
    integration: "engine scene, rigged character, face/body driver, streaming or packaged app",
    speed: "slow",
    control: "high",
    cost: "high",
    risk: "asset production, rig quality, real-time render performance",
  },
];

export const QA_CHECKS = [
  {
    id: "lip-sync",
    label: "Lip sync quality",
    status: "pass",
    owner: "product",
    evidence: "Mandarin demo line tracks mouth shapes with no obvious lag.",
  },
  {
    id: "latency",
    label: "End-to-end latency",
    status: "pass",
    owner: "engineering",
    evidence: "Simulated route is 620ms against an 850ms demo target.",
  },
  {
    id: "ai-disclosure",
    label: "AI disclosure",
    status: "pass",
    owner: "legal",
    evidence: "Presenter opening line discloses AI avatar status.",
  },
  {
    id: "voice-consent",
    label: "Voice and likeness consent",
    status: "fix",
    owner: "ops",
    evidence: "Need signed permission before using a real person reference.",
  },
  {
    id: "script-safety",
    label: "Script safety and claims",
    status: "pass",
    owner: "marketing",
    evidence: "No medical, financial, or unverifiable performance claims.",
  },
  {
    id: "fallback",
    label: "Network fallback",
    status: "fix",
    owner: "engineering",
    evidence: "Need static host card if avatar stream disconnects.",
  },
  {
    id: "privacy",
    label: "Private audio handling",
    status: "pass",
    owner: "security",
    evidence: "Demo uses generated text and no live microphone capture.",
  },
  {
    id: "mobile",
    label: "Mobile layout",
    status: "pass",
    owner: "design",
    evidence: "Studio controls and video stage fit small screens.",
  },
];

export const EVENTS = [
  { at: "T+0.0s", kind: "text", label: "script chunk queued" },
  { at: "T+0.2s", kind: "voice", label: "voice stream accepted" },
  { at: "T+0.4s", kind: "avatar", label: "viseme frames generated" },
  { at: "T+0.6s", kind: "stream", label: "video stream ready" },
  { at: "T+0.8s", kind: "qa", label: "latency target passed" },
];

// ---- Decision record helpers (the one dynamic piece), mirroring
// kelly-clm's buildApproval/approvalToFields/normalizeApprovalRow. ----

export const DECISION_ACTIONS = ["approve", "request_changes", "block"];

// Ported verbatim from the retired app/app.js's DECISION_STATUS map.
export const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
};

export function buildDecision({ check_id = "", action = "", note = "", decided_at = "" } = {}) {
  return { check_id, action, note, decided_at: decided_at || new Date().toISOString() };
}

export function decisionToFields(decision = {}) {
  return {
    "check-id": decision.check_id || "",
    action: decision.action || "",
    note: decision.note || "",
    "decided-at": decision.decided_at || "",
  };
}

export function normalizeDecisionRow({ check_id = "", action = "", note = "", decided_at = "" } = {}) {
  return { check_id, action, note, decided_at };
}

// Ported verbatim from the retired app/app.js's effectiveStatus(): a
// recorded decision always wins; otherwise fall back to the check's own
// curated baseline status.
export function effectiveStatus(check = {}, decision = null) {
  if (decision?.action && DECISION_STATUS[decision.action]) return DECISION_STATUS[decision.action];
  if (check.status === "pass") return "approved";
  if (check.status === "block") return "blocked";
  return "needs_review";
}

// New: qa_passed/qa_total derived from QA_CHECKS's curated baseline status
// (not the human decision overlay) -- see METRICS_STATIC's comment above for
// why this replaces demo.ts's hardcoded 6/8.
export function computeMetrics(checks = []) {
  return {
    qa_passed: checks.filter((check) => check.status === "pass").length,
    qa_total: checks.length,
  };
}

export function buildSnapshot(
  checks = QA_CHECKS,
  { scene = "overview", generated_at = new Date().toISOString(), source = "kelly-digital-human" } = {},
) {
  return {
    schema_version: "1",
    generated_at,
    source,
    scene,
    project: PROJECT,
    metrics: { ...METRICS_STATIC, ...computeMetrics(checks) },
    personas: PERSONAS,
    pipelines: PIPELINES,
    vendors: VENDORS,
    qa_checks: checks,
    events: EVENTS,
  };
}

export function decisionsToMap(decisions = []) {
  const map = {};
  for (const decision of decisions) {
    if (decision.check_id) map[decision.check_id] = decision;
  }
  return map;
}
