// Pure domain logic for kelly-campaigns: turn normalized Busabase records into
// the campaign snapshot shape the UI renders, including the pre-send
// deliverability-risk derivation and the consent/suppression pre-send check.
// Ported verbatim (same variable names, same order of operations) from the
// retired lib/data-provider/local-file-provider.ts (checkSuppression) and
// app/server/demo.ts (the deliverability() helper) — only TS types stripped.

export const PHASES = ["setup", "engage", "nurture", "deliver"];

export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

export function statusForAction(action) {
  return DECISION_STATUS[action] || null;
}

function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseJsonList(value) {
  const parsed = parseJsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonObject(value) {
  const parsed = parseJsonValue(value, null);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

// Deliverability risk derivation — ported verbatim from app/server/demo.ts's
// deliverability() helper. `risk` is `high` when auth fails, spam_score is
// >= 5, or inbox_readiness is below 0.6; `medium` when spam_score is >= 3 or
// inbox_readiness is below 0.8; else `low`.
export function deliverabilityInfo({
  spf_pass = false,
  dkim_pass = false,
  dmarc_pass = false,
  spam_score = 0,
  inbox_readiness = 0,
} = {}) {
  const authOk = spf_pass && dkim_pass && dmarc_pass;
  let risk = "low";
  if (!authOk || spam_score >= 5 || inbox_readiness < 0.6) risk = "high";
  else if (spam_score >= 3 || inbox_readiness < 0.8) risk = "medium";
  return { spf_pass, dkim_pass, dmarc_pass, spam_score, inbox_readiness, risk };
}

// Consent/suppression pre-send check — ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's checkSuppression(). A send
// targets a segment (and may carry explicit target_addresses). Any
// address-level suppression entry is globally excluded from every send (an
// unsubscribed/bounced/complained address never gets mail, regardless of
// segment); a segment-level suppression only excludes recipients of THAT
// segment. An explicitly-targeted suppressed ADDRESS is a hard block.
export function checkSuppression({ segment_id = "", target_addresses = [] } = {}, entries = []) {
  const targetAddressesLower = (target_addresses || []).map((value) => String(value).toLowerCase());
  const matched = [];
  let blocked = false;
  for (const entry of entries) {
    if (entry.segment_id && entry.segment_id === segment_id) {
      matched.push(entry);
    } else if (entry.address) {
      const address = String(entry.address).toLowerCase();
      matched.push(entry);
      if (targetAddressesLower.includes(address)) blocked = true;
    }
  }
  const suppressed_count = matched.length;
  const note = blocked
    ? `${suppressed_count} suppressed recipient(s) matched — a suppressed address is explicitly targeted; blocking send.`
    : suppressed_count
      ? `${suppressed_count} suppressed recipient(s) excluded.`
      : "";
  return { suppressed_count, blocked, matched, note };
}

function countMetrics(sends) {
  const metrics = { needs_review: 0, approved: 0, done: 0, blocked: 0, scheduled: 0, at_risk: 0 };
  for (const send of sends) {
    if (metrics[send.status] !== undefined) metrics[send.status] += 1;
    if (send.status === "approved") metrics.scheduled += 1;
    if (send.deliverability?.risk === "high" || send.quality_gate?.verdict === "block") metrics.at_risk += 1;
  }
  return metrics;
}

// Warnings are derived, never stored: any send whose quality gate returns a
// BLOCK verdict surfaces as a warning so it is visible outside the
// deliverability table too (overview banner, campaigns queue).
function buildWarnings(sends) {
  return sends
    .filter((send) => send.quality_gate?.verdict === "block")
    .map((send) => ({
      id: `${send.send_id}-quality-block`,
      severity: "error",
      send_id: send.send_id,
      message: `"${send.subject}" fails the SEND quality gate (EQS ${send.quality_gate.eqs}); fix before scheduling.`,
      detail: send.quality_gate.summary || "",
    }));
}

export function buildSnapshot({ segments = [], sends = [], suppression = [] } = {}) {
  const normalizedSegments = segments.map((row) => ({
    segment_id: row.segment_id || "",
    name: row.name || row.segment_id || "",
    description: row.description || "",
    audience_size: Number(row.audience_size || 0),
  }));

  const normalizedSends = sends.map((row) => {
    const segment_id = row.segment_id || "";
    const target_addresses = parseJsonList(row.target_addresses);
    return {
      send_id: row.send_id || "",
      ref: Number(row.ref || 0),
      type: row.type || "campaign",
      phase: row.phase || "deliver",
      from_identity_id: row.from_identity_id || "",
      subject: row.subject || "",
      preview_text: row.preview_text || "",
      segment_id,
      audience_size: Number(row.audience_size || 0),
      status: row.status || "needs_review",
      proposed_action: row.proposed_action || "hold",
      risk: parseJsonList(row.risk),
      send_at: row.send_at || "",
      deliverability: deliverabilityInfo(parseJsonObject(row.deliverability) || {}),
      subject_variants: parseJsonList(row.subject_variants),
      chosen_variant: row.chosen_variant || "",
      reason: row.reason || "",
      body: row.body || "",
      target_addresses,
      performance: parseJsonObject(row.performance),
      quality_gate: parseJsonObject(row.quality_gate),
      created_at: row.created_at || "",
      decision_note: row.decision_note || "",
      decided_at: row.decided_at || "",
      suppression: checkSuppression({ segment_id, target_addresses }, suppression),
    };
  });

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-campaigns",
    list_health: {
      subscriber_count: 0,
      bounce_rate: 0,
      complaint_rate: 0,
      churn_rate: 0,
      avg_open_rate: 0,
      avg_click_rate: 0,
    },
    metrics: countMetrics(normalizedSends),
    segments: normalizedSegments,
    sends: normalizedSends,
    warnings: buildWarnings(normalizedSends),
  };
}
