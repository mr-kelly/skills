// Provider-neutral core for kelly-inquiry: constants, config loading, and the
// pure snapshot math (metrics, merge, quote totals, min-price guard). Neither
// this module nor its callers care which backend stores the snapshot — the local
// provider and the batch scripts both build on these, and a remote provider can
// reuse the same math when it maps records back onto an InquirySnapshot.
//
// Everything here is pure or config-only; the stateful `.data/*.json` reads and
// writes live in local-file-provider.ts.

import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "../paths.ts";
import type { Config, ConfigResult, Inquiry, InquirySnapshot, Metrics, Product, Quote } from "../types.ts";

export const STAGES = ["new", "replied", "quoted", "negotiating", "won", "lost"];
export const ACTIVE_STAGES = ["new", "replied", "quoted", "negotiating"];
export const CHANNELS = ["whatsapp", "instagram", "messenger", "email"];
export const CONNECTORS = [
  "whatsapp_cloud",
  "instagram_graph",
  "messenger_graph",
  "email_agent",
  "browser_agent",
  "manual",
];
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "expired", "declined"];
export const APPROVAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

export function emptyMetrics(): Metrics {
  return {
    account_count: 0,
    inquiry_count: 0,
    quote_count: 0,
    product_count: 0,
    unanswered_new_count: 0,
    quotes_sent: 0,
    win_rate: 0,
    reply_median_minutes: 0,
    inquiries_this_week: { total: 0, by_channel: {} },
    stage_counts: { new: 0, replied: 0, quoted: 0, negotiating: 0, won: 0, lost: 0 },
  };
}

export function emptySnapshot(): InquirySnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-inquiry",
    base_currency: "USD",
    metrics: emptyMetrics(),
    accounts: [],
    inquiries: [],
    quotes: [],
    products: [],
    approvals: [],
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No inquiry snapshot exists yet. Configure channels, then ingest collected inquiries with scripts/ingest_inquiries.mjs.",
      },
    ],
  };
}

export function emptyDecisions() {
  return { schema_version: "1", updated_at: new Date(0).toISOString(), decisions: {} };
}

export function recomputeMetrics(snapshot: InquirySnapshot): InquirySnapshot {
  const inquiries = Array.isArray(snapshot.inquiries) ? snapshot.inquiries : [];
  const quotes = Array.isArray(snapshot.quotes) ? snapshot.quotes : [];
  const reference = new Date(snapshot.generated_at || Date.now()).getTime();
  const weekAgo = reference - 7 * 24 * 60 * 60 * 1000;
  const stage_counts: Record<string, number> = {
    new: 0,
    replied: 0,
    quoted: 0,
    negotiating: 0,
    won: 0,
    lost: 0,
  };
  const by_channel: Record<string, number> = {};
  let weekTotal = 0;
  const replyDeltas: number[] = [];
  for (const inquiry of inquiries) {
    if (stage_counts[inquiry.stage] !== undefined) stage_counts[inquiry.stage] += 1;
    const createdAt = new Date(inquiry.created_at || inquiry.last_message_at || 0).getTime();
    if (createdAt >= weekAgo && createdAt <= reference) {
      weekTotal += 1;
      by_channel[inquiry.channel] = (by_channel[inquiry.channel] || 0) + 1;
    }
    const messages = Array.isArray(inquiry.messages) ? inquiry.messages : [];
    const firstIncoming = messages.find((message) => message.direction === "incoming");
    const firstOutgoing = messages.find((message) => message.direction === "outgoing");
    if (firstIncoming && firstOutgoing) {
      const delta = (new Date(firstOutgoing.sent_at).getTime() - new Date(firstIncoming.sent_at).getTime()) / 60000;
      if (Number.isFinite(delta) && delta >= 0) replyDeltas.push(delta);
    }
  }
  replyDeltas.sort((a, b) => a - b);
  const median = replyDeltas.length ? replyDeltas[Math.floor((replyDeltas.length - 1) / 2)] : 0;
  const closed = stage_counts.won + stage_counts.lost;
  snapshot.metrics = {
    account_count: Array.isArray(snapshot.accounts) ? snapshot.accounts.length : 0,
    inquiry_count: inquiries.length,
    quote_count: quotes.length,
    product_count: Array.isArray(snapshot.products) ? snapshot.products.length : 0,
    unanswered_new_count: inquiries.filter(
      (item) => item.stage === "new" && !(item.messages || []).some((message) => message.direction === "outgoing"),
    ).length,
    quotes_sent: quotes.filter((quote) => ["sent", "accepted", "expired", "declined"].includes(quote.status)).length,
    win_rate: closed ? Number((stage_counts.won / closed).toFixed(2)) : 0,
    reply_median_minutes: Math.round(median),
    inquiries_this_week: { total: weekTotal, by_channel },
    stage_counts,
  };
  return snapshot;
}

