import type { Batch, ReviewItem } from "../types.ts";
import { normalizeBatch, normalizeItem, utcNow } from "./provider-utils.ts";

export const EMAIL_CONTACT_KIND = "email_contact";

export interface EmailContactRow {
  record_id: string;
  kind: string;
  contact_id: string;
  email: string;
  display_name: string;
  domain: string;
  roles: string;
  source_accounts: string;
  first_seen_at: string;
  last_seen_at: string;
  message_count: number;
  last_subject: string;
  last_message_id: string;
  last_batch_id: string;
  last_status: string;
  last_proposed_action: string;
  category_counts: string;
  risk_tags: string;
  updated_at: string;
  created_at: string;
  [key: string]: unknown;
}

interface ContactAggregate {
  contact_id: string;
  email: string;
  display_name: string;
  domain: string;
  roles: Set<string>;
  sourceAccounts: Set<string>;
  categories: Map<string, number>;
  risks: Set<string>;
  firstSeenAt: string;
  lastSeenAt: string;
  messageCount: number;
  lastSubject: string;
  lastMessageId: string;
  lastBatchId: string;
  lastStatus: string;
  lastProposedAction: string;
}

function text(value: unknown) {
  return String(value ?? "");
}

function dateText(value: unknown) {
  const source = text(value).trim();
  if (!source) return "";
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? source : date.toISOString();
}

function compactText(value: unknown, limit = 1200) {
  const source = text(value).replace(/\s+/g, " ").trim();
  return source.length > limit ? `${source.slice(0, limit).trimEnd()}...` : source;
}

function slugText(value: unknown) {
  return text(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

export function normalizeEmailAddress(value: unknown) {
  const source = text(value).trim();
  if (!source) return "";
  const angleMatch = source.match(/<([^<>@\s]+@[^<>\s]+)>/);
  const plainMatch = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return text(angleMatch?.[1] || plainMatch?.[0])
    .trim()
    .toLowerCase();
}

function displayName(value: unknown, email: string) {
  const source = text(value).trim();
  if (!source) return email;
  const beforeAngle = source.match(/^(.+?)\s*<[^<>@\s]+@[^<>\s]+>/);
  const candidate = text(beforeAngle?.[1] || source.replace(email, ""))
    .replace(/^"|"$/g, "")
    .trim();
  return candidate || email;
}

function domainFor(email: string) {
  return email.includes("@") ? email.split("@").pop() || "" : "";
}

function splitAddresses(value: unknown) {
  return text(value)
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function contactIdFor(email: string) {
  return `contact-${slugText(email) || "unknown"}`;
}

export function emailContactRecordId(email: string) {
  return `email-contact-${slugText(email) || "unknown"}`;
}

function roleEntries(item: ReviewItem) {
  const entries = [];
  if (item.from) entries.push({ role: "sender", source: item.from });
  for (const source of splitAddresses(item.to)) entries.push({ role: "recipient", source });
  for (const source of splitAddresses(item.cc)) entries.push({ role: "cc", source });
  return entries;
}

function mergeContact(contacts: Map<string, ContactAggregate>, item: ReviewItem, batchId: string) {
  const seenInMessage = new Set<string>();
  for (const entry of roleEntries(item)) {
    const email = normalizeEmailAddress(entry.source);
    if (!email) continue;
    const key = contactIdFor(email);
    const current =
      contacts.get(key) ||
      ({
        contact_id: key,
        email,
        display_name: displayName(entry.source, email),
        domain: domainFor(email),
        roles: new Set<string>(),
        sourceAccounts: new Set<string>(),
        categories: new Map<string, number>(),
        risks: new Set<string>(),
        firstSeenAt: dateText(item.date || item.updated_at || utcNow()),
        lastSeenAt: "",
        messageCount: 0,
        lastSubject: "",
        lastMessageId: "",
        lastBatchId: "",
        lastStatus: "",
        lastProposedAction: "",
      } satisfies ContactAggregate);
    current.roles.add(entry.role);
    if (item.account) current.sourceAccounts.add(item.account);
    if (item.category) current.categories.set(item.category, (current.categories.get(item.category) || 0) + 1);
    for (const risk of item.risk || []) current.risks.add(risk);
    const seenAt = dateText(item.date || item.updated_at || utcNow());
    if (seenAt && (!current.firstSeenAt || seenAt < current.firstSeenAt)) current.firstSeenAt = seenAt;
    if (seenAt && (!current.lastSeenAt || seenAt > current.lastSeenAt)) {
      current.lastSeenAt = seenAt;
      current.lastSubject = text(item.subject);
      current.lastMessageId = text(item.message_id || item.thread_id || item.uid);
      current.lastBatchId = batchId;
      current.lastStatus = text(item.status);
      current.lastProposedAction = text(item.proposed_action);
    }
    if (!seenInMessage.has(key)) {
      current.messageCount += 1;
      seenInMessage.add(key);
    }
    contacts.set(key, current);
  }
}

function categoryCountsText(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => `${category}:${count}`)
    .join(", ");
}

export function rowsFromContactsBatch(batch: Batch): EmailContactRow[] {
  const next = normalizeBatch(batch);
  const contacts = new Map<string, ContactAggregate>();
  for (const item of next.items || []) mergeContact(contacts, normalizeItem(item), next.batch_id || "");
  return [...contacts.values()]
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((contact) => ({
      record_id: emailContactRecordId(contact.email),
      kind: EMAIL_CONTACT_KIND,
      contact_id: contact.contact_id,
      email: contact.email,
      display_name: compactText(contact.display_name, 240),
      domain: contact.domain,
      roles: [...contact.roles].sort().join(", "),
      source_accounts: [...contact.sourceAccounts].sort().join(", "),
      first_seen_at: contact.firstSeenAt,
      last_seen_at: contact.lastSeenAt || contact.firstSeenAt,
      message_count: contact.messageCount,
      last_subject: compactText(contact.lastSubject, 400),
      last_message_id: compactText(contact.lastMessageId, 240),
      last_batch_id: contact.lastBatchId,
      last_status: contact.lastStatus,
      last_proposed_action: contact.lastProposedAction,
      category_counts: categoryCountsText(contact.categories),
      risk_tags: [...contact.risks].sort().join(", "),
      updated_at: utcNow(),
      created_at: contact.firstSeenAt || utcNow(),
    }));
}

export function emailContactRefsForItem(item: ReviewItem) {
  const next = normalizeItem(item);
  const senderEmail = normalizeEmailAddress(next.from);
  const recipients = [...splitAddresses(next.to), ...splitAddresses(next.cc)]
    .map(normalizeEmailAddress)
    .filter(Boolean);
  return {
    sender_contact_id: senderEmail ? contactIdFor(senderEmail) : "",
    sender_email: senderEmail,
    sender_domain: domainFor(senderEmail),
    recipient_contact_ids: [...new Set(recipients.map(contactIdFor))].join(", "),
    recipient_emails: [...new Set(recipients)].join(", "),
  };
}
