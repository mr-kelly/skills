// Pure, storage-agnostic domain logic for kelly-picks — no fs, no network.
// Both the local-file provider and the scripts share these so the develop/watch/
// drop decision model, metric math, and config summarization stay identical
// regardless of which backend holds the bytes.

import type {
  Candidate,
  Config,
  ConfigResult,
  Decision,
  PicksSnapshot,
  Platform,
  SnapshotMetrics,
} from "./types.ts";

// ── Decision vocabulary (the product-research radar verbs) ────────────────────
export const DECISION_KINDS = ["candidate", "proposal", "trend"];
export const CANDIDATE_ACTIONS = ["develop", "watch", "drop"];
export const PROPOSAL_ACTIONS = ["approve", "request_changes", "revise", "block"];
export const TREND_ACTIONS = ["promote"];

export function stageForCandidateAction(action: string): string {
  if (action === "develop") return "develop";
  if (action === "watch") return "watch";
  if (action === "drop") return "dropped";
  return "reviewing";
}

export function statusForProposalAction(action: string): string {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return "needs_review";
}

// ── Snapshot construction / metrics ───────────────────────────────────────────
export function emptySnapshot(): PicksSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-picks",
    base_currency: "USD",
    range: { start: "", end: "" },
    metrics: {
      source_count: 0,
      trend_item_count: 0,
      candidate_count: 0,
      candidates_new_7d: 0,
      candidates_to_review: 0,
      in_development: 0,
      watching: 0,
      dropped: 0,
      proposals_needs_review: 0,
      avg_margin_approved_pct: 0,
      below_margin_floor: 0,
    },
    sources: [],
    trend_items: [],
    candidates: [],
    proposals: [],
    sync_log: [
      {
        at: new Date(0).toISOString(),
        actor: "kelly-picks",
        action: "empty_snapshot",
        detail: "No picks snapshot exists yet. Configure sources, then let the agent sweep and ingest trend payloads.",
      },
    ],
  };
}

export function computeMetrics(snapshot: PicksSnapshot): SnapshotMetrics {
  const candidates = snapshot.candidates || [];
  const proposals = snapshot.proposals || [];
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const approved = candidates.filter((item) => item.stage === "develop");
  const marginOf = (item: Candidate): number => Number(item.margin_card?.margin_pct || 0);
  return {
    source_count: (snapshot.sources || []).length,
    trend_item_count: (snapshot.trend_items || []).length,
    candidate_count: candidates.length,
    candidates_new_7d: candidates.filter((item) => Date.parse(item.first_seen || "") >= weekAgo).length,
    candidates_to_review: candidates.filter((item) => ["new", "reviewing"].includes(item.stage)).length,
    in_development: approved.length,
    watching: candidates.filter((item) => item.stage === "watch").length,
    dropped: candidates.filter((item) => item.stage === "dropped").length,
    proposals_needs_review: proposals.filter((item) => item.status === "needs_review").length,
    avg_margin_approved_pct: approved.length
      ? Math.round((approved.reduce((sum, item) => sum + marginOf(item), 0) / approved.length) * 10) / 10
      : 0,
    below_margin_floor: candidates.filter((item) => item.margin_card?.below_floor).length,
  };
}

// ── Overlay decisions onto a snapshot (read-time projection) ──────────────────
export function applyDecisions(
  snapshot: PicksSnapshot,
  decisions: { decisions?: Record<string, Decision> } | null,
): PicksSnapshot {
  const map = decisions?.decisions || {};
  const next: PicksSnapshot = { ...snapshot };
  next.candidates = (snapshot.candidates || []).map((item) => {
    const decision = map[item.candidate_id];
    if (!decision) return item;
    const merged = { ...item, verdict: decision };
    if (decision.stage) merged.stage = decision.stage;
    return merged;
  });
  next.proposals = (snapshot.proposals || []).map((item) => {
    const decision = map[item.proposal_id];
    if (!decision) return item;
    const merged = { ...item, review: decision };
    if (decision.status) merged.status = decision.status;
    if (typeof decision.brief === "string" && decision.brief) merged.brief = decision.brief;
    return merged;
  });
  next.trend_items = (snapshot.trend_items || []).map((item) => {
    const decision = map[item.trend_id];
    if (!decision) return item;
    return { ...item, promotion: decision };
  });
  return next;
}

// ── Config summarization (sanitized: secret env vars become readiness flags) ──
function collectSecretEnvNames(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectSecretEnvNames(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (key.endsWith("_env") && typeof inner === "string" && inner) found.add(inner);
      else collectSecretEnvNames(inner, found);
    }
  }
  return found;
}

export function summarizeConfig(configResult: ConfigResult) {
  const config: Config = configResult.config || {};
  const profile: Record<string, any> =
    config.seller_profile && typeof config.seller_profile === "object" ? config.seller_profile : {};
  const platforms: Platform[] = Array.isArray(config.platforms) ? config.platforms : [];
  const sources: Array<Record<string, any>> = Array.isArray(config.sources) ? config.sources : [];
  const freight: Record<string, any> = config.freight && typeof config.freight === "object" ? config.freight : {};
  const secretEnvs = [...collectSecretEnvNames(config)];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    seller_profile: {
      store_name: profile.store_name || "",
      categories: Array.isArray(profile.categories) ? profile.categories : [],
      target_platforms: Array.isArray(profile.target_platforms) ? profile.target_platforms : [],
      margin_floor_pct: Number(profile.margin_floor_pct) || 0,
      max_cogs: Number(profile.max_cogs) || 0,
    },
    platforms: platforms.map((platform) => ({
      platform_id: platform.platform_id || "",
      name: platform.name || platform.platform_id || "",
      currency: platform.currency || "USD",
      referral_fee_pct: Number(platform.referral_fee_pct) || 0,
      fulfillment_flat: Number(platform.fulfillment_flat) || 0,
    })),
    freight: {
      default_per_unit: Number(freight.default_per_unit) || 0,
      rules: (Array.isArray(freight.rules) ? freight.rules : []).map((rule) => ({
        category: rule.category || "*",
        per_unit: Number(rule.per_unit) || 0,
      })),
    },
    ad_cost_default_pct: Number(config.ad_cost_default_pct) || 0,
    sources: sources.map((source) => ({
      source_id: source.source_id || "",
      kind: source.kind || "",
      name: source.name || source.source_id || "",
      method: source.method || "manual",
    })),
    env_readiness: secretEnvs.map((name) => ({ name, ready: Boolean(process.env[name]) })),
  };
}
