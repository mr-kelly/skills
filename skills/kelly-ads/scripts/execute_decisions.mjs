#!/usr/bin/env node
// Dry-run-by-default execution stub. Reads approved adjustments from the
// snapshot and decisions file, writes concrete planned operations to
// app/.data/execution_report.json, and performs NO external side effects.
// Every operation is marked handoff_to_agent: the agent executes it outside
// the app via the platform APIs, then marks the card done in the snapshot.
import { EXECUTION_REPORT_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  acquireLock,
  ensureDirs,
  readDecisions,
  readSnapshot,
  releaseLock,
  writeJson
} from "../app/server/store.mjs";

const OWNER = "kelly-ads-execute";

function operationFor(adjustment) {
  const target = adjustment.target || {};
  switch (adjustment.type) {
    case "negative_keyword":
      return {
        operation: "add_negative_keyword",
        target: {
          platform: adjustment.platform,
          campaign_id: adjustment.campaign_id,
          term: target.text || target.id || "",
          match: "negative_exact"
        },
        note: `Add '${target.text || target.id || "the term"}' as a negative exact keyword on ${adjustment.campaign_id}.`
      };
    case "bid_down":
    case "bid_up":
      return {
        operation: "set_bid",
        target: {
          platform: adjustment.platform,
          campaign_id: adjustment.campaign_id,
          scope: target.text || target.id || "all enabled targets",
          current: adjustment.current_value || "",
          new: adjustment.proposed_value || ""
        },
        note: `Set bids on ${adjustment.campaign_id}: ${adjustment.current_value || "current"} → ${adjustment.proposed_value || "proposed"}.`
      };
    case "pause_target":
      return {
        operation: "pause_target",
        target: {
          platform: adjustment.platform,
          campaign_id: adjustment.campaign_id,
          target_id: target.id || "",
          text: target.text || ""
        },
        note: `Pause '${target.text || target.id || "the target"}' on ${adjustment.campaign_id} and confirm spend stops.`
      };
    case "budget_shift":
      return {
        operation: "shift_budget",
        target: {
          platform: adjustment.platform,
          from_campaign_id: target.id || "",
          to_campaign_id: adjustment.campaign_id,
          current: adjustment.current_value || "",
          new: adjustment.proposed_value || ""
        },
        note: `Shift daily budget: ${adjustment.current_value || "current"} → ${adjustment.proposed_value || "proposed"}.`
      };
    case "creative_refresh":
      return {
        operation: "refresh_creative",
        target: {
          platform: adjustment.platform,
          campaign_id: adjustment.campaign_id,
          creative_id: target.id || "",
          text: target.text || ""
        },
        note: `Replace creative '${target.text || target.id || ""}' on ${adjustment.campaign_id} with the approved new asset.`
      };
    default:
      return { operation: adjustment.type || "unknown", target, note: "Unrecognized adjustment type; execute manually." };
  }
}

async function main() {
  await ensureDirs();
  try {
    await acquireLock(OWNER, "Preparing execution report from approved adjustments");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  try {
    const [snapshot, decisions] = await Promise.all([readSnapshot(), readDecisions()]);
    const now = new Date().toISOString();
    const approved = (snapshot.adjustments || []).filter((adjustment) => {
      const decision = decisions.decisions?.[adjustment.adjustment_id] || adjustment.decision;
      return adjustment.status === "approved" && (!decision || decision.verdict !== "block");
    });
    const entries = approved.map((adjustment) => {
      const planned = operationFor(adjustment);
      return {
        adjustment_id: adjustment.adjustment_id,
        ref: adjustment.ref,
        title: adjustment.title,
        operation: planned.operation,
        target: planned.target,
        status: "planned",
        dry_run: true,
        handoff_to_agent: true,
        note: planned.note,
        planned_at: now
      };
    });
    await writeJson(EXECUTION_REPORT_PATH, {
      generated_at: now,
      source: "kelly-ads",
      dry_run: true,
      entries
    });
    if (!entries.length) {
      console.log("No approved adjustments to plan. Approve adjustment cards in the app first.");
    } else {
      for (const entry of entries) {
        console.log(`- Adjustment #${entry.ref} ${entry.operation} → ${JSON.stringify(entry.target)}`);
      }
      console.log(`Planned ${entries.length} operation(s), dry-run only. The agent executes them via platform APIs outside the app after review.`);
    }
    console.log(`Wrote ${EXECUTION_REPORT_PATH}`);
    console.log(`Snapshot source: ${SNAPSHOT_PATH}`);
  } finally {
    await releaseLock();
  }
}

await main();
