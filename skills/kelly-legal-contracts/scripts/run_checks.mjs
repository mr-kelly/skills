#!/usr/bin/env node
// Trusted hand-off step. Re-reads contracts + issues + the clause playbook
// (claims/claim_rules) + workstream rule sets (Settings row) off Busabase,
// evaluates every issue via content/kelly-legal-contracts-app/app/js/contracts-model.js's evaluateIssue()
// (ported verbatim from the retired content/kelly-legal-contracts-app/server/rules.ts), upserts the Checks
// Base, and recomputes+writes each issue's compliance_score via
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
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-legal-contracts-app/app/js/config.js";
import {
  configFromSettingsRow,
  evaluateIssue,
  normalizeClaimRow,
  normalizeClaimRuleRow,
  normalizeContractRow,
  normalizeIssueRow,
  ruleCatalog,
  scoreChecks,
} from "../content/kelly-legal-contracts-app/app/js/contracts-model.js";

function help() {
  console.log(`Usage: node scripts/run_checks.mjs [--apply]

Evaluates every deterministic risk-check rule (required fields, title length,
hard-stop terms, restricted positions, risk-note/business-ask counts, memo
length, all-caps noise, watch-term repetition, document checklist, clause
playbook) against every issue in Busabase, upserts the Checks Base, and
recomputes each issue's compliance_score. Without --apply this is a dry run.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields).
function baseIssueFields(row) {
  return {
    issue_id: row.issue_id,
    ref: row.ref,
    contract_id: row.contract_id,
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
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
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
      author: "kelly-legal-contracts-checks",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-legal-contracts-checks",
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
    throw new Error("Kelly Legal Contracts Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [contractRows, issueRows, existingChecks, claimRows, claimRuleRows, settingsRows] = await Promise.all([
    readAll(client, declared("contracts")),
    readAll(client, declared("issues")),
    readAll(client, declared("checks")),
    readAll(client, declared("claims")),
    readAll(client, declared("claim-rules")),
    readAll(client, declared("settings")),
  ]);
  if (!issueRows.length) throw new Error("No issues found. Run scripts/ingest_contracts.mjs first.");

  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const config = configFromSettingsRow(settings);
  if (!Array.isArray(config.platforms) || !config.platforms.length) {
    throw new Error("No platforms[] rule sets found on the Settings row. Seed config.platforms first.");
  }
  const claims = {
    claims: claimRows.map(normalizeClaimRow),
    rules: claimRuleRows.map(normalizeClaimRuleRow),
  };
  const contracts = contractRows.map(normalizeContractRow);
  const contractsById = new Map(contracts.map((contract) => [contract.contract_id, contract]));

  const existingByKey = new Map(existingChecks.map((row) => [`${row.issue_id}:${row.rule_id}`, row]));
  const checkWrites = [];
  let failCount = 0;
  let warnCount = 0;

  for (const row of issueRows) {
    const issue = normalizeIssueRow(row);
    const contract = contractsById.get(issue.contract_id);
    const issueChecks = [];
    for (const result of evaluateIssue(issue, contract, config, "en", claims)) {
      if (result.result === "fail") failCount += 1;
      else if (result.result === "warn") warnCount += 1;
      const key = `${issue.issue_id}:${result.rule_id}`;
      const existing = existingByKey.get(key);
      const fields = {
        check_id: `chk-${issue.issue_id.replace(/^d-/, "")}-${result.rule_id}`,
        issue_id: issue.issue_id,
        rule_id: result.rule_id,
        severity: result.severity,
        result: result.result,
        evidence: result.evidence,
        ref_rules: JSON.stringify(result.refs?.rules || []),
        ref_claims: JSON.stringify(result.refs?.claims || []),
        checked_at: new Date().toISOString(),
      };
      issueChecks.push(fields);
      checkWrites.push({ existing, fields });
    }
    const complianceScore = scoreChecks(issueChecks);
    if (Number(row.compliance_score) !== complianceScore) {
      await upsert(
        client,
        declared("issues"),
        row,
        { ...baseIssueFields(row), compliance_score: complianceScore },
        `Recompute risk score for ${issue.issue_id}: ${complianceScore}`,
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
    `${apply ? "Checked" : "Dry run for"} ${issueRows.length} issue(s) against ${catalog.length} rule(s): ${failCount} fail, ${warnCount} warn.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
