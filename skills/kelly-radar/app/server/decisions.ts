import { AGENT_TASKS_PATH, DECISIONS_PATH } from "./paths.ts";
import { readAgentTasks, readDecisions, readLock, writeJson } from "./store.ts";
import type {
  AgentTask,
  AgentTaskEntry,
  Brief,
  Decision,
  DecisionBody,
  DecisionsFile,
  RadarSnapshot,
  Report,
  ResearchQuestion,
} from "./types.ts";

export const DECISION_KINDS = ["signal", "brief", "opportunity", "report"];
export const DECISION_ACTIONS = ["approve", "watch", "ignore", "block", "request_changes"];

export interface DecisionResult {
  ok: boolean;
  status?: number;
  error?: string;
  decision?: Decision & { id: string };
  task?: AgentTask;
}

export function statusForAction(action: string): string {
  if (action === "approve") return "approved";
  if (action === "watch") return "needs_review";
  if (action === "ignore") return "done";
  if (action === "block") return "blocked";
  if (action === "request_changes") return "changes_requested";
  return "needs_review";
}

export async function saveDecision(body: DecisionBody): Promise<DecisionResult> {
  const lock = await readLock();
  if (lock) {
    return { ok: false, status: 423, error: `Locked by ${lock.owner || "agent"}: ${lock.message || "working"}` };
  }
  const kind = String(body.kind || "");
  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!DECISION_KINDS.includes(kind)) return { ok: false, status: 400, error: `Unknown decision kind: ${kind}` };
  if (!id) return { ok: false, status: 400, error: "Missing item id" };
  if (!DECISION_ACTIONS.includes(action)) return { ok: false, status: 400, error: `Unknown action: ${action}` };

  const now = new Date().toISOString();
  const decisions = await readDecisions();
  const decision: Decision = {
    kind,
    action,
    status: statusForAction(action),
    comment: typeof body.comment === "string" ? body.comment : "",
    decided_at: now,
  };
  if (kind === "report" && body.confidence !== undefined) {
    const confidence = Number(body.confidence);
    if (Number.isFinite(confidence)) decision.confidence = Math.min(5, Math.max(0, confidence));
  }
  decisions.decisions[id] = decision;
  decisions.updated_at = now;
  await writeJson(DECISIONS_PATH, decisions);

  if (action === "request_changes" || action === "block") {
    await enqueueAgentTask({
      kind: kind === "brief" ? "revise_brief" : kind === "signal" ? "collect_more_evidence" : `revise_${kind}`,
      ref_id: id,
      note: decision.comment,
      created_at: now,
    });
  }
  return { ok: true, decision: { id, ...decision } };
}

export async function saveFollowup(body: DecisionBody): Promise<DecisionResult> {
  const lock = await readLock();
  if (lock) {
    return { ok: false, status: 423, error: `Locked by ${lock.owner || "agent"}: ${lock.message || "working"}` };
  }
  const questionId = String(body.question_id || "");
  const question = String(body.question || "").trim();
  if (!questionId || !question) return { ok: false, status: 400, error: "Missing question_id or question" };
  const now = new Date().toISOString();
  const task = await enqueueAgentTask({
    kind: "research_followup",
    ref_id: questionId,
    note: question,
    created_at: now,
  });
  return { ok: true, task };
}

async function enqueueAgentTask(entry: AgentTaskEntry): Promise<AgentTask> {
  const tasks = await readAgentTasks();
  const task: AgentTask = {
    task_id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    status: "queued",
    ...entry,
  };
  tasks.tasks.push(task);
  tasks.updated_at = entry.created_at;
  await writeJson(AGENT_TASKS_PATH, tasks);
  return task;
}

export function applyDecisions(snapshot: RadarSnapshot, decisions: DecisionsFile | null): RadarSnapshot {
  const map: Record<string, Decision> = decisions?.decisions || {};
  const decorate = <T extends Record<string, any>>(item: T, idKey: string): T => {
    const decision = map[item[idKey]];
    if (!decision) return item;
    const merged: any = { ...item, triage: decision };
    if (decision.status) merged.status = decision.status;
    return merged;
  };
  const next: RadarSnapshot = { ...snapshot };
  next.signals = (snapshot.signals || []).map((item) => decorate(item, "signal_id"));
  const research = snapshot.research;
  const briefs: Brief[] = (research.briefs || []).map((item) => decorate(item, "brief_id"));
  const reports: Report[] = (research.reports || []).map((item) => {
    const decision = map[item.report_id];
    if (!decision) return item;
    const merged: Report = { ...item, triage: decision };
    if (decision.confidence !== undefined) merged.confidence = decision.confidence;
    return merged;
  });
  const briefById = new Map(briefs.map((brief) => [brief.brief_id, brief]));
  const questions: ResearchQuestion[] = (research.questions || []).map((question) => {
    const brief = briefById.get(question.brief_id);
    if (!brief || question.status !== "brief_needs_review") return question;
    if (brief.status === "approved") return { ...question, status: "researching" };
    if (brief.status === "blocked") return { ...question, status: "closed" };
    return question;
  });
  next.research = { ...research, questions, briefs, reports };
  const trends = snapshot.trends;
  next.trends = {
    ...trends,
    movers: trends.movers || [],
    opportunities: (trends.opportunities || []).map((item) => decorate(item, "opportunity_id")),
  };
  return next;
}
