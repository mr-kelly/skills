import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import {
  DECISIONS,
  candidateFields,
  candidateFromRow,
  metrics,
  onboardingFromRows,
  statusForDecision,
} from "../retouch-model.js?v=0.1.0";

const normalize = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("-", "_"), value]));
const encode = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value ?? ""]));
let client;
let bases = new Map();
let setupError = "";
let pendingOnboardingCr = null;

// Only a standalone run may merge its own writes; a deployed AirApp is inside
// the Busabase review boundary. Too consequential to infer from the URL.
import { isStandaloneLocalRuntime } from "../runtime.js";

async function ensureResources() {
  client ||= createRuntimeClient();
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length)
    throw new Error(setupError || "SETUP_REQUIRED: portrait workspace");
  bases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

async function rows(key) {
  const base = bases.get(key);
  const result = await client.records.list({ baseId: base.baseId, limit: base.readLimit });
  return (Array.isArray(result) ? result : result.records || []).map((record) => ({
    ...normalize(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
}

async function findRecord(key, fieldSlug, valueText) {
  const base = bases.get(key);
  try {
    return await client.records.get({ baseId: base.baseId, fieldSlug, valueText });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function resolveAssetUrl(assetId) {
  if (!assetId) return "";
  if (assetId.startsWith("packaged:")) return `./${assetId.slice("packaged:".length).replace(/^\/+/, "")}`;
  try {
    const result = await client.assets.get({ assetId });
    return result?.asset?.url || result?.publicUrl || "";
  } catch {
    return "";
  }
}

async function hydrateCandidate(row) {
  const candidate = candidateFromRow(row);
  const [sourceUrl, outputUrl] = await Promise.all([
    resolveAssetUrl(candidate.source_asset_id),
    resolveAssetUrl(candidate.output_asset_id),
  ]);
  return { ...candidate, source_url: sourceUrl, output_url: outputUrl };
}

function readiness(onboarding, resources) {
  return {
    runtime: "ready",
    onboarding: onboarding.state,
    action: onboarding.state === "complete" ? "none" : pendingOnboardingCr ? "review_change_request" : "configure",
    change_request_id: pendingOnboardingCr?.id || null,
    safe_context: {
      folder: resources.folder?.slug || appConfig.folder.slug,
      schema_version: appConfig.schemaVersion,
      resources: resources.bases.map(({ key, nodeId, baseId, slug }) => ({ key, nodeId, baseId, slug })),
    },
  };
}

function runtimeNotReady(error) {
  const raw = String(error?.message || error || "SETUP_REQUIRED: portrait workspace");
  const code = raw.match(/^([A-Z_]+):/)?.[1] || "SETUP_REQUIRED";
  const pending = code === "SETUP_PENDING";
  const conflict = code === "SETUP_CONFLICT";
  return {
    app: appConfig.appId,
    demo: false,
    data_provider: "busabase",
    readiness: {
      runtime: conflict ? "migration_needed" : "needs_resources",
      onboarding: "not_started",
      action: conflict
        ? "migrate"
        : pending
          ? "review_change_request"
          : code === "SETUP_REQUIRED"
            ? "initialize"
            : "retry",
      change_request_id: pending ? raw.match(/请求\s+([^\s]+)/)?.[1] || null : null,
      safe_context: {
        folder: appConfig.folder.slug,
        schema_version: appConfig.schemaVersion,
        error_code: code,
        reason: raw.replace(/^[A-Z_]+:\s*/, ""),
      },
    },
    snapshot: { candidates: [], metrics: metrics([]), settings: {} },
  };
}

export const busabaseProvider = {
  kind: "busabase",
  async getState() {
    let resources;
    try {
      resources = await ensureResources();
    } catch (error) {
      if (String(error?.message || error).includes("SETUP_")) return runtimeNotReady(error);
      throw error;
    }
    const onboarding = onboardingFromRows(await rows("settings"));
    if (onboarding.state !== "complete") {
      return {
        app: appConfig.appId,
        demo: false,
        data_provider: "busabase",
        readiness: readiness(onboarding, resources),
        snapshot: { candidates: [], metrics: metrics([]), settings: onboarding.settings },
      };
    }
    pendingOnboardingCr = null;
    const candidates = await Promise.all((await rows("candidates")).map(hydrateCandidate));
    return {
      app: appConfig.appId,
      demo: false,
      data_provider: "busabase",
      readiness: readiness(onboarding, resources),
      snapshot: { candidates, metrics: metrics(candidates), settings: onboarding.settings },
    };
  },
  async submitDecision({ candidate_id, action, comment = "", strength } = {}) {
    if (!candidate_id || !DECISIONS.has(action)) throw new Error("A candidate and valid decision are required");
    await ensureResources();
    const record = await findRecord("candidates", "candidate-id", candidate_id);
    if (!record) throw new Error(`Unknown portrait candidate: ${candidate_id}`);
    const current = candidateFromRow(
      normalize(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    );
    const next = candidateFields({
      ...current,
      strength: Number.isFinite(strength) ? strength : current.strength,
      status: statusForDecision(action),
      decision_action: action,
      decision_comment: String(comment),
      decided_at: new Date().toISOString(),
    });
    const changeRequest = await client.records.changeRequest({
      recordId: record.id,
      operation: "update",
      fields: encode(next),
      message: `Portrait candidate ${candidate_id}: ${action}`,
      author: appConfig.appId,
      baseCommitId: record.headCommitId || record.headCommit?.id,
      autoMerge: false,
    });
    return {
      ok: true,
      change_request_id: changeRequest?.id || null,
      change_request_status: changeRequest?.status || "pending",
      reviewed_version: current.review_version,
    };
  },
  async saveOnboarding({ default_preset = "natural", default_strength = 35 } = {}) {
    if (!["natural", "fresh", "studio"].includes(default_preset)) throw new Error("Invalid default preset");
    const strength = Number(default_strength);
    if (!Number.isFinite(strength) || strength < 0 || strength > 100) {
      throw new Error("Default strength must be between 0 and 100");
    }
    await ensureResources();
    const existing = await findRecord("settings", "record-id", "config");
    const now = new Date().toISOString();
    const fields = encode({
      record_id: "config",
      onboarding_version: 1,
      completed_at: now,
      default_preset,
      default_strength: strength,
      metadata_policy: "strip",
      external_upload_policy: "explicit-only",
      overwrite_policy: "explicit-only",
      updated_at: now,
    });
    const autoMerge = isStandaloneLocalRuntime();
    const base = bases.get("settings");
    const changeRequest = existing
      ? await client.records.changeRequest({
          recordId: existing.id,
          operation: "update",
          fields,
          message: "Configure portrait retouch defaults and privacy policy",
          author: appConfig.appId,
          baseCommitId: existing.headCommitId || existing.headCommit?.id,
          autoMerge,
        })
      : await client.bases.createChangeRequest({
          baseId: base.baseId,
          fields,
          message: "Configure portrait retouch defaults and privacy policy",
          submittedBy: appConfig.appId,
          autoMerge,
        });
    pendingOnboardingCr = changeRequest;
    return {
      ok: true,
      change_request_id: changeRequest?.id || null,
      change_request_status: changeRequest?.status || "pending",
    };
  },
  async provisionResources() {
    client ||= createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      setupError = String(error?.message || error);
      throw error;
    }
  },
};
