#!/usr/bin/env node
// Trusted hand-off step. Legal Casebase Ingest's AirApp never imports a
// judgment/award document itself — the browser cannot read an arbitrary
// local file path. This script parses a JSON payload file (the same shape
// the retired scripts/ingest_documents.ts accepted per
// references/casebase-schema.md's "Payload Import" section: any of
// entities/items/checks/activity_log), validates the required fields per
// record type, and upserts entities/items/checks into Busabase by natural
// id (item-id/entity-id/check-id) so re-ingests are idempotent — mirroring
// the retired local importer's upsertById() behavior, just against Busabase
// instead of a local JSON snapshot file.
//
// Usage: node scripts/ingest_documents.mjs payload.json [more.json ...] [--apply]
// Without --apply this is a dry run that only prints what would be written.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { ITEM_LABEL_EN } from "../app/app/js/casebase-model.js";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/ingest_documents.mjs <payload.json> [more.json ...] [--apply]

Parses one or more JSON payload files, each with any of { "entities": [...],
"items": [...], "checks": [...] } (a bare { "items": [...] } payload, or a
single item object, are also accepted), validates required fields, and
upserts them into Busabase by id. Without --apply this is a dry run.`);
}

const REQUIRED_ITEM_FIELDS = ["id", "title", "summary"];
const REQUIRED_ENTITY_FIELDS = ["id", "title"];
const REQUIRED_CHECK_FIELDS = ["id", "label", "status"];
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);

function validateItem(input, index) {
  const errors = [];
  const where = `items[${index}]`;
  for (const key of REQUIRED_ITEM_FIELDS) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`${where}.${key} must be a non-empty string`);
  }
  if (input.status && !STATUSES.has(input.status)) errors.push(`${where}.status is invalid: ${input.status}`);
  return errors;
}

function validateEntity(input, index) {
  const errors = [];
  const where = `entities[${index}]`;
  for (const key of REQUIRED_ENTITY_FIELDS) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`${where}.${key} must be a non-empty string`);
  }
  return errors;
}

function validateCheck(input, index) {
  const errors = [];
  const where = `checks[${index}]`;
  for (const key of REQUIRED_CHECK_FIELDS) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`${where}.${key} must be a non-empty string`);
  }
  if (input.status && !["pass", "warn", "fail"].includes(input.status)) {
    errors.push(`${where}.status must be pass|warn|fail`);
  }
  return errors;
}

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
      author: "kelly-legal-casebase-ingest-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-legal-casebase-ingest-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");
  const files = argv.filter((arg) => !arg.startsWith("--"));
  if (!files.length) return help();

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Legal Casebase Ingest Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [existingItems, existingEntities, existingChecks] = await Promise.all([
    readAll(client, declared("items")),
    readAll(client, declared("entities")),
    readAll(client, declared("checks")),
  ]);
  const itemsById = new Map(existingItems.map((row) => [row.item_id, row]));
  const entitiesById = new Map(existingEntities.map((row) => [row.entity_id, row]));
  const checksById = new Map(existingChecks.map((row) => [row.check_id, row]));
  let nextItemRef = existingItems.length + 1;

  const itemWrites = [];
  const entityWrites = [];
  const checkWrites = [];
  const allErrors = [];

  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    const payload =
      Array.isArray(raw.items) || Array.isArray(raw.entities) || Array.isArray(raw.checks) ? raw : { items: [raw] };
    const incomingItems = payload.items || [];
    const incomingEntities = payload.entities || [];
    const incomingChecks = payload.checks || [];

    allErrors.push(
      ...incomingItems.flatMap((input, index) => validateItem(input, index)),
      ...incomingEntities.flatMap((input, index) => validateEntity(input, index)),
      ...incomingChecks.flatMap((input, index) => validateCheck(input, index)),
    );

    const now = new Date().toISOString();
    for (const input of incomingItems) {
      const existing = itemsById.get(input.id);
      const fields = {
        item_id: input.id,
        ref: input.ref || existing?.ref || `${ITEM_LABEL_EN} #${nextItemRef++}`,
        title: input.title,
        category: input.category ?? existing?.category ?? "",
        status: input.status || existing?.status || "needs_review",
        owner: input.owner ?? existing?.owner ?? "",
        risk: JSON.stringify(input.risk ?? (existing ? JSON.parse(existing.risk || "[]") : [])),
        summary: input.summary,
        body: input.body ?? existing?.body ?? "",
        recommendation: input.recommendation ?? existing?.recommendation ?? "",
        proposed_action: input.proposed_action ?? existing?.proposed_action ?? "",
        draft: input.draft ?? existing?.draft ?? "",
        evidence: JSON.stringify(input.evidence ?? (existing ? JSON.parse(existing.evidence || "[]") : [])),
        cause: input.fields?.cause ?? existing?.cause ?? "",
        court: input.fields?.court ?? existing?.court ?? "",
        procedure: input.fields?.procedure ?? existing?.procedure ?? "",
        outcome: input.fields?.outcome ?? existing?.outcome ?? "",
        paragraphs: JSON.stringify(
          input.fields?.paragraphs ?? (existing ? JSON.parse(existing.paragraphs || "[]") : []),
        ),
        extraction_confidence: input.fields?.extraction_confidence ?? existing?.extraction_confidence ?? "",
        duplicate_score: input.fields?.duplicate_score ?? existing?.duplicate_score ?? "",
        ingest_bucket: input.fields?.ingest_bucket ?? existing?.ingest_bucket ?? "",
        pii_cleared: String(input.fields?.pii_cleared ?? existing?.pii_cleared ?? "false"),
        parties_redacted: String(input.fields?.parties_redacted ?? existing?.parties_redacted ?? "false"),
        contacts_redacted: String(input.fields?.contacts_redacted ?? existing?.contacts_redacted ?? "false"),
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
      itemWrites.push({ existing, fields, created: !existing });
      itemsById.set(input.id, fields);
    }

    for (const input of incomingEntities) {
      const existing = entitiesById.get(input.id);
      const fields = {
        entity_id: input.id,
        title: input.title,
        meta: input.meta ?? existing?.meta ?? "",
        status: input.status ?? existing?.status ?? "",
        owner: input.owner ?? existing?.owner ?? "",
        summary: input.summary ?? existing?.summary ?? "",
        tags: JSON.stringify(input.tags ?? (existing ? JSON.parse(existing.tags || "[]") : [])),
        metrics: JSON.stringify(input.metrics ?? (existing ? JSON.parse(existing.metrics || "{}") : {})),
      };
      entityWrites.push({ existing, fields, created: !existing });
      entitiesById.set(input.id, fields);
    }

    for (const input of incomingChecks) {
      const existing = checksById.get(input.id);
      const fields = {
        check_id: input.id,
        label: input.label,
        status: input.status,
        detail: input.detail ?? existing?.detail ?? "",
        item_id: input.item_id ?? existing?.item_id ?? "",
        severity: input.severity ?? existing?.severity ?? "",
      };
      checkWrites.push({ existing, fields, created: !existing });
      checksById.set(input.id, fields);
    }
  }

  if (allErrors.length) {
    for (const error of allErrors) console.error(`- ${error}`);
    throw new Error("Payload validation failed");
  }

  for (const write of entityWrites) {
    await upsert(
      client,
      declared("entities"),
      write.existing,
      write.fields,
      `${write.created ? "Ingest" : "Update"} entity ${write.fields.entity_id}`,
      apply,
    );
    console.log(
      `${apply ? (write.created ? "Created" : "Updated") : write.created ? "Would create" : "Would update"} entity ${write.fields.entity_id} — ${write.fields.title}`,
    );
  }
  for (const write of itemWrites) {
    await upsert(
      client,
      declared("items"),
      write.existing,
      write.fields,
      `${write.created ? "Ingest" : "Update"} item ${write.fields.item_id}`,
      apply,
    );
    console.log(
      `${apply ? (write.created ? "Created" : "Updated") : write.created ? "Would create" : "Would update"} ${write.fields.item_id} (${write.fields.ref}) — ${write.fields.title}`,
    );
  }
  for (const write of checkWrites) {
    await upsert(
      client,
      declared("checks"),
      write.existing,
      write.fields,
      `${write.created ? "Ingest" : "Update"} check ${write.fields.check_id}`,
      apply,
    );
    console.log(
      `${apply ? (write.created ? "Created" : "Updated") : write.created ? "Would create" : "Would update"} check ${write.fields.check_id} — ${write.fields.label} (${write.fields.status})`,
    );
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write to Busabase.");
  } else {
    console.log(
      `Ingested ${itemWrites.length} item(s), ${entityWrites.length} entit(y/ies), ${checkWrites.length} check(s) into Busabase.`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
