import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { createProvider } from "../../content/kelly-email-app/lib/data-provider/index.ts";
import type { Config, Mailbox } from "../../content/kelly-email-app/lib/types.ts";

export interface SupportReplyRequest {
  idempotencyKey: string;
  fromAddress: string;
  mailboxId?: string;
  toAddress: string;
  customerName?: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string | string[];
}

export interface SmtpConnectorResult {
  ok: true;
  dryRun: boolean;
  /** Backward-compatible alias for submittedMessageId. */
  messageId: string;
  submittedMessageId: string;
  /** Sanitized SMTP 2xx acceptance response; empty during dry runs. */
  providerReceiptId: string;
  accepted: string[];
  rejected: string[];
  identityId: string;
  sendAs: string;
  mailboxId: string;
  threaded: boolean;
}

export interface ConnectorErrorInfo {
  message: string;
  code: string;
  responseCode?: number;
  retryable: boolean;
  ambiguous: boolean;
}

type Identity = NonNullable<Config["identities"]>[number];
type SecretResolver = (endpoint: unknown, label: string) => Promise<string>;

const normalizeEmail = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

export function parseEmailAddresses(value: string) {
  const results: Array<{ name: string; address: string }> = [];
  const pattern = /(?:"?([^"<,]*)"?\s*)?<([^<>@\s]+@[^<>\s]+)>|([^<>,\s]+@[^<>,\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value || ""))) {
    results.push({ name: (match[1] || "").trim(), address: (match[2] || match[3] || "").trim() });
  }
  return results;
}

export function ensureMessageId(value: unknown) {
  const id = String(value || "").trim();
  if (!id) return "";
  if (id.startsWith("<") && id.endsWith(">")) return id;
  return id.includes("@") ? `<${id.replace(/^<|>$/g, "")}>` : "";
}

