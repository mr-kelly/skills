// Shared, storage-neutral helpers used by the local-file provider and the
// scripts: JSON fs primitives, empty-document builders, snapshot merge/metrics,
// config discovery + dotenv loading, and the sanitized config summary. These
// were previously exported from app/server/store.ts.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ConfigResult, ConfigSummary, Conversation, MessagesSnapshot, Outbox } from "../types.ts";

export async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function emptySnapshot(): MessagesSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-messenger",
    metrics: {
      account_count: 0,
      conversation_count: 0,
      message_count: 0,
      unread_count: 0,
      awaiting_reply_count: 0,
    },
    accounts: [],
    conversations: [],
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No message snapshot exists yet. Configure accounts, then run scripts/sync_messages.ts or ingest a collected payload.",
      },
    ],
  };
}

export function emptyOutbox(): Outbox {
  return {
    schema_version: "1",
    updated_at: new Date(0).toISOString(),
    replies: [],
  };
}

export function recomputeMetrics(snapshot: MessagesSnapshot): MessagesSnapshot {
  const conversations = Array.isArray(snapshot.conversations) ? snapshot.conversations : [];
  snapshot.metrics = {
    account_count: Array.isArray(snapshot.accounts) ? snapshot.accounts.length : 0,
    conversation_count: conversations.length,
    message_count: conversations.reduce((sum, item) => sum + (item.messages?.length || 0), 0),
    unread_count: conversations.filter((item) => item.unread).length,
    awaiting_reply_count: conversations.filter((item) => item.awaiting_reply).length,
  };
  return snapshot;
}

export function mergeConversations(snapshot: MessagesSnapshot, incoming: Conversation[] = []): number {
  const byId = new Map<string, Conversation>(
    (snapshot.conversations || []).map((item) => [item.conversation_id, item]),
  );
  let newMessages = 0;
  for (const conversation of incoming) {
    const existing = byId.get(conversation.conversation_id);
    if (!existing) {
      byId.set(conversation.conversation_id, { ...conversation, messages: [...(conversation.messages || [])] });
      newMessages += conversation.messages?.length || 0;
      continue;
    }
    const seen = new Set((existing.messages || []).map((message) => message.message_id));
    for (const message of conversation.messages || []) {
      if (seen.has(message.message_id)) continue;
      existing.messages.push(message);
      seen.add(message.message_id);
      newMessages += 1;
    }
    existing.messages.sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
    const mergeKeys: (keyof Conversation)[] = [
      "title",
      "kind",
      "channel",
      "workspace",
      "provider_conversation_id",
      "participants",
    ];
    for (const key of mergeKeys) {
      if (conversation[key] !== undefined) (existing[key] as unknown) = conversation[key];
    }
    if (conversation.unread !== undefined) existing.unread = conversation.unread;
    if (conversation.awaiting_reply !== undefined) existing.awaiting_reply = conversation.awaiting_reply;
    if (conversation.suggested_reply !== undefined) existing.suggested_reply = conversation.suggested_reply;
    const last = existing.messages[existing.messages.length - 1];
    if (last) existing.last_message_at = last.sent_at;
    const lastIncoming = [...existing.messages].reverse().find((message) => message.direction === "incoming");
    if (lastIncoming) existing.last_incoming_at = lastIncoming.sent_at;
  }
  snapshot.conversations = [...byId.values()].sort((a, b) =>
    String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")),
  );
  return newMessages;
}

export async function loadDotenvFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_MESSENGER_CONFIG) paths.push(process.env.KELLY_MESSENGER_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-messenger", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_MESSENGER_ENV_FILE) paths.push(process.env.KELLY_MESSENGER_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-messenger", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { accounts: [] }, path: "", is_example: false };
}

export const SECRET_ENV_KEYS: string[] = [
  "bot_token_env",
  "user_token_env",
  "access_token_env",
  "phone_number_id_env",
  "token_env",
  "api_key_env",
];

// The sanitized config surface for the UI. Providers prepend their own
// `provider` field; this shape never contains secret values, only env names.
export function summarizeConfig(configResult: ConfigResult): Omit<ConfigSummary, "provider"> {
  const accounts = Array.isArray(configResult.config.accounts) ? configResult.config.accounts : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    reply_style: configResult.config.reply_style || null,
    sync: configResult.config.sync || null,
    accounts: accounts.map((account) => {
      const secretKeys = SECRET_ENV_KEYS.filter((key) => account[key]);
      return {
        account_id: account.account_id || "",
        platform: account.platform || "",
        connector: account.connector || "manual",
        display_name: account.display_name || account.account_id || "",
        workspace: account.workspace || "",
        secret_envs: secretKeys.map((key) => String(account[key])),
        secrets_ready: secretKeys.length > 0 && secretKeys.every((key) => Boolean(process.env[String(account[key])])),
      };
    }),
  };
}
