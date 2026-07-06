// Local-file MessengerProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This provider is the
// offline reference implementation of the same inbox+outbox model Busabase
// serves remotely, so KELLY_MESSENGER_DATA_PROVIDER=local|busabase is a config
// switch, not a rewrite of the UI or scripts. This file holds the fs logic
// that previously lived in app/server/store.ts, verbatim in behavior, so the
// byte layout of app/.data/*.json and /api/state stays identical.

import fs from "node:fs/promises";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  OUTBOX_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type {
  AgentTasks,
  Config,
  ConfigResult,
  ConfigSummary,
  Conversation,
  DecideReplyInput,
  Lock,
  MessagesSnapshot,
  Onboarding,
  Outbox,
  ProviderMeta,
  QueueReplyInput,
  Reply,
} from "../types.ts";
import {
  emptyOutbox,
  emptySnapshot,
  mergeConversations,
  readConfig,
  readJson,
  recomputeMetrics,
  summarizeConfig,
  writeJson,
} from "./common.ts";

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  const config: Config = meta.config || { accounts: [] };

  const provider = {
    kind: "local",

    config(): Config {
      return config;
    },

    async ensureReady(): Promise<void> {
      await fs.mkdir(DATA_DIR, { recursive: true });
    },

    async readConfig(): Promise<ConfigResult> {
      return readConfig();
    },

    async configSummary(): Promise<ConfigSummary> {
      const configResult = await readConfig();
      return { provider: "local", ...summarizeConfig(configResult) };
    },

    async getState(): Promise<Record<string, unknown>> {
      const [snapshot, outbox, onboarding, lock, agentTasks, executionReport, configResult] = await Promise.all([
        this.readSnapshot(),
        this.readOutbox(),
        this.readOnboarding(),
        this.readLock(),
        this.readAgentTasks(),
        this.readExecutionReport(),
        readConfig(),
      ]);
      return {
        app: "kelly-messenger",
        data_provider: "local",
        onboarding,
        lock,
        config_summary: { provider: "local", ...summarizeConfig(configResult) },
        snapshot,
        outbox,
        agent_tasks: agentTasks,
        execution_report: executionReport,
      };
    },

    async readSnapshot(): Promise<MessagesSnapshot> {
      return (await readJson<MessagesSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as MessagesSnapshot;
    },

    async writeSnapshot(snapshot: MessagesSnapshot): Promise<void> {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },

    mergeConversations(snapshot: MessagesSnapshot, incoming: Conversation[] = []): number {
      return mergeConversations(snapshot, incoming);
    },

    recomputeMetrics(snapshot: MessagesSnapshot): MessagesSnapshot {
      return recomputeMetrics(snapshot);
    },

    async readOutbox(): Promise<Outbox> {
      return (await readJson<Outbox>(OUTBOX_PATH, emptyOutbox())) as Outbox;
    },

    async writeOutbox(outbox: Outbox): Promise<void> {
      await writeJson(OUTBOX_PATH, outbox);
    },

    async readOnboarding(): Promise<Onboarding> {
      return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
    },

    async readLock(): Promise<Lock | null> {
      return readJson<Lock>(LOCK_PATH, null);
    },

    async writeLock(lock: Lock): Promise<void> {
      await writeJson(LOCK_PATH, lock);
    },

    async clearLock(): Promise<void> {
      await fs.rm(LOCK_PATH, { force: true });
    },

    async readAgentTasks(): Promise<AgentTasks> {
      return (await readJson<AgentTasks>(AGENT_TASKS_PATH, {
        schema_version: "1",
        updated_at: "",
        tasks: [],
      })) as AgentTasks;
    },

    async writeAgentTasks(tasks: AgentTasks): Promise<void> {
      await writeJson(AGENT_TASKS_PATH, tasks);
    },

    async readExecutionReport(): Promise<unknown> {
      return readJson(EXECUTION_REPORT_PATH, null);
    },

    async writeExecutionReport(report: unknown): Promise<void> {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    async queueReply({ conversation_id, text, note = "", suggested_by = "human" }: QueueReplyInput): Promise<Reply> {
      const [snapshot, outbox] = await Promise.all([this.readSnapshot(), this.readOutbox()]);
      const conversation = (snapshot.conversations || []).find((item) => item.conversation_id === conversation_id);
      if (!conversation) throw new Error(`Unknown conversation: ${conversation_id}`);
      if (typeof text !== "string" || !text.trim()) throw new Error("Reply text must not be empty");
      const now = new Date().toISOString();
      const ref = outbox.replies.reduce((max, reply) => Math.max(max, reply.ref || 0), 0) + 1;
      const reply: Reply = {
        reply_id: `reply-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${ref}`,
        ref,
        conversation_id,
        account_id: conversation.account_id,
        platform: conversation.platform,
        conversation_title: conversation.title,
        text: text.trim(),
        note: String(note || ""),
        reason: "Queued from the inbox composer.",
        suggested_by,
        status: "needs_review",
        decision: null,
        execution: null,
        created_at: now,
        updated_at: now,
      };
      outbox.replies.push(reply);
      outbox.updated_at = now;
      await this.writeOutbox(outbox);
      return reply;
    },

    async decideReply({ reply_id, action, comment = "", text }: DecideReplyInput): Promise<Reply> {
      const outbox = await this.readOutbox();
      const reply = outbox.replies.find((item) => item.reply_id === reply_id);
      if (!reply) throw new Error(`Unknown reply: ${reply_id}`);
      const now = new Date().toISOString();
      if (typeof text === "string" && text.trim()) reply.text = text.trim();
      if (action === "approve") reply.status = "approved";
      else if (action === "request_changes") reply.status = "changes_requested";
      else if (action === "block") reply.status = "blocked";
      else if (action !== "revise") throw new Error(`Unknown action: ${action}`);
      reply.decision = { action, comment: String(comment || ""), decided_at: now };
      reply.updated_at = now;
      outbox.updated_at = now;
      await this.writeOutbox(outbox);
      if (action === "request_changes") await appendAgentTask(this, reply, comment);
      return reply;
    },
  };

  return provider;
}

async function appendAgentTask(
  provider: { readAgentTasks(): Promise<AgentTasks>; writeAgentTasks(tasks: AgentTasks): Promise<void> },
  reply: Reply,
  comment: string,
): Promise<void> {
  const tasks = await provider.readAgentTasks();
  const now = new Date().toISOString();
  tasks.tasks.push({
    task_id: `task-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${reply.ref}`,
    type: "revise_reply",
    reply_id: reply.reply_id,
    ref: reply.ref,
    conversation_id: reply.conversation_id,
    comment: String(comment || ""),
    status: "open",
    requested_at: now,
  });
  tasks.updated_at = now;
  await provider.writeAgentTasks(tasks);
}
