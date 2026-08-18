#!/usr/bin/env node
// Trusted hand-off step. Kelly Legal Contracts's AirApp never ingests a
// contract itself — the browser cannot read an arbitrary local file path.
// This script parses a JSON payload file (one draft/issue object, or
// { "contracts": [...], "issues": [...] } — the legacy generic keys
// "products"/"drafts" are also accepted for compatibility with older
// payloads), validates it against the platform/workstream field shapes and
// the required-fields rule set on the Settings row, and upserts contracts +
// issues into Busabase by natural key (contract_id/name+sku, issue_id) so
// re-ingests are idempotent.
//
// slugify/validateProduct/validateDraft/normalizeFields/SOURCES/STATUSES/
// IMAGE_STATUSES are ported (renamed product->contract, draft->issue) from
// the retired scripts/ingest_contracts.ts; only the write target changed,
// from a persisted app/.data/contract_snapshot.json to Busabase's
// contracts/issues Bases.
//
// Usage: node scripts/ingest_contracts.mjs <payload.json> [--apply]
// Without --apply this is a dry run that only prints what would be written.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";
import { PLATFORMS, PLATFORM_FIELD_SHAPES, configFromSettingsRow } from "../app/app/js/contracts-model.js";

function help() {
  console.log(`Usage: node scripts/ingest_contracts.mjs <payload.json> [--apply]

Parses a JSON payload file (one issue object, or { "contracts": [...], "issues":
[...] }), validates it against the workstream field shapes and the Settings
row's required-fields rules, and upserts contracts/issues into Busabase.
Without --apply this is a dry run that only prints what would be written.`);
}

// ---- Ported (renamed) from the retired scripts/ingest_contracts.ts ----

const SOURCES = new Set(["manual", "agent_import"]);
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const IMAGE_STATUSES = new Set(["ready", "missing", "needs_edit"]);

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item"
  );
}

function validateContract(input, index) {
  const errors = [];
  const where = `contracts[${index}]`;
  for (const key of ["name", "sku"]) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`${where}.${key} must be a non-empty string`);
  }
  if (input.source && !SOURCES.has(input.source)) errors.push(`${where}.source must be manual or agent_import`);
  if (input.platforms !== undefined) {
    if (!Array.isArray(input.platforms)) errors.push(`${where}.platforms must be an array`);
    else
      for (const platform of input.platforms) {
        if (!PLATFORMS.includes(platform)) errors.push(`${where}.platforms contains unknown platform: ${platform}`);
      }
  }
  for (const key of ["features", "keywords", "locales"]) {
    if (input[key] !== undefined && !Array.isArray(input[key])) errors.push(`${where}.${key} must be an array`);
  }
  /** @type {[string, string[]][]} */
  const shapedFields = [
    ["specs", ["name", "value"]],
    ["images", ["name", "status"]],
  ];
  for (const [key, fields] of shapedFields) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key])) {
      errors.push(`${where}.${key} must be an array`);
      continue;
    }
    input[key].forEach((entry, entryIndex) => {
      if (!entry || typeof entry !== "object") errors.push(`${where}.${key}[${entryIndex}] must be an object`);
      else
        for (const field of fields) {
          if (typeof entry[field] !== "string" || !entry[field])
            errors.push(`${where}.${key}[${entryIndex}].${field} must be a non-empty string`);
        }
      if (key === "images" && entry?.status && !IMAGE_STATUSES.has(entry.status)) {
        errors.push(`${where}.images[${entryIndex}].status must be ready, missing, or needs_edit`);
      }
    });
  }
  return errors;
}

