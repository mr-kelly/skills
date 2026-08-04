#!/usr/bin/env node
// Deterministic margin recompute across every candidate, ported from the
// retired scripts/compute_margins.ts. Reads the fee tables from the
// Settings Base and recomputes each candidate's margin card via
// picks-model.js's computeMarginCard() (the exact same math the browser's
// live what-if panel and this script both use, so they never disagree):
// - Platform fee comes from settings.platforms[] (referral_fee_pct + fulfillment_flat).
// - Freight uses an agent-quoted margin_card.freight when present
//   (freight_quoted: true), otherwise the config freight rule for the
//   candidate's category, otherwise the default.
// - Ad cost keeps an agent-provided margin_card.ad_cost when present,
//   otherwise price * ad_cost_default_pct.
// - Flags candidates whose margin_pct falls below seller_profile.margin_floor_pct.
// Idempotent: re-running with the same settings and candidates changes nothing.
//
// Usage: node scripts/compute_margins.mjs
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { computeMarginCard, freightRulesMap, platformsMap } from "../app/app/js/picks-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function main() {
  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Picks Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [candidates, settingsRows] = await Promise.all([
    readAll(client, declared("candidates")),
    readAll(client, declared("settings")),
  ]);
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const sellerProfile = parseJsonValue(settings.seller_profile, {});
  const platforms = platformsMap(parseJsonValue(settings.platforms, []));
  const freightRules = freightRulesMap(parseJsonValue(settings.freight, {}));
  const freightDefault = Number(parseJsonValue(settings.freight, {}).default_per_unit) || 0;
  const adDefaultPct = Number(settings.ad_cost_default_pct) || 0;
  const marginFloor = Number(sellerProfile.margin_floor_pct) || 0;

  const now = new Date().toISOString();
  let changed = 0;
  let flagged = 0;

  for (const candidate of candidates) {
    const card = parseJsonValue(candidate.margin_card, {});
    const next = computeMarginCard({
      card,
      category: candidate.category || "",
      estPrice: Number(candidate.est_price) || 0,
      platform: platforms.get(candidate.platform_id || ""),
      freightRules,
      freightDefault,
      adDefaultPct,
      marginFloor,
    });
    const before = JSON.stringify({ ...card, computed_at: "" });
    const after = JSON.stringify({ ...next, computed_at: "" });
    if (before !== after) {
      const { __recordId, __headCommitId, ...candidateFields } = candidate;
      await client.records.changeRequest({
        recordId: __recordId,
        operation: "update",
        fields: toBusabaseFields({
          ...candidateFields,
          margin_card: JSON.stringify({ ...next, computed_at: now }),
          last_updated: now,
        }),
        message: `Recompute margin card for ${candidate.candidate_id}`,
        author: "kelly-picks-compute-margins",
        baseCommitId: __headCommitId,
        autoMerge: true,
      });
      changed += 1;
    }
    if (next.below_floor) flagged += 1;
  }

  if (changed > 0) {
    await client.bases.createChangeRequest({
      baseId: declared("sync_log").baseId,
      fields: toBusabaseFields({
        log_id: `log-${Date.now().toString(36)}`,
        at: now,
        actor: "kelly-picks-agent",
        action: "compute_margins",
        detail: `${changed} margin cards recomputed; ${flagged} candidates below the ${marginFloor}% margin floor.`,
      }),
      message: "Compute margins sync log",
      submittedBy: "kelly-picks-compute-margins",
      autoMerge: true,
    });
  }

  console.log(`OK: ${changed} margin cards changed, ${flagged} below the ${marginFloor}% floor.`);
  if (changed === 0) console.log("No changes — Busabase already consistent with the fee tables (idempotent).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
