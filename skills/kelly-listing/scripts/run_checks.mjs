#!/usr/bin/env node
// Trusted hand-off step. Re-reads products + drafts + the claims registry
// (claims/claim_rules) + per-platform rule sets (Settings row) off Busabase,
// evaluates every draft via app/app/js/listing-model.js's evaluateDraft()
// (ported verbatim from the retired app/server/rules.ts), upserts the Checks
// Base, and recomputes+writes each draft's compliance_score via
// scoreChecks() (same POINTS table as the retired script). Re-running is
// idempotent. Character caps count code points; byte caps use TextEncoder
// (the browser-safe equivalent of the retired Buffer.byteLength).
//
// Usage: node scripts/run_checks.mjs [--apply]
// Without --apply this is a dry run that only prints what would change.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import {
  configFromSettingsRow,
  evaluateDraft,
  normalizeClaimRow,
  normalizeClaimRuleRow,
  normalizeDraftRow,
  normalizeProductRow,
  ruleCatalog,
  scoreChecks,
} from "../app/app/js/listing-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/run_checks.mjs [--apply]

Evaluates every deterministic compliance rule (required fields, title length,
banned words, competitor brands, bullet/selling-point counts, SEO meta
length, all-caps noise, keyword stuffing, image checklist, claims registry)
against every draft in Busabase, upserts the Checks Base, and recomputes each
draft's compliance_score. Without --apply this is a dry run.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseDraftFields(row) {
  return {
    draft_id: row.draft_id,
    ref: row.ref,
    product_id: row.product_id,
    platform: row.platform,
    locale: row.locale || "",
    variant_group: row.variant_group || "",
    status: row.status || "needs_review",
    compliance_score: row.compliance_score,
    keyword_strategy: row.keyword_strategy || "",
    title: row.title || "",
    subtitle: row.subtitle || "",
    bullets: row.bullets || "[]",
    description: row.description || "",
    search_terms: row.search_terms || "",
    seo_title: row.seo_title || "",
    seo_description: row.seo_description || "",
    selling_points: row.selling_points || "[]",
    aplus_outline: row.aplus_outline || "[]",
    item_specifics: row.item_specifics || "[]",
    compliance_summary: row.compliance_summary || "",
    suggestions: row.suggestions || "[]",
    decision_action: row.decision_action || "",
    decision_note: row.decision_note || "",
    decided_at: row.decided_at || "",
    execution_status: row.execution_status || "",
    execution_operation: row.execution_operation || "",
    execution_target: row.execution_target || "",
    execution_detail: row.execution_detail || "",
    executed_at: row.executed_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
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

async function upsert(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-listing-checks",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-listing-checks",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Listing Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [productRows, draftRows, existingChecks, claimRows, claimRuleRows, settingsRows] = await Promise.all([
    readAll(client, declared("products")),
    readAll(client, declared("drafts")),
    readAll(client, declared("checks")),
    readAll(client, declared("claims")),
    readAll(client, declared("claim_rules")),
    readAll(client, declared("settings")),
  ]);
  if (!draftRows.length) throw new Error("No drafts found. Run scripts/ingest_drafts.mjs first.");

  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const config = configFromSettingsRow(settings);
  if (!Array.isArray(config.platforms) || !config.platforms.length) {
    throw new Error("No platforms[] rule sets found on the Settings row. Seed config.platforms first.");
  }
  const claims = {
    claims: claimRows.map(normalizeClaimRow),
    rules: claimRuleRows.map(normalizeClaimRuleRow),
  };
  const products = productRows.map(normalizeProductRow);
  const productsById = new Map(products.map((product) => [product.product_id, product]));

  const existingByKey = new Map(existingChecks.map((row) => [`${row.draft_id}:${row.rule_id}`, row]));
  const checkWrites = [];
  let failCount = 0;
  let warnCount = 0;

  for (const row of draftRows) {
    const draft = normalizeDraftRow(row);
    const product = productsById.get(draft.product_id);
    const draftChecks = [];
    for (const result of evaluateDraft(draft, product, config, "en", claims)) {
      if (result.result === "fail") failCount += 1;
      else if (result.result === "warn") warnCount += 1;
      const key = `${draft.draft_id}:${result.rule_id}`;
      const existing = existingByKey.get(key);
      const fields = {
        check_id: `chk-${draft.draft_id.replace(/^d-/, "")}-${result.rule_id}`,
        draft_id: draft.draft_id,
        rule_id: result.rule_id,
        severity: result.severity,
        result: result.result,
        evidence: result.evidence,
        ref_rules: JSON.stringify(result.refs?.rules || []),
        ref_claims: JSON.stringify(result.refs?.claims || []),
        checked_at: new Date().toISOString(),
      };
      draftChecks.push(fields);
      checkWrites.push({ existing, fields });
    }
    const complianceScore = scoreChecks(draftChecks);
    if (Number(row.compliance_score) !== complianceScore) {
      await upsert(
        client,
        declared("drafts"),
        row,
        { ...baseDraftFields(row), compliance_score: complianceScore },
        `Recompute compliance score for ${draft.draft_id}: ${complianceScore}`,
        apply,
      );
    }
  }

  for (const write of checkWrites) {
    await upsert(
      client,
      declared("checks"),
      write.existing,
      write.fields,
      `Check ${write.fields.check_id}: ${write.fields.result}`,
      apply,
    );
  }

  const catalog = ruleCatalog(config, "en");
  console.log(
    `${apply ? "Checked" : "Dry run for"} ${draftRows.length} draft(s) against ${catalog.length} rule(s): ${failCount} fail, ${warnCount} warn.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