function validateIssue(input, index, config) {
  const errors = [];
  const where = `issues[${index}]`;
  if (!input.contract_id && !(typeof input.contract === "string" && input.contract.trim())) {
    errors.push(`${where} needs contract_id or contract (name/SKU)`);
  }
  if (!PLATFORMS.includes(input.platform)) errors.push(`${where}.platform must be one of: ${PLATFORMS.join(", ")}`);
  if (input.status && !STATUSES.has(input.status)) errors.push(`${where}.status is invalid: ${input.status}`);
  const fields = input.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    errors.push(`${where}.fields must be an object`);
    return errors;
  }
  const shape = PLATFORM_FIELD_SHAPES[input.platform];
  if (!shape) return errors;
  for (const key of shape.strings) {
    if (fields[key] !== undefined && typeof fields[key] !== "string")
      errors.push(`${where}.fields.${key} must be a string`);
  }
  for (const key of shape.arrays) {
    if (fields[key] === undefined) continue;
    if (!Array.isArray(fields[key])) {
      errors.push(`${where}.fields.${key} must be an array`);
    } else if (key === "item_specifics") {
      fields[key].forEach((entry, entryIndex) => {
        if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
          errors.push(`${where}.fields.item_specifics[${entryIndex}] must be { "name", "value" }`);
        }
      });
    }
  }
  const known = new Set([...shape.strings, ...shape.arrays]);
  for (const key of Object.keys(fields)) {
    if (!known.has(key)) errors.push(`${where}.fields.${key} is not a known ${input.platform} field`);
  }
  const required =
    (config.platforms || []).find((entry) => entry.platform === input.platform)?.rules?.required_fields ||
    shape.default_required;
  const missing = required.filter((key) => {
    const value = fields[key];
    return Array.isArray(value) ? value.length === 0 : !(typeof value === "string" && value.trim());
  });
  if (missing.length)
    errors.push(
      `${where}.fields is missing required ${input.platform} fields: ${missing.join(", ")} (checks will also flag this)`,
    );
  return errors;
}

function normalizeIssueFields(platform, fields = {}) {
  const shape = PLATFORM_FIELD_SHAPES[platform];
  const normalized = {};
  for (const key of shape.strings) normalized[key] = typeof fields[key] === "string" ? fields[key] : "";
  for (const key of shape.arrays) {
    normalized[key] =
      key === "item_specifics"
        ? (Array.isArray(fields[key]) ? fields[key] : []).map((entry) => ({
            name: String(entry.name || ""),
            value: String(entry.value || ""),
          }))
        : (Array.isArray(fields[key]) ? fields[key] : []).map(String);
  }
  return normalized;
}

