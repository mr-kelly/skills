#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CURRENT_BATCH_PATH, DECISIONS_PATH, EXECUTION_REPORT_PATH } from "../lib/paths.mjs";
import { pathExists, readJson, utcNow, withLock, writeJson } from "../lib/common.mjs";

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
  const tempPath = path.join(os.tmpdir(), `kelly-pr-review-${decision.repo.replaceAll("/", "-")}-${decision.number}-${Date.now()}.txt`);
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
  if (!(await pathExists(DECISIONS_PATH))) {
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
    await writeJson(EXECUTION_REPORT_PATH, report);
    console.log(`No approved decisions yet. Review PRs in the UI first.`);
    console.log(`Report: ${EXECUTION_REPORT_PATH}`);
    return;
  }
  const decisionsPayload = await readJson(DECISIONS_PATH);
  const batch = await readJson(CURRENT_BATCH_PATH, { items: [] });
  const approved = (decisionsPayload.decisions || []).filter((decision) => {
    const action = decision.decision?.action;
    return REVIEW_ACTIONS.has(action) && decision.decision?.approved_for_execution;
  });
  const results = [];
  for (const decision of approved) {
    const result = await submitReview(decision);
    results.push({
      id: decision.id,
      repo: decision.repo,
      number: decision.number,
      action: decision.decision.action,
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
  const report = {
    generated_at: utcNow(),
    live: LIVE,
    batch_id: decisionsPayload.batch_id,
    executed_count: results.filter((result) => result.status === "executed").length,
    dry_run_count: results.filter((result) => result.status === "dry_run").length,
    skipped_count: results.filter((result) => result.status === "skipped").length,
    results,
  };
  await writeJson(EXECUTION_REPORT_PATH, report);
  await writeJson(CURRENT_BATCH_PATH, batch);
  console.log(`${LIVE ? "Live execution" : "Dry run"} complete: ${results.length} approved decision(s).`);
  console.log(`Report: ${EXECUTION_REPORT_PATH}`);
}

await withLock(LIVE ? "Executing approved GitHub reviews" : "Dry-running approved GitHub reviews", main);
