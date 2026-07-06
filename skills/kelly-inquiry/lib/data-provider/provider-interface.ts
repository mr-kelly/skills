// The polymorphic contract every kelly-inquiry backend implements.
//
// kelly-inquiry is a sales-pipeline / approval-queue desk: an inquiry snapshot
// (accounts, inquiries, quotes, products) plus an approval queue where a human
// approves / requests changes on agent-suggested replies and quotes. Both the
// Hono server and the batch scripts reach storage ONLY through this interface,
// so KELLY_INQUIRY_DATA_PROVIDER=local|busabase is a config switch, not a
// rewrite of the UI or scripts.
//
// Members mirror the surface app/server/store.ts used to expose directly:
//   getState()                     -> the /api/state payload (sans "app")
//   readSnapshot() / writeSnapshot -> the authoritative inquiry snapshot
//   readLock()                     -> agent lock guarding writes
//   queueReply(input)              -> enqueue a human reply for approval
//   decideApproval(input)          -> approve | request_changes | block | revise
//   setFollowUp(input)             -> set an inquiry's next_follow_up date
//   updateQuote(input)             -> edit quote lines / terms, re-run guards
//   configSummary()                -> sanitized provider + config info for the UI
//
// Runs on Node >=23.6 via native type-stripping — erasable TypeScript only
// (no enum/namespace), NO build step. lib/package.json `{"type":"module"}` makes
// Node treat these `.ts` files as ESM.

import type { Approval, Inquiry, InquirySnapshot, Lock, ProviderMeta, Quote } from "../types.ts";

export interface QueueReplyInput {
  inquiry_id: string;
  text: string;
  note?: string;
  suggested_by?: string;
}

export interface DecideApprovalInput {
  item_id: string;
  action: string;
  comment?: string;
  text?: string;
}

export interface SetFollowUpInput {
  inquiry_id: string;
  next_follow_up: string;
}

export interface UpdateQuoteInput {
  quote_id: string;
  items?: Array<Record<string, unknown>>;
  valid_until?: string;
  terms?: string;
  pricing_notes?: string;
}

// The aggregate /api/state payload, minus the constant `app` field the server
// adds. Kept loose (Record) so providers can attach provider-specific extras.
export type InquiryState = Record<string, unknown>;

export interface InquiryProvider {
  /** Stable provider id, e.g. `"local"`. Echoed in `/api/state.data_provider`. */
  readonly kind: string;

  // ── read side (required) ───────────────────────────────────────────────────
  /** Aggregate payload for `/api/state` (server prepends `app: "kelly-inquiry"`). */
  getState(): Promise<InquiryState>;
  /** The authoritative inquiry snapshot; scripts read this before merging. */
  readSnapshot(): Promise<InquirySnapshot>;
  /** Agent lock status guarding writes (null when unlocked). */
  readLock(): Promise<Lock | null>;
  /** Sanitized provider + config summary (never secrets). */
  configSummary(): Record<string, unknown>;

  // ── write side (required) ──────────────────────────────────────────────────
  /** Persist the whole snapshot (script ingest / product sync / send executor). */
  writeSnapshot(snapshot: InquirySnapshot): Promise<void>;
  /** Enqueue a human reply into the approval queue. */
  queueReply(input: QueueReplyInput): Promise<Approval>;
  /** Apply a verdict: approve | request_changes | block | revise. */
  decideApproval(input: DecideApprovalInput): Promise<Approval>;
  /** Set an inquiry's next_follow_up (YYYY-MM-DD or empty). */
  setFollowUp(input: SetFollowUpInput): Promise<Inquiry>;
  /** Edit quote lines / terms and re-run totals + min-price guard. */
  updateQuote(input: UpdateQuoteInput): Promise<Quote>;
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
  "setFollowUp",
  "updateQuote",
] as const satisfies readonly (keyof InquiryProvider)[];

/**
 * Assert `provider` conforms to {@link InquiryProvider}; throw one actionable
 * error listing everything missing. Called at registration in createProvider()
 * so a non-conforming provider fails loudly there instead of deep in a request.
 */
export function assertProvider(kind: string, provider: unknown): InquiryProvider {
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
      `Data provider "${kind}" does not satisfy InquiryProvider — missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider as InquiryProvider;
}

export type { ProviderMeta };
