// The polymorphic contract every kelly-support backend implements.
//
// kelly-support is a customer-support desk: a support snapshot (accounts,
// tickets, knowledge base) plus an approval queue where a human approves /
// requests changes / blocks agent-drafted, KB-grounded replies and proposed
// actions. Both the Hono server and the batch scripts reach storage ONLY through
// this interface, so KELLY_SUPPORT_DATA_PROVIDER=local|busabase is a config
// switch, not a rewrite of the UI or scripts.
//
// Members mirror the surface the server exposes:
//   getState()                     -> the /api/state payload (sans "app")
//   readSnapshot() / writeSnapshot -> the authoritative support snapshot
//   readLock()                     -> agent lock guarding writes
//   queueReply(input)              -> queue/replace a ticket's suggested reply
//   decideApproval(input)          -> approve | request_changes | block | revise
//   setSla(input)                  -> reschedule a ticket's SLA due-by
//   updateTicket(input)            -> edit priority / proposed_action (re-runs gate)
//   configSummary()                -> sanitized provider + config info for the UI
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json `{"type":"module"}` makes
// Node treat these `.ts` files as ESM.

import type { ProviderMeta, SupportSnapshot, Ticket } from "../types.ts";
import type { Lock } from "../types.ts";

export interface QueueReplyInput {
  ticket_id: string;
  text: string;
  note?: string;
  kb_refs?: string[];
  suggested_by?: string;
}

export interface DecideApprovalInput {
  ticket_id: string;
  action: string;
  comment?: string;
  text?: string;
}

export interface SetSlaInput {
  ticket_id: string;
  due_by: string;
}

export interface UpdateTicketInput {
  ticket_id: string;
  priority?: string;
  proposed_action?: string;
  category?: string;
}

// The aggregate /api/state payload, minus the constant `app` field the server
// adds. Kept loose (Record) so providers can attach provider-specific extras.
export type SupportState = Record<string, unknown>;

export interface SupportProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state.data_provider`. */
  readonly kind: string;

  // ── read side (required) ───────────────────────────────────────────────────
  /** Aggregate payload for `/api/state` (server prepends `app: "kelly-support"`). */
  getState(): Promise<SupportState>;
  /** The authoritative support snapshot; scripts read this before merging. */
  readSnapshot(): Promise<SupportSnapshot>;
  /** Agent lock status guarding writes (null when unlocked). */
  readLock(): Promise<Lock | null>;
  /** Sanitized provider + config summary (never secrets). */
  configSummary(): Record<string, unknown>;

  // ── write side (required) ──────────────────────────────────────────────────
  /** Persist the whole snapshot (script ingest / KB sync / executor). */
  writeSnapshot(snapshot: SupportSnapshot): Promise<void>;
  /** Set/replace a ticket's suggested reply (re-runs the support-qa gate). */
  queueReply(input: QueueReplyInput): Promise<Ticket>;
  /** Apply a verdict: approve | request_changes | block | revise. */
  decideApproval(input: DecideApprovalInput): Promise<Ticket>;
  /** Reschedule a ticket's SLA due-by (ISO timestamp). */
  setSla(input: SetSlaInput): Promise<Ticket>;
  /** Edit priority / proposed_action / category and re-run the gate. */
  updateTicket(input: UpdateTicketInput): Promise<Ticket>;
}

/** Members every provider MUST implement (kept in sync with the interface). */
export const CORE_METHODS = [
  "getState",
  "readSnapshot",
  "readLock",
  "configSummary",
  "writeSnapshot",
  "queueReply",
  "decideApproval",
  "setSla",
  "updateTicket",
] as const satisfies readonly (keyof SupportProvider)[];

/**
 * Assert `provider` conforms to {@link SupportProvider}; throw one actionable
 * error listing everything missing. Called at registration in createProvider()
 * so a non-conforming provider fails loudly there instead of deep in a request.
 */
export function assertProvider(kind: string, provider: unknown): SupportProvider {
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
      `Data provider "${kind}" does not satisfy SupportProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as SupportProvider;
}

export type { ProviderMeta };
