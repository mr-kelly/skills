// Provider-neutral core for kelly-support: constants, config loading, the pure
// snapshot math (metrics, SLA, CSAT), and the support-qa quality gate. Neither
// this module nor its callers care which backend stores the snapshot — the local
// provider and the batch scripts both build on these, and a remote provider can
// reuse the same math when it maps records back onto a SupportSnapshot.
//
// Everything here is pure or config-only; the stateful `.data/*.json` reads and
// writes live in local-file-provider.ts.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ConfigResult, KbArticle, Metrics, QualityGate, SupportSnapshot, Ticket } from "../types.ts";

export const TICKET_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const OPEN_STATUSES = ["needs_review", "changes_requested", "approved"];
export const CHANNELS = ["email", "whatsapp", "webchat", "form", "wechat"];
export const CONNECTORS = ["email_agent", "whatsapp_cloud", "webchat_widget", "form_intake", "wechat_work", "manual"];
export const CATEGORIES = ["bug", "how_to", "billing", "refund", "complaint", "feature"];
export const PRIORITIES = ["urgent", "high", "normal", "low"];
export const PROPOSED_ACTIONS = ["send_reply", "escalate", "refund", "close", "no_action"];
export const GATE_VERDICTS = ["ship", "fix", "block"];
// Actions that always require an explicit human approval (high-risk).
export const APPROVAL_REQUIRED_ACTIONS = ["refund", "escalate"];

export function emptyMetrics(): Metrics {
  return {
    account_count: 0,
    ticket_count: 0,
    kb_count: 0,
    open_count: 0,
    awaiting_approval_count: 0,
    breaching_sla_count: 0,
    resolved_count: 0,
    csat_average: 0,
    csat_responses: 0,
    first_response_median_minutes: 0,
    tickets_this_week: { total: 0, by_channel: {} },
    by_category: {},
    status_counts: { needs_review: 0, changes_requested: 0, approved: 0, done: 0, blocked: 0 },
    csat_trend: [],
  };
}

export function emptySnapshot(): SupportSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-support",
    metrics: emptyMetrics(),
    accounts: [],
    tickets: [],
    knowledge_base: [],
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No support snapshot exists yet. Configure channels, then have the agent merge collected tickets directly into app/.data/support_snapshot.json (see references/support-schema.md).",
      },
    ],
  };
}

