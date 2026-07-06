// Local-file InquiryProvider: the zero-dependency default.
//
// State lives in app/.data/*.json exactly where app/server/store.ts used to
// write it, so the /api/state payload is byte-identical to the pre-refactor
// server. This is the offline reference implementation of the same review model
// Busabase serves remotely — KELLY_INQUIRY_DATA_PROVIDER=local|busabase is a
// config flip, not a rewrite of the UI or scripts.

import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type {
  AgentTasksFile,
  Approval,
  DecisionsFile,
  ExecutionReport,
  Inquiry,
  InquirySnapshot,
  Lock,
  Onboarding,
  Product,
  ProviderMeta,
  Quote,
} from "../types.ts";
import type {
  DecideApprovalInput,
  InquiryProvider,
  QueueReplyInput,
  SetFollowUpInput,
  UpdateQuoteInput,
} from "./provider-interface.ts";
import {
  STAGES,
  applyMinPriceGuard,
  emptyDecisions,
  emptySnapshot,
  recomputeQuoteTotals,
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

function nextRef(snapshot: InquirySnapshot): number {
  return (snapshot.approvals || []).reduce((max, item) => Math.max(max, item.ref || 0), 0) + 1;
}

export function createLocalFileProvider(meta: ProviderMeta): InquiryProvider {
  const { configResult } = meta;

  async function readSnapshot(): Promise<InquirySnapshot> {
    return (await readJson<InquirySnapshot>(SNAPSHOT_PATH, emptySnapshot())) as InquirySnapshot;
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

  async function appendAgentTask(item: Approval, comment: string): Promise<void> {
    const tasks = await readAgentTasks();
    const now = new Date().toISOString();
    tasks.tasks.push({
      task_id: `task-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${item.ref}`,
      type: item.kind === "quote" ? "revise_quote" : "revise_reply",
      item_id: item.item_id,
      ref: item.ref,
      inquiry_id: item.inquiry_id,
      quote_id: item.quote_id || "",
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

    async writeSnapshot(snapshot: InquirySnapshot): Promise<void> {
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

    async queueReply({ inquiry_id, text, note = "", suggested_by = "human" }: QueueReplyInput): Promise<Approval> {
      const snapshot = await readSnapshot();
      const inquiry = (snapshot.inquiries || []).find((item) => item.inquiry_id === inquiry_id);
      if (!inquiry) throw new Error(`Unknown inquiry: ${inquiry_id}`);
      if (typeof text !== "string" || !text.trim()) throw new Error("Reply text must not be empty");
      const now = new Date().toISOString();
      const ref = nextRef(snapshot);
      const item: Approval = {
        item_id: `reply-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${ref}`,
        ref,
        kind: "reply",
        inquiry_id,
        quote_id: "",
        account_id: inquiry.account_id,
        channel: inquiry.channel,
        customer: [inquiry.customer?.name, inquiry.customer?.company].filter(Boolean).join(" · "),
        text: text.trim(),
        note: String(note || ""),
        reason: "Queued from the inquiry composer.",
        suggested_by,
        status: "needs_review",
        decision: null,
        execution: null,
        created_at: now,
        updated_at: now,
      };
      snapshot.approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals : [];
      snapshot.approvals.push(item);
      await writeJson(SNAPSHOT_PATH, snapshot);
      return item;
    },

    async decideApproval({ item_id, action, comment = "", text }: DecideApprovalInput): Promise<Approval> {
      const snapshot = await readSnapshot();
      const item = (snapshot.approvals || []).find((entry) => entry.item_id === item_id);
      if (!item) throw new Error(`Unknown approval item: ${item_id}`);
      const now = new Date().toISOString();
      if (typeof text === "string" && text.trim()) item.text = text.trim();
      if (action === "approve") item.status = "approved";
      else if (action === "request_changes") item.status = "changes_requested";
      else if (action === "block") item.status = "blocked";
      else if (action !== "revise") throw new Error(`Unknown action: ${action}`);
      item.decision = { action, comment: String(comment || ""), decided_at: now };
      item.updated_at = now;
      await writeJson(SNAPSHOT_PATH, snapshot);
      const decisions = await readDecisions();
      decisions.decisions[item_id] = {
        action,
        comment: String(comment || ""),
        text: item.text,
        status: item.status,
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);
      if (action === "request_changes") await appendAgentTask(item, comment);
      return item;
    },

    async setFollowUp({ inquiry_id, next_follow_up }: SetFollowUpInput): Promise<Inquiry> {
      const snapshot = await readSnapshot();
      const inquiry = (snapshot.inquiries || []).find((item) => item.inquiry_id === inquiry_id);
      if (!inquiry) throw new Error(`Unknown inquiry: ${inquiry_id}`);
      if (next_follow_up && !/^\d{4}-\d{2}-\d{2}$/.test(next_follow_up)) {
        throw new Error("next_follow_up must be YYYY-MM-DD or empty");
      }
      inquiry.next_follow_up = next_follow_up || "";
      await writeJson(SNAPSHOT_PATH, snapshot);
      return inquiry;
    },

    async updateQuote({ quote_id, items, valid_until, terms, pricing_notes }: UpdateQuoteInput): Promise<Quote> {
      const snapshot = await readSnapshot();
      const quote = (snapshot.quotes || []).find((entry) => entry.quote_id === quote_id);
      if (!quote) throw new Error(`Unknown quote: ${quote_id}`);
      if (Array.isArray(items)) {
        for (const patch of items) {
          const line = (quote.items || []).find((entry) => entry.line_id === patch.line_id);
          if (!line) continue;
          if (patch.qty !== undefined) line.qty = Number(patch.qty) || 0;
          if (patch.unit_price !== undefined) line.unit_price = Number(patch.unit_price) || 0;
        }
      }
      if (typeof valid_until === "string" && valid_until) quote.valid_until = valid_until;
      if (typeof terms === "string") quote.terms = terms;
      if (typeof pricing_notes === "string") quote.pricing_notes = pricing_notes;
      recomputeQuoteTotals(quote);
      applyMinPriceGuard(quote, snapshot.products as Product[]);
      quote.updated_at = new Date().toISOString();
      await writeJson(SNAPSHOT_PATH, snapshot);
      return quote;
    },
  };
}