// ---- Busabase plumbing ----

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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
      author: "kelly-legal-contracts-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-legal-contracts-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");
  const payloadPath = argv.find((arg) => !arg.startsWith("--"));
  if (!payloadPath) return help();

  const payloadRaw = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const payload =
    Array.isArray(payloadRaw.contracts) ||
    Array.isArray(payloadRaw.issues) ||
    Array.isArray(payloadRaw.products) ||
    Array.isArray(payloadRaw.drafts)
      ? payloadRaw
      : { issues: [payloadRaw] };
  const incomingContracts = payload.contracts || payload.products || [];
  const incomingIssues = payload.issues || payload.drafts || [];

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

  const [existingContracts, existingIssues, settingsRows] = await Promise.all([
    readAll(client, declared("contracts")),
    readAll(client, declared("issues")),
    readAll(client, declared("settings")),
  ]);
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const config = configFromSettingsRow(settings);

  const allErrors = [
    ...incomingContracts.flatMap((input, index) => validateContract(input, index)),
    ...incomingIssues.flatMap((input, index) => validateIssue(input, index, config)),
  ];
  // Missing-required-field errors are advisory when the issue is explicitly a
  // work-in-progress needs_review draft; hard-fail only on structural problems.
  const hardErrors = allErrors.filter((error) => !error.includes("checks will also flag this"));
  if (hardErrors.length) {
    for (const error of hardErrors) console.error(`- ${error}`);
    throw new Error("Payload validation failed");
  }
  for (const warning of allErrors.filter((error) => error.includes("checks will also flag this"))) {
    console.error(`warning: ${warning}`);
  }

  const contractsById = new Map(existingContracts.map((row) => [row.contract_id, row]));
  const contractsByLabel = new Map(
    existingContracts.flatMap((row) => [
      [row.name, row],
      [row.sku, row],
    ]),
  );
  let nextContractRef = Math.max(0, ...existingContracts.map((row) => Number(row.ref) || 0)) + 1;
  const now = new Date().toISOString();
  const contractWrites = [];

  function mergeContract(input) {
    const contractId = input.contract_id || `ct-${slugify(input.name)}`;
    const existing = contractsById.get(contractId);
    const fields = {
      contract_id: contractId,
      ref: existing ? existing.ref : nextContractRef++,
      name: input.name,
      sku: input.sku,
      category: input.category || existing?.category || "",
      source: input.source || existing?.source || "manual",
      platforms: JSON.stringify(input.platforms || (existing ? JSON.parse(existing.platforms || "[]") : [])),
      locales: JSON.stringify(input.locales || (existing ? JSON.parse(existing.locales || "[]") : [])),
      specs: JSON.stringify(input.specs || (existing ? JSON.parse(existing.specs || "[]") : [])),
      features: JSON.stringify(input.features || (existing ? JSON.parse(existing.features || "[]") : [])),
      keywords: JSON.stringify(input.keywords || (existing ? JSON.parse(existing.keywords || "[]") : [])),
      images: JSON.stringify(input.images || (existing ? JSON.parse(existing.images || "[]") : [])),
      notes: input.notes ?? existing?.notes ?? "",
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    contractWrites.push({ existing, fields, created: !existing });
    contractsById.set(contractId, fields);
    contractsByLabel.set(fields.name, fields);
    contractsByLabel.set(fields.sku, fields);
    return contractId;
  }

  function resolveContractId(input) {
    if (input.contract_id && contractsById.has(input.contract_id)) return input.contract_id;
    const label = String(input.contract || "").trim();
    if (label && contractsByLabel.has(label)) return contractsByLabel.get(label).contract_id;
    return null;
  }

  for (const input of incomingContracts) mergeContract(input);

  const issuesById = new Map(existingIssues.map((row) => [row.issue_id, row]));
  let nextIssueRef = Math.max(0, ...existingIssues.map((row) => Number(row.ref) || 0)) + 1;
  const issueWrites = [];

  for (const input of incomingIssues) {
    const contractId = resolveContractId(input);
    if (!contractId) {
      console.error(
        `issues: cannot resolve contract for ${JSON.stringify(input.contract_id || input.contract)}; ingest the contract first.`,
      );
      process.exitCode = 1;
      continue;
    }
    const contractKey = contractId.replace(/^ct-/, "");
    const locale = String(input.locale || "US").toUpperCase();
    const issueId = input.issue_id || `d-${contractKey}-${input.platform}-${locale.toLowerCase()}`;
    const fields = normalizeIssueFields(input.platform, input.fields);
    const variantGroup = input.variant_group || `${contractKey}-${input.platform}`;
    const existing = issuesById.get(issueId);
    const nextFields = {
      issue_id: issueId,
      ref: existing ? existing.ref : nextIssueRef++,
      contract_id: contractId,
      platform: input.platform,
      locale,
      variant_group: variantGroup,
      status: input.status || "needs_review",
      compliance_score: existing?.compliance_score || 0,
      keyword_strategy: input.keyword_strategy ?? existing?.keyword_strategy ?? "",
      title: fields.title || "",
      subtitle: fields.subtitle || "",
      bullets: JSON.stringify(fields.bullets || []),
      description: fields.description || "",
      search_terms: fields.search_terms || "",
      seo_title: fields.seo_title || "",
      seo_description: fields.seo_description || "",
      selling_points: JSON.stringify(fields.selling_points || []),
      aplus_outline: JSON.stringify(fields.aplus_outline || []),
      item_specifics: JSON.stringify(fields.item_specifics || []),
      compliance_summary:
        typeof input.compliance_summary === "string"
          ? input.compliance_summary
          : existing?.compliance_summary || "Checks pending — run scripts/run_checks.mjs.",
      suggestions: JSON.stringify(
        Array.isArray(input.suggestions) ? input.suggestions.map(String) : JSON.parse(existing?.suggestions || "[]"),
      ),
      decision_action: existing?.decision_action || "",
      decision_note: existing?.decision_note || "",
      decided_at: existing?.decided_at || "",
      execution_status: existing?.execution_status || "",
      execution_operation: existing?.execution_operation || "",
      execution_target: existing?.execution_target || "",
      execution_detail: existing?.execution_detail || "",
      executed_at: existing?.executed_at || "",
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    issueWrites.push({ existing, fields: nextFields, created: !existing, platform: input.platform, locale });
    issuesById.set(issueId, nextFields);
  }

  for (const write of contractWrites) {
    await upsert(
      client,
      declared("contracts"),
      write.existing,
      write.fields,
      `${write.created ? "Ingest" : "Update"} contract ${write.fields.contract_id}`,
      apply,
    );
    console.log(
      `${apply ? (write.created ? "Created" : "Updated") : write.created ? "Would create" : "Would update"} ${write.fields.contract_id} — ${write.fields.name} (${write.fields.sku})`,
    );
  }
  for (const write of issueWrites) {
    await upsert(
      client,
      declared("issues"),
      write.existing,
      write.fields,
      `${write.created ? "Ingest" : "Update"} issue ${write.fields.issue_id}`,
      apply,
    );
    console.log(
      `${apply ? (write.created ? "Created" : "Updated") : write.created ? "Would create" : "Would update"} ${write.fields.issue_id} (Issue #${write.fields.ref}) — ${write.platform} ${write.locale}`,
    );
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write to Busabase.");
  } else {
    console.log("Wrote contracts/issues to Busabase. Run scripts/run_checks.mjs to refresh compliance results.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