export function emptyDecisions() {
  return { schema_version: "1", updated_at: new Date(0).toISOString(), decisions: {} };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

// SLA breach is derived, never trusted from input: a ticket breaches when it is
// still open and its due_by has passed relative to the snapshot's reference time.
export function refreshTicketDerived(ticket: Ticket, referenceIso?: string): Ticket {
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  if (last) ticket.last_message_at = last.sent_at;
  if (lastIncoming) ticket.last_incoming_at = lastIncoming.sent_at;
  const firstOutgoing = messages.find((message) => message.direction === "outgoing");
  if (ticket.sla && !ticket.sla.first_response_at && firstOutgoing) {
    ticket.sla.first_response_at = firstOutgoing.sent_at;
  }
  if (ticket.sla?.due_by) {
    const reference = new Date(referenceIso || Date.now()).getTime();
    const open = ticket.status !== "done" && ticket.status !== "blocked";
    const answered = Boolean(ticket.sla.first_response_at);
    ticket.sla.breached = open && !answered && new Date(ticket.sla.due_by).getTime() < reference;
  }
  return ticket;
}

export function recomputeMetrics(snapshot: SupportSnapshot): SupportSnapshot {
  const tickets = Array.isArray(snapshot.tickets) ? snapshot.tickets : [];
  const kb = Array.isArray(snapshot.knowledge_base) ? snapshot.knowledge_base : [];
  const reference = new Date(snapshot.generated_at || Date.now()).getTime();
  const weekAgo = reference - 7 * 24 * 60 * 60 * 1000;
  const status_counts: Record<string, number> = {
    needs_review: 0,
    changes_requested: 0,
    approved: 0,
    done: 0,
    blocked: 0,
  };
  const by_category: Record<string, number> = {};
  const by_channel: Record<string, number> = {};
  let weekTotal = 0;
  const responseDeltas: number[] = [];
  const csatScores: number[] = [];
  for (const ticket of tickets) {
    refreshTicketDerived(ticket, snapshot.generated_at);
    if (status_counts[ticket.status] !== undefined) status_counts[ticket.status] += 1;
    by_category[ticket.category] = (by_category[ticket.category] || 0) + 1;
    const createdAt = new Date(ticket.created_at || ticket.last_message_at || 0).getTime();
    if (createdAt >= weekAgo && createdAt <= reference) {
      weekTotal += 1;
      by_channel[ticket.channel] = (by_channel[ticket.channel] || 0) + 1;
    }
    const firstIncoming = (ticket.messages || []).find((m) => m.direction === "incoming");
    const firstOutgoing = (ticket.messages || []).find((m) => m.direction === "outgoing");
    if (firstIncoming && firstOutgoing) {
      const delta = (new Date(firstOutgoing.sent_at).getTime() - new Date(firstIncoming.sent_at).getTime()) / 60000;
      if (Number.isFinite(delta) && delta >= 0) responseDeltas.push(delta);
    }
    if (ticket.csat && typeof ticket.csat.score === "number") csatScores.push(ticket.csat.score);
  }
  const csatAverage = csatScores.length
    ? Number((csatScores.reduce((sum, s) => sum + s, 0) / csatScores.length).toFixed(2))
    : 0;
  snapshot.metrics = {
    account_count: Array.isArray(snapshot.accounts) ? snapshot.accounts.length : 0,
    ticket_count: tickets.length,
    kb_count: kb.length,
    open_count: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
    awaiting_approval_count: tickets.filter((t) => t.status === "needs_review").length,
    breaching_sla_count: tickets.filter((t) => t.sla?.breached).length,
    resolved_count: tickets.filter((t) => t.status === "done").length,
    csat_average: csatAverage,
    csat_responses: csatScores.length,
    first_response_median_minutes: Math.round(median(responseDeltas)),
    tickets_this_week: { total: weekTotal, by_channel },
    by_category,
    status_counts,
    csat_trend: snapshot.metrics?.csat_trend?.length ? snapshot.metrics.csat_trend : deriveCsatTrend(tickets),
  };
  return snapshot;
}

function deriveCsatTrend(tickets: Ticket[]): Array<{ label: string; score: number }> {
  const rated = tickets
    .filter((t) => t.csat && typeof t.csat.score === "number" && t.csat.rated_at)
    .sort((a, b) => String(a.csat?.rated_at).localeCompare(String(b.csat?.rated_at)));
  return rated.slice(-6).map((t, index) => ({
    label: `#${index + 1}`,
    score: Number(t.csat?.score) || 0,
  }));
}

// ---- The support-qa quality gate ----
//
// A pre-send CSAT-risk / policy gate. Runs against a ticket + its proposed reply
// and returns SHIP / FIX / BLOCK. It BLOCKS sends that promise refunds or make
// commitments without approval, or that lack grounding / contradict the KB. It
// never sends; a human still approves. `decideApproval` and the executor both
// re-check the gate so a BLOCK is a hard stop even if a stale approve exists.

const COMMITMENT_PATTERNS =
  /\b(refund|money back|reimburse|compensat|guarantee|we (?:will|'ll) (?:refund|credit|waive|comp)|credit your account|free month|discount code|coupon)\b/i;

export function runQualityGate(ticket: Ticket, kb: KbArticle[] = [], risk: Config["risk_policy"] = {}): QualityGate {
  const reply = String(ticket.suggested_reply || "");
  const kbIds = new Set((kb || []).map((a) => a.article_id));
  const refs = Array.isArray(ticket.kb_refs) ? ticket.kb_refs : [];
  const validRefs = refs.filter((id) => kbIds.has(id));
  const checks: GateCheckResult[] = [];

  // 1. Grounding: a substantive reply should cite at least one real KB article.
  const grounded = validRefs.length > 0 || reply.trim().length < 40;
  checks.push({
    id: "grounding",
    ok: grounded,
    message: grounded
      ? validRefs.length
        ? `Reply cites ${validRefs.length} KB article(s).`
        : "Short acknowledgement — grounding not required."
      : "Reply is substantive but cites no valid KB article. Ground it or mark for human review.",
  });

  // 2. Dangling refs: every cited ref must resolve to a real article.
  const danglingRefs = refs.filter((id) => !kbIds.has(id));
  checks.push({
    id: "kb_refs_resolve",
    ok: danglingRefs.length === 0,
    message: danglingRefs.length
      ? `Cites unknown KB article(s): ${danglingRefs.join(", ")}.`
      : "All cited KB refs resolve.",
  });

  // 3. Commitments / refunds: a reply that promises a refund or makes a
  //    commitment is a hard stop unless the ticket is an approved refund action.
  const makesCommitment = COMMITMENT_PATTERNS.test(reply);
  const refundApproved = ticket.proposed_action === "refund" && ticket.status === "approved";
  const commitmentsGuarded = risk?.block_commitments_without_approval !== false;
  const commitmentOk = !makesCommitment || refundApproved || !commitmentsGuarded;
  checks.push({
    id: "no_unapproved_commitment",
    ok: commitmentOk,
    message: commitmentOk
      ? makesCommitment
        ? "Commitment present but on an approved refund/action."
        : "No refund or commitment language detected."
      : "Reply promises a refund/commitment without an approved refund action. Requires human approval.",
  });

  // 4. Refund policy: a refund action above the auto cap needs approval.
  const refundOk =
    ticket.proposed_action !== "refund" ||
    (risk?.refund_requires_approval === false &&
      (risk?.max_auto_refund === undefined || Number(ticket.execution?.amount || 0) <= Number(risk.max_auto_refund)));
  checks.push({
    id: "refund_policy",
    ok: refundOk || ticket.status === "approved",
    message:
      ticket.proposed_action === "refund"
        ? ticket.status === "approved"
          ? "Refund explicitly approved by a human."
          : "Refund action requires human approval before sending."
        : "No refund requested.",
  });

  const hardBlocks = checks.filter((c) => (c.id === "no_unapproved_commitment" || c.id === "refund_policy") && !c.ok);
  const softFixes = checks.filter((c) => (c.id === "grounding" || c.id === "kb_refs_resolve") && !c.ok);
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  let verdict = "ship";
  let summary = "Reply is grounded and within policy — ready to approve and send.";
  if (hardBlocks.length) {
    verdict = "block";
    summary = hardBlocks.map((c) => c.message).join(" ");
  } else if (softFixes.length) {
    verdict = "fix";
    summary = softFixes.map((c) => c.message).join(" ");
  }
  return { verdict, score, summary, checks };
}

interface GateCheckResult {
  id: string;
  ok: boolean;
  message: string;
}

// ---- Config loading (provider-neutral) ----

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
  if (process.env.KELLY_SUPPORT_CONFIG) paths.push(process.env.KELLY_SUPPORT_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-support", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_SUPPORT_ENV_FILE) paths.push(process.env.KELLY_SUPPORT_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-support", ".env"));
  return paths;
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJsonFile<Config>(file);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { accounts: [] }, path: "", is_example: false };
}

