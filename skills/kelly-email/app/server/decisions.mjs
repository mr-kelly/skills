import { findItem, loadBatch, saveBatch, writeDecisions } from "./batch-store.mjs";
import { rejectIfLocked } from "./lock.mjs";
import { utcNow } from "./utils.mjs";

const LOCAL_ACTIONS = new Set([
  "approve_proposed",
  "approve_archive",
  "approve_mark_read",
  "approve_send",
  "draft_reply",
  "needs_review",
  "no_action",
  "revise",
]);

function approvedActionFor(action, item) {
  if (action === "approve_proposed") {
    const proposed = item.proposed_action || "review";
    return proposed === "review" ? "needs_review" : proposed;
  }
  if (action === "approve_archive") return "archive";
  if (action === "approve_mark_read") return "mark_read";
  if (action === "approve_send") return "send_reply";
  if (action === "draft_reply") return "draft_reply";
  if (action === "needs_review") return "needs_review";
  if (action === "no_action") return "no_action";
  return "revise";
}

function updateItemStatus(item, approvedAction) {
  if (approvedAction === "draft_reply") item.status = "draft_requested";
  else if (["review", "needs_review", "revise"].includes(approvedAction)) item.status = "needs_review";
  else if (approvedAction === "send_reply") item.status = "drafted";
  else if (approvedAction === "no_action") item.status = item.status || "prepared";
  else if (!["prepared", "drafted"].includes(item.status)) item.status = "prepared";
}

export async function updateItems(body) {
  await rejectIfLocked();
  const batch = await loadBatch();
  const ids = (body.ids || []).map(String);
  const action = body.action;
  const comment = body.comment || "";
  if (!ids.length) throw new Error("No items selected");
  if (!LOCAL_ACTIONS.has(action)) throw new Error(`Unsupported local decision: ${action}`);
  const changed = [];
  for (const itemId of ids) {
    const item = findItem(batch, itemId);
    const approvedAction = approvedActionFor(action, item);
    item.decision = {
      action: approvedAction,
      decided_at: utcNow(),
    };
    updateItemStatus(item, approvedAction);
    if (comment) {
      item.user_comment = comment;
      item.decision.comment = comment;
    }
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
  if (Object.hasOwn(body, "draft")) item.draft = body.draft || "";
  if (Object.hasOwn(body, "suggested_reply")) item.suggested_reply = body.suggested_reply || "";
  if (Object.hasOwn(body, "comment")) item.user_comment = body.comment || "";
  item.updated_at = utcNow();
  await saveBatch(batch);
  const decisions = await writeDecisions(batch);
  return { id: item.id, decisions: decisions.decisions.length };
}
