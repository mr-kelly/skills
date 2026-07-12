#!/usr/bin/env node
import { createProvider } from "../lib/data-provider/index.ts";

const apply = process.argv.includes("--apply");
const provider = await createProvider();
const [snapshot, decisionsFile] = await Promise.all([provider.readSnapshot(), provider.readDecisions()]);
const now = new Date().toISOString();

const results = Object.entries(decisionsFile.decisions || {}).map(([reviewId, decision]) => {
  const item = snapshot.review_items.find((entry) => entry.review_id === reviewId);
  const operation =
    decision.action === "approve"
      ? item?.target_type === "deck"
        ? "approve_deck_for_pptx_generation"
        : "approve_slide_card"
      : decision.action === "request_changes"
        ? "queue_agent_revision"
        : decision.action === "block"
          ? "block_generation"
          : "save_human_revision";
  return {
    review_id: reviewId,
    target_type: item?.target_type || "unknown",
    target_id: item?.target_id || "",
    ref: item?.ref,
    status: apply ? "recorded" : "dry_run",
    operation,
    target: item?.target_id || "",
    detail: item?.summary || "",
    draft: decision.draft,
    comment: decision.comment,
    executed_at: now,
  };
});

const report = { executed_at: now, dry_run: !apply, source: "kelly-ppt-factory", results };
if (apply) await provider.writeExecutionReport(report);
console.log(JSON.stringify(report, null, 2));