export function mergeInquiries(snapshot: InquirySnapshot, incoming: Inquiry[] = []): number {
  const byId = new Map<string, Inquiry>((snapshot.inquiries || []).map((item) => [item.inquiry_id, item]));
  let newMessages = 0;
  for (const inquiry of incoming) {
    const existing = byId.get(inquiry.inquiry_id);
    if (!existing) {
      byId.set(inquiry.inquiry_id, { ...inquiry, messages: [...(inquiry.messages || [])] });
      newMessages += inquiry.messages?.length || 0;
      continue;
    }
    const seen = new Set((existing.messages || []).map((message) => message.message_id));
    for (const message of inquiry.messages || []) {
      if (seen.has(message.message_id)) continue;
      existing.messages.push(message);
      seen.add(message.message_id);
      newMessages += 1;
    }
    existing.messages.sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
    for (const key of [
      "customer",
      "product_interest",
      "product_ids",
      "quote_ids",
      "value_estimate",
      "currency",
      "owner",
      "provider_conversation_id",
      "next_follow_up",
      "suggested_reply",
    ] as const) {
      if (inquiry[key] !== undefined) (existing[key] as unknown) = inquiry[key];
    }
    if (inquiry.stage && STAGES.includes(inquiry.stage)) existing.stage = inquiry.stage;
    if (inquiry.unread !== undefined) existing.unread = inquiry.unread;
    refreshInquiryDerived(existing);
  }
  for (const item of byId.values()) refreshInquiryDerived(item);
  snapshot.inquiries = [...byId.values()].sort((a, b) =>
    String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")),
  );
  return newMessages;
}

export function refreshInquiryDerived(inquiry: Inquiry): Inquiry {
  const messages = Array.isArray(inquiry.messages) ? inquiry.messages : [];
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  if (last) inquiry.last_message_at = last.sent_at;
  if (lastIncoming) inquiry.last_incoming_at = lastIncoming.sent_at;
  // Stage heuristic: a "new" inquiry that already has an outgoing reply is at least "replied".
  if (inquiry.stage === "new" && messages.some((message) => message.direction === "outgoing")) {
    inquiry.stage = "replied";
  }
  return inquiry;
}

export function applyMinPriceGuard(quote: Quote, products: Product[]): Quote {
  const byId = new Map<string, Product>((products || []).map((product) => [product.product_id, product]));
  quote.pricing_alerts = [];
  for (const line of quote.items || []) {
    const product = line.product_id ? byId.get(line.product_id) : undefined;
    if (!product || typeof product.price_min !== "number") continue;
    if (Number(line.unit_price) < product.price_min) {
      quote.pricing_alerts.push({
        product_id: product.product_id,
        sku: product.sku,
        unit_price: Number(line.unit_price),
        price_min: product.price_min,
        message: `${product.sku}: unit price ${line.unit_price} is below the KB floor ${product.price_min}.`,
      });
    }
  }
  return quote;
}

export function recomputeQuoteTotals(quote: Quote): Quote {
  let subtotal = 0;
  for (const line of quote.items || []) {
    line.qty = Number(line.qty) || 0;
    line.unit_price = Number(line.unit_price) || 0;
    line.total = Number((line.qty * line.unit_price).toFixed(2));
    subtotal += line.total;
  }
  quote.subtotal = Number(subtotal.toFixed(2));
  quote.total = quote.subtotal;
  return quote;
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
  if (process.env.KELLY_INQUIRY_CONFIG) paths.push(process.env.KELLY_INQUIRY_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-inquiry", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_INQUIRY_ENV_FILE) paths.push(process.env.KELLY_INQUIRY_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-inquiry", ".env"));
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
  "ig_user_id_env",
  "page_id_env",
  "token_env",
  "api_key_env",
];

export function summarizeConfig(configResult: ConfigResult): Record<string, unknown> {
  const accounts = Array.isArray(configResult.config.accounts) ? configResult.config.accounts : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    quote_defaults: configResult.config.quote_defaults || null,
    follow_up: configResult.config.follow_up || null,
    reply_style: configResult.config.reply_style || null,
    product_kb: configResult.config.product_kb
      ? { source_path: configResult.config.product_kb.source_path || "" }
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
