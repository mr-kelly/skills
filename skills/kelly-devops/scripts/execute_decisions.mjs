#!/usr/bin/env node
// Dry-run-by-default execution stub. Reads approved actions from the snapshot
// and decisions file, writes concrete planned operations to
// app/.data/execution_report.json, and performs NO external side effects.
// The agent executes the planned operations outside the app after review.
import { EXECUTION_REPORT_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { acquireLock, ensureDirs, readDecisions, readSnapshot, releaseLock, writeJson } from "../app/server/store.mjs";

const OWNER = "kelly-devops-execute";

function operationFor(action) {
  const target = action.target || {};
  switch (action.type) {
    case "renew_domain":
      return {
        operation: "renew_domain",
        target: { domain: target.id || "", registrar: target.registrar || "" },
        note: `Renew ${target.id || "the domain"} at ${target.registrar || "the registrar"}; re-enable auto-renew.`,
      };
    case "rotate_key":
      return {
        operation: "rotate_key",
        target: { env_var: target.id || "", provider: target.provider || "" },
        note: `Create a replacement key at ${target.provider || "the provider"}, update env var ${target.id || ""}, verify, then revoke the old key.`,
      };
    case "investigate_spend":
      return {
        operation: "investigate_spend",
        target: { provider: target.provider || target.id || "" },
        note: `Pull a per-service cost breakdown for ${target.provider || target.id || "the provider"} and report findings.`,
      };
    case "restart_service":
      return {
        operation: "restart_service",
        target: { service_id: target.id || "", host: target.host || "" },
        note: `Restart ${target.id || "the service"}${target.host ? ` on ${target.host}` : ""} and confirm health returns to up.`,
      };
    case "ack_incident":
      return {
        operation: "ack_incident",
        target: { event_id: target.id || "", service_id: target.service_id || "" },
        note: "Record the acknowledgement in the events feed; no remote change.",
      };
    default:
      return { operation: action.type || "unknown", target, note: "Unrecognized action type; execute manually." };
  }
}

async function main() {
  await ensureDirs();
  try {
    await acquireLock(OWNER, "Preparing execution report from approved actions");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  try {
    const [snapshot, decisions] = await Promise.all([readSnapshot(), readDecisions()]);
    const now = new Date().toISOString();
    const approved = (snapshot.actions || []).filter((action) => {
      const decision = decisions.decisions?.[action.action_id] || action.decision;
      return action.status === "approved" && (!decision || decision.verdict !== "block");
    });
    const entries = approved.map((action) => {
      const planned = operationFor(action);
      return {
        action_id: action.action_id,
        ref: action.ref,
        title: action.title,
        operation: planned.operation,
        target: planned.target,
        status: "planned",
        dry_run: true,
        note: planned.note,
        planned_at: now,
      };
    });
    await writeJson(EXECUTION_REPORT_PATH, {
      generated_at: now,
      source: "kelly-devops",
      dry_run: true,
      entries,
    });
    if (!entries.length) {
      console.log("No approved actions to plan. Approve action cards in the app first.");
    } else {
      for (const entry of entries) {
        console.log(`- Action #${entry.ref} ${entry.operation} → ${JSON.stringify(entry.target)}`);
      }
      console.log(
        `Planned ${entries.length} operation(s), dry-run only. The agent executes them outside the app after review.`,
      );
    }
    console.log(`Wrote ${EXECUTION_REPORT_PATH}`);
    console.log(`Snapshot source: ${SNAPSHOT_PATH}`);
  } finally {
    await releaseLock();
  }
}

await main();
