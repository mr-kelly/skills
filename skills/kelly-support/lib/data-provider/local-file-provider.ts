// Local-file SupportProvider: the zero-dependency default.
//
// State lives in app/.data/*.json. This is the offline reference implementation
// of the same review model Busabase serves remotely — KELLY_SUPPORT_DATA_PROVIDER
// =local|busabase is a config flip, not a rewrite of the UI or scripts.

import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type {
  AgentTasksFile,
  DecisionsFile,
  ExecutionReport,
  Lock,
  Onboarding,
  ProviderMeta,
  SupportSnapshot,
  Ticket,
} from "../types.ts";
import type {
  DecideApprovalInput,
  QueueReplyInput,
  SetSlaInput,
  SupportProvider,
  UpdateTicketInput,
} from "./provider-interface.ts";
import {
  CATEGORIES,
  PRIORITIES,
  PROPOSED_ACTIONS,
  emptyDecisions,
  emptySnapshot,
  refreshTicketDerived,
  runQualityGate,
  summarizeConfig,
} from "./store-core.ts";

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function createLocalFileProvider(meta: ProviderMeta): SupportProvider {
  const { configResult } = meta;
  const risk = configResult.config.risk_policy || {};

  async function readSnapshot(): Promise<SupportSnapshot> {
    return (await readJson<SupportSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as SupportSnapshot;
  }

  async function readDecisions(): Promise<DecisionsFile> {
    return (await readJson<DecisionsFile>(DECISIONS_PATH, emptyDecisions())) as DecisionsFile;
  }

  async function readOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async function readLock(): Promise<Lock | null> {
    return readJson<Lock>(LOCK_PATH, null);
  }

  async function readAgentTasks(): Promise<AgentTasksFile> {
    return (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, {
      schema_version: "1",
      updated_at: "",
      tasks: [],
    })) as AgentTasksFile;
  }

  async function readExecutionReport(): Promise<ExecutionReport | null> {
    return readJson<ExecutionReport>(EXECUTION_REPORT_PATH, null);
  }

  function ticketOrThrow(snapshot: SupportSnapshot, ticket_id: string): Ticket {
    const ticket = (snapshot.tickets || []).find((item) => item.ticket_id === ticket_id);
    if (!ticket) throw new Error(`Unknown ticket: ${ticket_id}`);
    return ticket;
  }

  async function appendAgentTask(ticket: Ticket, comment: string): Promise<void> {
    const tasks = await readAgentTasks();
    const now = new Date().toISOString();
    tasks.tasks.push({
      task_id: `task-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${ticket.ref}`,
      type: "revise_reply",
      ticket_id: ticket.ticket_id,
      ref: ticket.ref,
      comment: String(comment || ""),
      status: "open",
      requested_at: now,
    });
    tasks.updated_at = now;
    await writeJson(AGENT_TASKS_PATH, tasks);
  }

  function configSummary(): Record<string, unknown> {
    return { provider: "local", ...summarizeConfig(configResult) };
  }

  return {
    kind: "local",

    readSnapshot,
    readLock,
    configSummary,

    async writeSnapshot(snapshot: SupportSnapshot): Promise<void> {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },

    async getState() {
      const [snapshot, decisions, onboarding, lock, agentTasks, executionReport] = await Promise.all([
        readSnapshot(),
        readDecisions(),
        readOnboarding(),
        readLock(),
        readAgentTasks(),
        readExecutionReport(),
      ]);
      return {
        data_provider: "local",
        onboarding,
        lock,
        config_summary: configSummary(),
        snapshot,
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
      };
    },

    async queueReply({
      ticket_id,
      text,
      note = "",
      kb_refs,
      suggested_by = "human",
    }: QueueReplyInput): Promise<Ticket> {
      if (typeof text !== "string" || !text.trim()) throw new Error("Reply text must not be empty");
      const snapshot = await readSnapshot();
      const ticket = ticketOrThrow(snapshot, ticket_id);
      const now = new Date().toISOString();
      ticket.suggested_reply = text.trim();
      if (Array.isArray(kb_refs)) ticket.kb_refs = kb_refs;
      if (note) ticket.reason = String(note);
      if (suggested_by) ticket.owner = ticket.owner || "Kelly";
      // A freshly composed/edited reply always returns the ticket to review.
      if (ticket.status !== "done") ticket.status = "needs_review";
      ticket.decision = null;
      ticket.quality_gate = runQualityGate(ticket, snapshot.knowledge_base, risk);
      ticket.updated_at = now;
      await writeJson(SNAPSHOT_PATH, snapshot);
      return ticket;
    },

    async decideApproval({ ticket_id, action, comment = "", text }: DecideApprovalInput): Promise<Ticket> {
      const snapshot = await readSnapshot();
      const ticket = ticketOrThrow(snapshot, ticket_id);
      const now = new Date().toISOString();
      if (typeof text === "string" && text.trim()) {
        ticket.suggested_reply = text.trim();
        ticket.quality_gate = runQualityGate(ticket, snapshot.knowledge_base, risk);
      }
      if (action === "approve") {
        // Safety: never let an approve stick on a gate BLOCK. The human must fix
        // the reply (drop the unapproved commitment) or explicitly block instead.
        if (ticket.quality_gate?.verdict === "block") {
          const error = new Error(
            "support-qa gate is BLOCK: this reply promises a refund/commitment without approval or is ungrounded. Fix the reply before approving.",
          ) as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }
        ticket.status = "approved";
      } else if (action === "request_changes") ticket.status = "changes_requested";
      else if (action === "block") ticket.status = "blocked";
      else if (action !== "revise") throw new Error(`Unknown action: ${action}`);
      ticket.decision = { action, comment: String(comment || ""), decided_at: now };
      ticket.updated_at = now;
      await writeJson(SNAPSHOT_PATH, snapshot);
      const decisions = await readDecisions();
      decisions.decisions[ticket_id] = {
        action,
        comment: String(comment || ""),
        text: ticket.suggested_reply,
        status: ticket.status,
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);
      if (action === "request_changes") await appendAgentTask(ticket, comment);
      return ticket;
    },

    async setSla({ ticket_id, due_by }: SetSlaInput): Promise<Ticket> {
      const snapshot = await readSnapshot();
      const ticket = ticketOrThrow(snapshot, ticket_id);
      if (due_by && Number.isNaN(new Date(due_by).getTime())) {
        throw new Error("due_by must be a valid ISO timestamp or empty");
      }
      ticket.sla = ticket.sla || { policy: "custom", due_by: "", breached: false };
      ticket.sla.due_by = due_by || "";
      refreshTicketDerived(ticket, snapshot.generated_at);
      ticket.updated_at = new Date().toISOString();
      await writeJson(SNAPSHOT_PATH, snapshot);
      return ticket;
    },

    async updateTicket({ ticket_id, priority, proposed_action, category }: UpdateTicketInput): Promise<Ticket> {
      const snapshot = await readSnapshot();
      const ticket = ticketOrThrow(snapshot, ticket_id);
      if (priority && PRIORITIES.includes(priority)) ticket.priority = priority;
      if (proposed_action && PROPOSED_ACTIONS.includes(proposed_action)) ticket.proposed_action = proposed_action;
      if (category && CATEGORIES.includes(category)) ticket.category = category;
      ticket.quality_gate = runQualityGate(ticket, snapshot.knowledge_base, risk);
      ticket.updated_at = new Date().toISOString();
      await writeJson(SNAPSHOT_PATH, snapshot);
      return ticket;
    },
  };
}