export const SECRET_ENV_KEYS = [
  "access_token_env",
  "phone_number_id_env",
  "webhook_secret_env",
  "corp_secret_env",
  "token_env",
  "api_key_env",
];

export function summarizeConfig(configResult: ConfigResult): Record<string, unknown> {
  const accounts = Array.isArray(configResult.config.accounts) ? configResult.config.accounts : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    sla_policy: configResult.config.sla_policy || null,
    risk_policy: configResult.config.risk_policy || null,
    reply_style: configResult.config.reply_style || null,
    knowledge_base: configResult.config.knowledge_base
      ? { source_path: configResult.config.knowledge_base.source_path || "" }
      : null,
    accounts: accounts.map((account) => {
      const secretKeys = SECRET_ENV_KEYS.filter((key) => account[key]);
      return {
        account_id: account.account_id || "",
        channel: account.channel || "",
        connector: account.connector || "manual",
        display_name: account.display_name || account.account_id || "",
        handle: account.handle || "",
        secret_envs: secretKeys.map((key) => account[key]),
        secrets_ready: secretKeys.length > 0 && secretKeys.every((key) => Boolean(process.env[account[key] as string])),
      };
    }),
  };
}

export async function ensureDirs(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// Local-file write primitive for script-side artifacts that have no provider
// method (the agent lock file, the execution report). Providers own snapshot
// persistence via writeSnapshot(); this is only for those local .data sidecars.
export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
