#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { utcNow, withLock } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import { EXECUTION_REPORT_PATH } from "../lib/paths.ts";

const provider = await createProvider();
const execFile = promisify(execFileCallback);
const LIVE = process.argv.includes("--live") && !process.argv.includes("--dry-run");
const REVIEW_ACTIONS = new Set(["approve", "comment", "request_changes", "no_action"]);

async function gh(args) {
  const { stdout, stderr } = await execFile("gh", args, { maxBuffer: 1024 * 1024 * 5 });
  return { stdout, stderr };
}

function reviewFlag(action) {
  if (action === "approve") return "--approve";
  if (action === "request_changes") return "--request-changes";
  return "--comment";
}

async function submitReview(decision) {
  const action = decision.decision?.action;
  const body = decision.decision?.review_body || decision.review_body || decision.decision?.comment || "";
  if (action === "no_action") return { status: "skipped", reason: "No action selected." };
  const tempPath = path.join(
    os.tmpdir(),
    `kelly-pr-review-${decision.repo.replaceAll("/", "-")}-${decision.number}-${Date.now()}.txt`,
  );
  await fs.writeFile(tempPath, body || "Reviewed from Kelly PR Review.", "utf8");
  try {
    const args = [
      "pr",
      "review",
      String(decision.number),
      "--repo",
      decision.repo,
      reviewFlag(action),
      "--body-file",
      tempPath,
    ];
    if (!LIVE) return { status: "dry_run", command: `gh ${args.join(" ")}` };
    await gh(args);
    return { status: "executed", command: `gh ${args.join(" ")}` };
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

async function main() {
  const decisionsPayload = await provider.readDecisions(null);
  if (!decisionsPayload) {
    const report = {
      generated_at: utcNow(),
      live: LIVE,
      batch_id: "",
      executed_count: 0,
      dry_run_count: 0,
      skipped_count: 0,
      results: [],
      note: "No decisions file found. Review PRs in the UI first.",
    };
    await provider.writeExecutionReport(report);
    console.log("No approved decisions yet. Review PRs in the UI first.");
    console.log(`Report: ${EXECUTION_REPORT_PATH}`);
    return;
  }
  const batch = await provider.loadBatch();
  const isAlreadyExecuted = (item) => item && (item.status === "done" || item.execution?.status === "executed");
  const approved = (decisionsPayload.decisions || []).filter((decision) => {
    const action = decision.decision?.action;
    if (!REVIEW_ACTIONS.has(action) || !decision.decision?.approved_for_execution) return false;
    // An item that already ran to completion is terminal; a lingering
    // decisions.json entry (approved_for_execution never gets cleared) must
    // not re-trigger a duplicate GitHub review on the next --live run.
    const item = (batch.items || []).find((candidate) => candidate.id === decision.id);
    return !isAlreadyExecuted(item);
  });
  const results = [];
  for (const decision of approved) {
    // Re-read decisions.json immediately before executing so a concurrent
    // revocation/edit in the UI (or a prior iteration of this same loop) is
    // respected instead of acting on a stale in-memory snapshot.
    const freshDecisions = await provider.readDecisions(null);
    const freshDecision = (freshDecisions?.decisions || []).find((candidate) => candidate.id === decision.id);
    if (!freshDecision || !freshDecision.decision?.approved_for_execution) {
      results.push({
        id: decision.id,
        repo: decision.repo,
        number: decision.number,
        action: decision.decision.action,
        live: LIVE,
        status: "skipped",
        reason: "Approval was revoked before execution.",
        executed_at: utcNow(),
      });
      continue;
    }
    const result = await submitReview(freshDecision);
    results.push({
      id: decision.id,
      repo: decision.repo,
      number: decision.number,
      action: freshDecision.decision.action,
      live: LIVE,
      ...result,
      executed_at: utcNow(),
    });
    const item = (batch.items || []).find((candidate) => candidate.id === decision.id);
    if (item) {
      item.execution = results.at(-1);
      if (LIVE && result.status === "executed") item.status = "done";
    }
  }
  // Merge this run's results into the existing report by id instead of
  // overwriting the whole file, so previously executed items (now filtered
  // out of `approved` above) still show up in the report history.
  const previousReport = await provider.readExecutionReport({ results: [] });
  const previousResults: any[] = Array.isArray(previousReport?.results) ? previousReport.results : [];
  const mergedResultsById = new Map(previousResults.map((result) => [String(result.id), result]));
  for (const result of results) mergedResultsById.set(String(result.id), result);
  const mergedResults = Array.from(mergedResultsById.values());
  const report = {
    generated_at: utcNow(),
    live: LIVE,
    batch_id: decisionsPayload.batch_id,
    executed_count: mergedResults.filter((result) => result.status === "executed").length,
    dry_run_count: mergedResults.filter((result) => result.status === "dry_run").length,
    skipped_count: mergedResults.filter((result) => result.status === "skipped").length,
    results: mergedResults,
  };
  await provider.writeExecutionReport(report);
  await provider.saveBatch(batch);
  console.log(`${LIVE ? "Live execution" : "Dry run"} complete: ${results.length} approved decision(s).`);
  console.log(`Report: ${EXECUTION_REPORT_PATH}`);
}

await withLock(LIVE ? "Executing approved GitHub reviews" : "Dry-running approved GitHub reviews", main);
