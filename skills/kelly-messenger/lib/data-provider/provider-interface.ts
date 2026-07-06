// The data-provider contract for kelly-messenger.
//
// kelly-messenger is an App-in-Skill whose unit of work is a unified message
// inbox plus an approval-gated outbox: incoming conversations are collected into
// a snapshot, and human-reviewed replies flow needs_review -> approved -> done.
// This interface is the seam that lets the same Hono server and the same
// scripts/*.ts run against either backend:
//
//   KELLY_MESSENGER_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_MESSENGER_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Every provider implements this same `MessengerProvider` shape, so callers get
// one from `createProvider()` and use it without knowing the backend.
// `assertProvider()` is the runtime guard that makes a non-conforming provider
// fail loudly at registration instead of deep in a request.
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. `lib/package.json` `{"type":"module"}`
// makes Node treat the `.ts` files as ESM.

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
  QueueReplyInput,
  Reply,
} from "../types.ts";

/** The polymorphic contract shared by every provider (local-file, busabase). */
export interface MessengerProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state` as data_provider. */
  readonly kind: string;

  // ── aggregate ──────────────────────────────────────────────────────────────
  /** Full payload for `/api/state` (snapshot + outbox + onboarding + lock + ...). */
  getState(): Promise<Record<string, unknown>>;
  /** Sanitized config summary (never secrets), includes the provider name. */
  configSummary(): Promise<ConfigSummary>;

  // ── inbox (snapshot) reads/writes ────────────────────────────────────────────
  readSnapshot(): Promise<MessagesSnapshot>;
  writeSnapshot(snapshot: MessagesSnapshot): Promise<void>;
  /** Merge collected conversations into a snapshot; returns new-message count. */
  mergeConversations(snapshot: MessagesSnapshot, incoming: Conversation[]): number;
  /** Recompute snapshot.metrics in place; returns the same snapshot. */
  recomputeMetrics(snapshot: MessagesSnapshot): MessagesSnapshot;

  // ── outbox (approval-gated replies) ──────────────────────────────────────────
  readOutbox(): Promise<Outbox>;
  writeOutbox(outbox: Outbox): Promise<void>;
  /** Queue a new human-authored reply for review. */
  queueReply(input: QueueReplyInput): Promise<Reply>;
  /** Apply a human verdict (approve|revise|request_changes|block) to a reply. */
  decideReply(input: DecideReplyInput): Promise<Reply>;

  // ── agent handoff / lock / onboarding / reports ──────────────────────────────
  readAgentTasks(): Promise<AgentTasks>;
  writeAgentTasks(tasks: AgentTasks): Promise<void>;
  readLock(): Promise<Lock | null>;
  writeLock(lock: Lock): Promise<void>;
  clearLock(): Promise<void>;
  readOnboarding(): Promise<Onboarding>;
  readExecutionReport(): Promise<unknown>;
  writeExecutionReport(report: unknown): Promise<void>;

  // ── config ───────────────────────────────────────────────────────────────────
  readConfig(): Promise<ConfigResult>;
  /** The active config already loaded at construction time. */
  config(): Config;

  // ── setup ─────────────────────────────────────────────────────────────────────
  /** Ensure any backing storage (directories) exists. */
  ensureReady(): Promise<void>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "configSummary",
  "readSnapshot",
  "writeSnapshot",
  "mergeConversations",
  "recomputeMetrics",
  "readOutbox",
  "writeOutbox",
  "queueReply",
  "decideReply",
  "readAgentTasks",
  "writeAgentTasks",
  "readLock",
  "writeLock",
  "clearLock",
  "readOnboarding",
  "readExecutionReport",
  "writeExecutionReport",
  "readConfig",
  "config",
  "ensureReady",
] as const satisfies readonly (keyof MessengerProvider)[];

/**
 * Assert `provider` conforms to {@link MessengerProvider}; throw one actionable
 * error listing everything missing. Call at registration (in createProvider()).
 */
export function assertProvider(kind: string, provider: unknown): MessengerProvider {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${kind}" is not an object.`);
  }
  const candidate = provider as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof candidate.kind !== "string" || !candidate.kind) problems.push("kind (string)");
  for (const method of CORE_METHODS) {
    if (typeof candidate[method] !== "function") problems.push(`${method}()`);
  }
  if (problems.length) {
    throw new Error(
      `Data provider "${kind}" does not satisfy MessengerProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as MessengerProvider;
}
