export const DECISIONS = new Set(["approve", "request_changes", "block"]);

const parseJson = (value, fallback) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value || fallback;
  } catch {
    return fallback;
  }
};

export function statusForDecision(action) {
  return { approve: "approved", request_changes: "changes_requested", block: "blocked" }[action] || "needs_review";
}

export function candidateFromRow(row = {}) {
  return {
    candidate_id: row.candidate_id || "",
    job_id: row.job_id || "",
    ref: Number(row.ref || 0),
    title: row.title || "Untitled portrait",
    status: row.status || "needs_review",
    preset: row.preset || "natural",
    strength: Number(row.strength || 35),
    face_count: Number(row.face_count || 0),
    source_label: row.source_label || "Source portrait",
    output_label: row.output_label || "Retouched candidate",
    source_asset_id: row.source_asset_id || "",
    output_asset_id: row.output_asset_id || "",
    comparison_asset_id: row.comparison_asset_id || "",
    source_url: row.source_url || "",
    output_url: row.output_url || "",
    checks: parseJson(row.checks, { texture: "pass", identity: "pass", tone: "pass" }),
    review_version: Number(row.review_version || 1),
    decision_action: row.decision_action || "",
    decision_comment: row.decision_comment || "",
    decided_at: row.decided_at || "",
  };
}

export function candidateFields(candidate = {}) {
  return {
    candidate_id: candidate.candidate_id || "",
    job_id: candidate.job_id || "",
    ref: candidate.ref || 0,
    title: candidate.title || "Untitled portrait",
    status: candidate.status || "needs_review",
    preset: candidate.preset || "natural",
    strength: candidate.strength ?? 35,
    face_count: candidate.face_count || 0,
    source_label: candidate.source_label || "",
    output_label: candidate.output_label || "",
    source_asset_id: candidate.source_asset_id || "",
    output_asset_id: candidate.output_asset_id || "",
    comparison_asset_id: candidate.comparison_asset_id || "",
    checks: JSON.stringify(candidate.checks || {}),
    review_version: candidate.review_version || 1,
    decision_action: candidate.decision_action || "",
    decision_comment: candidate.decision_comment || "",
    decided_at: candidate.decided_at || "",
  };
}

export function metrics(candidates = []) {
  return candidates.reduce(
    (result, candidate) => {
      result.total += 1;
      result[candidate.status] = (result[candidate.status] || 0) + 1;
      return result;
    },
    { total: 0, needs_review: 0, approved: 0, done: 0, blocked: 0, changes_requested: 0 },
  );
}

export function demoSnapshot() {
  const candidates = [
    {
      candidate_id: "candidate-001",
      job_id: "job-001",
      ref: 1,
      title: "Natural studio portrait",
      status: "needs_review",
      preset: "natural",
      strength: 35,
      face_count: 1,
      source_label: "unsplash-demo-source.jpg",
      output_label: "unsplash-demo-retouched.jpg",
      source_url: "./assets/demo/portrait-source.jpg",
      output_url: "./assets/demo/portrait-retouched.jpg",
      checks: { texture: "pass", identity: "pass", tone: "pass" },
    },
    {
      candidate_id: "candidate-002",
      job_id: "job-001",
      ref: 2,
      title: "Studio detail candidate",
      status: "approved",
      preset: "studio",
      strength: 24,
      face_count: 1,
      source_label: "unsplash-demo-source.jpg",
      output_label: "studio-detail-v2.jpg",
      source_url: "./assets/demo/portrait-source.jpg",
      output_url: "./assets/demo/portrait-retouched.jpg",
      checks: { texture: "pass", identity: "pass", tone: "pass" },
    },
  ];
  return {
    candidates,
    metrics: metrics(candidates),
    settings: { default_preset: "natural", default_strength: 35 },
  };
}

export function onboardingFromRows(rows = []) {
  const row = rows.find((item) => item.record_id === "config");
  if (!row) return { state: "not_started", version: 0, settings: {} };
  const version = Number(row.onboarding_version || 0);
  const complete =
    version === 1 &&
    ["natural", "fresh", "studio"].includes(row.default_preset) &&
    Number(row.default_strength) >= 0 &&
    Number(row.default_strength) <= 100 &&
    row.metadata_policy === "strip" &&
    row.external_upload_policy === "explicit-only" &&
    row.overwrite_policy === "explicit-only" &&
    Boolean(row.completed_at);
  return {
    state: complete ? "complete" : version > 1 ? "needs_review" : "in_progress",
    version,
    settings: {
      default_preset: row.default_preset || "natural",
      default_strength: Number(row.default_strength || 35),
      metadata_policy: row.metadata_policy || "strip",
      external_upload_policy: row.external_upload_policy || "explicit-only",
      overwrite_policy: row.overwrite_policy || "explicit-only",
    },
  };
}
