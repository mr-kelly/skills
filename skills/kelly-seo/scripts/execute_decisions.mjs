#!/usr/bin/env node
// Dry-run-by-default execution stub for approved SEO opportunities, ported
// from the retired scripts/execute_decisions.ts. Re-reads the opportunities
// Base and plans (or, with --apply, marks ready_for_agent) a concrete
// operation for each `status: approved` opportunity. It performs NO external
// side effects: the agent applies the approved change in the site's
// repo/CMS OUTSIDE this script, then records the real result and marks the
// opportunity `done` — matches SKILL.md's Boundary section exactly. GEO
// opportunities are executed manually by the agent per SKILL.md, not by this
// script (same scope as the retired execute_decisions.ts).
//
// Usage:
//   node scripts/execute_decisions.mjs            Dry-run: print the plan for every approved opportunity.
//   node scripts/execute_decisions.mjs --apply     Mark approved opportunities ready_for_agent (no external side effects either way).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.

import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import { operationForOpportunity } from "../app/app/js/seo-model.js";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

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

async function writeExecution(client, existing, fields, message) {
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: toBusabaseFields(fields),
    message,
    author: "kelly-seo-execute-decisions",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

async function main() {
  const apply = process.argv.includes("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly SEO Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = resources.bases.find((base) => base.key === "opportunities");

  const opportunities = await readAll(client, declared);
  const approved = opportunities.filter((opportunity) => opportunity.status === "approved");

  if (!approved.length) {
    console.log("No approved opportunities to execute. Nothing written.");
    return;
  }

  for (const opportunity of approved) {
    const planned = operationForOpportunity(opportunity, { apply });
    console.log(
      `- Opportunity #${opportunity.ref} "${opportunity.title}" -> ${planned.operation} (${planned.status}) ${planned.target || "(no target)"}`,
    );
  }

  if (apply) {
    const now = new Date().toISOString();
    for (const opportunity of approved) {
      const planned = operationForOpportunity(opportunity, { apply });
      const { __recordId, __headCommitId, ...fields } = opportunity;
      await writeExecution(
        client,
        opportunity,
        {
          ...fields,
          execution_status: planned.status,
          execution_operation: planned.operation,
          execution_target: planned.target,
          execution_detail: planned.detail,
          executed_at: now,
        },
        `Plan execution for opportunity ${opportunity.opportunity_id}: ${planned.operation}`,
      );
    }
  }

  console.log(
    `${apply ? "APPLIED" : "DRY-RUN"}: ${approved.length} opportunity(ies).${apply ? " Marked ready_for_agent — the agent performs the real edit in the site repo/CMS, then marks the opportunity done." : " No changes applied. Re-run with --apply after reviewing the plan."}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
