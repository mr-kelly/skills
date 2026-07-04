import { AGENT_TASKS_PATH, DECISIONS_PATH } from "./paths.mjs";
import { readAgentTasks, readDecisions, readLock, writeJson } from "./store.mjs";

export const DECISION_KINDS = ["candidate", "proposal", "trend"];
export const CANDIDATE_ACTIONS = ["develop", "watch", "drop"];
export const PROPOSAL_ACTIONS = ["approve", "request_changes", "revise", "block"];
export const TREND_ACTIONS = ["promote"];

export function stageForCandidateAction(action) {
  if (action === "develop") return "develop";
  if (action === "watch") return "watch";
  if (action === "drop") return "dropped";
  return "reviewing";
}

export function statusForProposalAction(action) {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return "needs_review";
}

export async function saveDecision(body) {
  const lock = await readLock();
  if (lock) {
    return { ok: false, status: 423, error: `Locked by ${lock.owner || "agent"}: ${lock.message || "working"}` };
  }
  const kind = String(body.kind || "");
  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!DECISION_KINDS.includes(kind)) return { ok: false, status: 400, error: `Unknown decision kind: ${kind}` };
  if (!id) return { ok: false, status: 400, error: "Missing item id" };
  const allowed = kind === "candidate" ? CANDIDATE_ACTIONS : kind === "proposal" ? PROPOSAL_ACTIONS : TREND_ACTIONS;
  if (!allowed.includes(action)) return { ok: false, status: 400, error: `Unknown action for ${kind}: ${action}` };

  const now = new Date().toISOString();
  const decisions = await readDecisions();
  const decision = {
    kind,
    action,
    comment: typeof body.comment === "string" ? body.comment : "",
    decided_at: now
  };
  if (kind === "candidate") decision.stage = stageForCandidateAction(action);
  if (kind === "proposal") {
    decision.status = statusForProposalAction(action);
    if (typeof body.brief === "string") decision.brief = body.brief;
  }
  decisions.decisions[id] = decision;
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);

  if (kind === "proposal" && (action === "request_changes" || action === "block")) {
    await enqueueAgentTask({
      kind: action === "request_changes" ? "revise_proposal" : "unblock_proposal",
      ref_id: id,
      note: decision.comment,
      created_at: now
    });
  }
  if (kind === "candidate" && action === "develop") {
    await enqueueAgentTask({
      kind: "draft_development_proposal",
      ref_id: id,
      note: decision.comment,
      created_at: now
    });
  }
  if (kind === "trend" && action === "promote") {
    await enqueueAgentTask({
      kind: "promote_to_candidate",
      ref_id: id,
      note: decision.comment,
      created_at: now
    });
  }
  return { ok: true, decision: { id, ...decision } };
}

async function enqueueAgentTask(entry) {
  const tasks = await readAgentTasks();
  const task = {
    task_id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    status: "queued",
    ...entry
  };
  tasks.tasks.push(task);
  tasks.updated_at = entry.created_at;
  await writeJson(AGENT_TASKS_PATH, tasks);
  return task;
}

export function applyDecisions(snapshot, decisions) {
  const map = decisions?.decisions || {};
  const next = { ...snapshot };
  next.candidates = (snapshot.candidates || []).map((item) => {
    const decision = map[item.candidate_id];
    if (!decision) return item;
    const merged = { ...item, verdict: decision };
    if (decision.stage) merged.stage = decision.stage;
    return merged;
  });
  next.proposals = (snapshot.proposals || []).map((item) => {
    const decision = map[item.proposal_id];
    if (!decision) return item;
    const merged = { ...item, review: decision };
    if (decision.status) merged.status = decision.status;
    if (typeof decision.brief === "string" && decision.brief) merged.brief = decision.brief;
    return merged;
  });
  next.trend_items = (snapshot.trend_items || []).map((item) => {
    const decision = map[item.trend_id];
    if (!decision) return item;
    return { ...item, promotion: decision };
  });
  return next;
}