export function replySubject(subject = "") {
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject || "(no subject)"}`;
}

function endpointSecretRef(endpoint: unknown) {
  const data = endpoint && typeof endpoint === "object" ? (endpoint as Record<string, unknown>) : {};
  return String(data.vault_ref || data.password_vault_ref || data.secret_ref || data.password_env || "").trim();
}

export async function resolveEndpointSecret(endpoint: unknown, label: string) {
  const ref = endpointSecretRef(endpoint);
  if (!ref) throw new Error(`missing secret reference for ${label}`);
  const provider = createProvider();
  if (provider.getSecret) {
    const secret = await provider.getSecret(ref).catch(() => undefined);
    if (secret) return secret;
  }
  const secret = process.env[ref];
  if (!secret) throw new Error(`Missing configured secret: ${ref}`);
  return secret;
}

function identityAddresses(identity: Identity) {
  return new Set([
    normalizeEmail(identity.send_as_email),
    ...(identity.use_when?.recipient_addresses || []).map((value: unknown) => normalizeEmail(value)),
  ]);
}

export function resolveOutboundIdentity(config: Config, fromAddress: string, mailboxId = "") {
  const wanted = new Set(parseEmailAddresses(fromAddress).map((value) => normalizeEmail(value.address)));
  if (!wanted.size && normalizeEmail(fromAddress)) wanted.add(normalizeEmail(fromAddress));
  const mailboxes = new Map((config.mailboxes || []).map((mailbox) => [mailbox.mailbox_id, mailbox]));
  let identity = (config.identities || []).find((candidate) =>
    [...identityAddresses(candidate)].some((address) => wanted.has(address)),
  );

  if (!identity) {
    const mailbox = (config.mailboxes || []).find((candidate) =>
      [candidate.primary_email, ...(candidate.aliases || [])]
        .map(normalizeEmail)
        .some((address) => wanted.has(address)),
    );
    const identityId = mailbox?.send_identities?.[0];
    identity = (config.identities || []).find((candidate) => candidate.identity_id === identityId);
  }

  if (!identity && mailboxId) {
    const mailbox = mailboxes.get(mailboxId);
    const identityId = mailbox?.send_identities?.[0];
    identity = (config.identities || []).find((candidate) => candidate.identity_id === identityId);
  }

  if (!identity) throw new Error(`No outbound identity configured for ${fromAddress}`);
  const mailbox = mailboxes.get(identity.mailbox_id);
  if (!mailbox) throw new Error(`Unknown mailbox for identity ${identity.identity_id}`);
  return { identity, mailbox };
}

function deterministicMessageId(idempotencyKey: string, sendAs: string) {
  const domain = normalizeEmail(sendAs).split("@")[1] || "kelly-support.local";
  const digest = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32);
  return `<kelly-support-${digest}@${domain}>`;
}

function references(value: string | string[] | undefined, inReplyTo: string) {
  const values = Array.isArray(value) ? value : String(value || "").split(/\s+/);
  const normalized = values.map(ensureMessageId).filter(Boolean);
  if (inReplyTo && !normalized.includes(inReplyTo)) normalized.push(inReplyTo);
  return normalized;
}

function validateRequest(request: SupportReplyRequest) {
  if (!request.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  if (!parseEmailAddresses(request.toAddress)[0]?.address) throw new Error("A valid toAddress is required");
  if (!request.text.trim()) throw new Error("Reply text is required");
}

async function smtpTransport(mailbox: Mailbox, resolveSecret: SecretResolver) {
  const smtp = mailbox.smtp;
  if (!smtp?.host || !smtp.username) throw new Error(`missing SMTP config for ${mailbox.mailbox_id}`);
  const password = await resolveSecret(smtp, `${mailbox.mailbox_id}:smtp`);
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port || 465),
    secure: smtp.security === "ssl" || Number(smtp.port || 465) === 465,
    auth: { user: smtp.username, pass: password },
  });
}

export async function sendSupportReply(
  request: SupportReplyRequest,
  config: Config,
  { dryRun = true, resolveSecret = resolveEndpointSecret }: { dryRun?: boolean; resolveSecret?: SecretResolver } = {},
): Promise<SmtpConnectorResult> {
  validateRequest(request);
  const { identity, mailbox } = resolveOutboundIdentity(config, request.fromAddress, request.mailboxId);
  const sendAs = String(identity.send_as_email || "").trim();
  const messageId = deterministicMessageId(request.idempotencyKey, sendAs);
  const inReplyTo = ensureMessageId(request.inReplyTo);
  const refs = references(request.references, inReplyTo);
  const recipient = parseEmailAddresses(request.toAddress)[0];
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      messageId,
      submittedMessageId: messageId,
      providerReceiptId: "",
      accepted: [recipient.address],
      rejected: [],
      identityId: identity.identity_id,
      sendAs,
      mailboxId: mailbox.mailbox_id,
      threaded: Boolean(inReplyTo),
    };
  }

  const transporter = await smtpTransport(mailbox, resolveSecret);
  const result = await transporter.sendMail({
    from: { name: identity.display_name || sendAs, address: sendAs },
    to: request.customerName ? { name: request.customerName, address: recipient.address } : recipient.address,
    replyTo: identity.reply_to || undefined,
    subject: replySubject(request.subject),
    text: request.text.trim(),
    messageId,
    inReplyTo: inReplyTo || undefined,
    references: refs.length ? refs : undefined,
  });
  const accepted = (result.accepted || []).map(String);
  const rejected = (result.rejected || []).map(String);
  if (!accepted.length || rejected.includes(recipient.address)) {
    const error = new Error("SMTP provider did not accept the support recipient") as Error & { responseCode?: number };
    error.responseCode = 550;
    throw error;
  }
  const submittedMessageId = ensureMessageId(result.messageId) || messageId;
  const providerReceiptId = String(result.response || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 500);
  if (!/^2\d\d(?:\s|$)/.test(providerReceiptId)) {
    throw new Error("SMTP provider accepted the recipient without a usable 2xx receipt");
  }
  return {
    ok: true,
    dryRun: false,
    messageId: submittedMessageId,
    submittedMessageId,
    providerReceiptId,
    accepted,
    rejected,
    identityId: identity.identity_id,
    sendAs,
    mailboxId: mailbox.mailbox_id,
    threaded: Boolean(inReplyTo),
  };
}

export function connectorErrorInfo(error: unknown): ConnectorErrorInfo {
  const value = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const responseCode = Number(value.responseCode || 0) || undefined;
  const code = String(value.code || "SMTP_ERROR");
  const retryable = Boolean(responseCode && [421, 450, 451, 452].includes(responseCode));
  const ambiguous = !responseCode && ["ETIMEDOUT", "ECONNRESET", "ECONNECTION", "ESOCKET"].includes(code);
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/(pass(word)?|auth(orization)?|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 500);
  return { message, code, ...(responseCode ? { responseCode } : {}), retryable, ambiguous };
}
