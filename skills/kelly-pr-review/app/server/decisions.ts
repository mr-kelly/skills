import { findItem, loadBatch, saveBatch, writeDecisions } from "./batch-store.ts";
import { rejectIfLocked } from "./lock.ts";
import { utcNow } from "./utils.ts";

const LOCAL_ACTIONS = new Set(["approve", "comment", "request_changes", "no_action", "needs_review", "block"]);

function statusFor(action) {
  if (["approve", "comment", "request_changes", "no_action"].includes(action)) return "approved";
  if (action === "block") return "blocked";
  return "needs_review";
}

export async function updateItems(body) {
  await rejectIfLocked();
  const batch = await loadBatch();
  const ids = (body.ids || []).map(String);
  const action = body.action;
  const comment = body.comment || "";
  if (!ids.length) throw new Error("No items selected");
  if (!LOCAL_ACTIONS.has(action)) throw new Error(`Unsupported decision: ${action}`);
  const changed = [];
  for (const id of ids) {
    const item = findItem(batch, id);
    item.status = statusFor(action);
    item.decision = {
      action,
      comment,
      review_body: body.review_body ?? item.review_body ?? "",
      approved_for_execution: ["approve", "comment", "request_changes", "no_action"].includes(action),
      decided_at: utcNow(),
    };
    if (body.review_body !== undefined) item.review_body = body.review_body || "";
    item.updated_at = utcNow();
    changed.push(item.id);
  }
  await saveBatch(batch);
  const decisions = await writeDecisions(batch);
  return { changed, decisions: decisions.decisions.length };
}

export async function updateDetail(body) {
  await rejectIfLocked();
  const batch = await loadBatch();
  const item = findItem(batch, String(body.id));
  if (Object.hasOwn(body, "review_body")) item.review_body = body.review_body || "";
  if (Object.hasOwn(body, "comment")) {
    item.decision = {
      ...(item.decision || {}),
      comment: body.comment || "",
      decided_at: item.decision?.decided_at || utcNow(),
    };
  }
  item.updated_at = utcNow();
  await saveBatch(batch);
  const decisions = await writeDecisions(batch);
  return { id: item.id, decisions: decisions.decisions.length };
}
