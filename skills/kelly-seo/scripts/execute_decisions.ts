#!/usr/bin/env node
// Dry-run-by-default execution stub for approved SEO opportunities.
// Re-checks the agent lock and decisions, then writes execution_report.json
// entries with concrete operations. It performs NO external side effects:
// the agent applies approved changes in the site's repo/CMS outside the app.
// Usage: node scripts/execute_decisions.mjs [--apply]

import { ensureDirs, mergeOpportunities } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();

const OPERATION_BY_TYPE = {
  title_meta_rewrite: "rewrite_title",
  internal_links: "add_internal_links",
  content_brief: "create_content_brief",
  fix_page_issue: "fix_page_issue",
};

const apply = process.argv.includes("--apply");
const dryRun = !apply;

function fail(message) {
  console.error(`kelly-seo execute: ${message}`);
  process.exit(1);
}

await ensureDirs();

const existingLock = await provider.getLock();
if (existingLock) {
  fail(
    `agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`,
  );
}

const [snapshot, decisions, previousReport] = await Promise.all([
  provider.getSnapshot(),
  provider.getDecisions(),
  provider.getExecutionReport(),
]);
const merged = mergeOpportunities(snapshot, decisions, previousReport);
const approved = merged.opportunities.filter((opportunity) => opportunity.status === "approved");

if (!approved.length) {
  console.log("No approved opportunities to execute. Nothing written.");
  process.exit(0);
}

await provider.acquireLock(
  dryRun ? "Dry-run: planning approved opportunities" : "Preparing approved opportunities for the agent",
);

try {
  const results = approved.map((opportunity) => {
    const decision = decisions.decisions?.[opportunity.id];
    const operation = OPERATION_BY_TYPE[opportunity.type] || "fix_page_issue";
    const target = opportunity.target_page || opportunity.target_query || "";
    if (!target) {
      return {
        id: opportunity.id,
        ref: opportunity.ref,
        title: opportunity.title,
        operation,
        target_page: opportunity.target_page || "",
        target_query: opportunity.target_query || "",
        site_id: opportunity.site_id,
        status: "blocked",
        detail: "No target page or query configured; ask the user before executing.",
      };
    }
    return {
      id: opportunity.id,
      ref: opportunity.ref,
      title: opportunity.title,
      operation,
      target_page: opportunity.target_page || "",
      target_query: opportunity.target_query || "",
      site_id: opportunity.site_id,
      status: dryRun ? "planned" : "ready_for_agent",
      detail: dryRun
        ? `Dry run: would ${operation.replaceAll("_", " ")} for ${target} using the ${decision?.draft ? "user-edited" : "agent"} draft.`
        : `Approved: agent should ${operation.replaceAll("_", " ")} for ${target} in the site repo/CMS, then record the real result here.`,
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    source: "kelly-seo",
    results,
  };
  await provider.writeExecutionReport(report);
  console.log(`${dryRun ? "Dry run" : "Execution plan"} wrote the execution report`);
  for (const result of results) {
    console.log(
      `  Opportunity #${result.ref} -> ${result.operation} (${result.status}) ${result.target_page || result.target_query}`,
    );
  }
  if (dryRun) console.log("Re-run with --apply to mark items ready_for_agent. No external side effects either way.");
} finally {
  await provider.releaseLock();
}
