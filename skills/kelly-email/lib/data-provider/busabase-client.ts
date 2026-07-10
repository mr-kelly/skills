import type { Config } from "../types.ts";

export interface BusabaseClientOptions {
  envPrefix: string;
  config?: Config;
}

export interface BusabaseClientMeta {
  baseUrl: string;
  baseId: string;
  baseSlug: string;
  contactsBaseId: string;
  contactsBaseSlug: string;
  folderSlug: string;
  driveSlug: string;
  driveId: string;
  secretsNamespace: string;
  apiKey: string;
  spaceId: string;
  folderPrefix: string;
  parentNodeId: string;
}

interface BaseRecord {
  id: string;
  nodeId?: string;
  slug?: string;
  fields?: Array<{
    id?: string;
    slug?: string;
    deletedAt?: string | null;
    deleted_at?: string | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface NodeRecord {
  id: string;
  parentId?: string | null;
  type?: string;
  slug?: string;
  name?: string;
  children?: NodeRecord[];
  [key: string]: unknown;
}

interface DriveRecord {
  node: NodeRecord;
  files?: Array<{ path?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface RecordVO {
  id: string;
  baseId?: string;
  updatedAt?: string;
  headCommit?: { fields?: Record<string, unknown> };
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

interface VaultItem {
  key?: string;
  value?: string;
  kind?: string;
  scopeType?: string;
  scopeId?: string | null;
  access?: { runtime?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

function cleanUrl(value: unknown) {
  return String(value || "").replace(/\/$/, "");
}

function configValue(config: Config | undefined, key: string) {
  const busa = config?.busabase || {};
  return busa[key];
}

function cleanOptional(value: unknown) {
  return String(value || "").trim();
}

function slugify(value: unknown, fallback = "kelly-email") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || fallback;
}

export function busabaseMeta({ envPrefix, config = {} }: BusabaseClientOptions): BusabaseClientMeta {
  const env = (name: string) => process.env[`${envPrefix}_${name}`] || "";
  const apiKeyEnv = String(configValue(config, "api_key_env") || `${envPrefix}_BUSABASE_API_KEY`);
  const baseId = String(env("BUSABASE_BASE_ID") || configValue(config, "base_id") || "kelly-email");
  const configuredBaseSlug = cleanOptional(env("BUSABASE_BASE_SLUG") || configValue(config, "base_slug"));
  const baseSlug = configuredBaseSlug ? slugify(configuredBaseSlug) : /^[a-z0-9-]+$/.test(baseId) ? baseId : "";
  const contactsBaseId = String(
    env("BUSABASE_CONTACTS_BASE_ID") || configValue(config, "contacts_base_id") || `${baseId}-contacts`,
  );
  const configuredContactsBaseSlug = cleanOptional(
    env("BUSABASE_CONTACTS_BASE_SLUG") || configValue(config, "contacts_base_slug"),
  );
  const contactsBaseSlug = configuredContactsBaseSlug
    ? slugify(configuredContactsBaseSlug)
    : `${baseSlug || slugify(baseId)}-contacts`;
  const defaultFolderSlug = `${baseSlug || slugify(baseId)}-workspace`;
  const folderSlug = slugify(env("BUSABASE_FOLDER_SLUG") || configValue(config, "folder_slug") || defaultFolderSlug);
  const driveSlug = slugify(env("BUSABASE_DRIVE_SLUG") || configValue(config, "drive_slug") || `${folderSlug}-files`);
  return {
    baseUrl: cleanUrl(env("BUSABASE_URL") || configValue(config, "base_url") || "http://127.0.0.1:15419"),
    baseId,
    baseSlug,
    contactsBaseId,
    contactsBaseSlug,
    folderSlug,
    driveSlug,
    driveId: String(env("BUSABASE_DRIVE_ID") || configValue(config, "drive_id") || "kelly-email-files"),
    secretsNamespace: String(
      env("BUSABASE_SECRETS_NAMESPACE") || configValue(config, "secrets_namespace") || "kelly-email",
    ),
    apiKey: process.env[apiKeyEnv] || env("BUSABASE_API_KEY") || "",
    spaceId: cleanOptional(
      env("BUSABASE_SPACE_ID") || configValue(config, "space_id") || process.env.BUSABASE_SPACE_ID,
    ),
    folderPrefix: cleanOptional(env("BUSABASE_FOLDER_PREFIX") || configValue(config, "folder_prefix")),
    parentNodeId: cleanOptional(env("BUSABASE_PARENT_NODE_ID") || configValue(config, "parent_node_id")),
  };
}

const BASE_FIELDS = [
  { slug: "record_id", name: "Record ID", type: "text", required: true },
  { slug: "kind", name: "Kind", type: "text" },
  { slug: "batch_id", name: "Batch ID", type: "text" },
  { slug: "item_id", name: "Item ID", type: "text" },
  { slug: "email_uid", name: "Email UID", type: "text" },
  { slug: "thread_id", name: "Thread ID", type: "text" },
  { slug: "message_id", name: "Message ID", type: "text" },
  { slug: "folder", name: "Folder", type: "text" },
  { slug: "subject", name: "Subject", type: "text" },
  { slug: "sender", name: "Sender", type: "text" },
  { slug: "sender_contact_id", name: "Sender Contact ID", type: "text" },
  { slug: "sender_email", name: "Sender Email", type: "text" },
  { slug: "sender_domain", name: "Sender Domain", type: "text" },
  { slug: "recipients", name: "Recipients", type: "longtext" },
  { slug: "recipient_contact_ids", name: "Recipient Contact IDs", type: "longtext" },
  { slug: "recipient_emails", name: "Recipient Emails", type: "longtext" },
  { slug: "cc", name: "CC", type: "longtext" },
  { slug: "source_account", name: "Source Account", type: "text" },
  { slug: "email_date", name: "Email Date", type: "date" },
  { slug: "category", name: "Category", type: "text" },
  { slug: "risk", name: "Risk", type: "text" },
  { slug: "reason", name: "Reason", type: "longtext" },
  { slug: "summary", name: "Summary", type: "longtext" },
  { slug: "review_background", name: "Review Background", type: "longtext" },
  { slug: "review_recommendation", name: "Review Recommendation", type: "longtext" },
  { slug: "review_why", name: "Review Why", type: "longtext" },
  { slug: "body_text", name: "Body Text", type: "longtext" },
  { slug: "body_original", name: "Body Original", type: "longtext" },
  { slug: "body_translation", name: "Body Translation", type: "longtext" },
  { slug: "body_excerpt", name: "Body Excerpt", type: "longtext" },
  { slug: "quote_preview", name: "Quote Preview", type: "longtext" },
  { slug: "html_excerpt", name: "HTML Excerpt", type: "longtext" },
  { slug: "draft_text", name: "Draft Text", type: "longtext" },
  { slug: "suggested_reply", name: "Suggested Reply", type: "longtext" },
  { slug: "draft_excerpt", name: "Draft Excerpt", type: "longtext" },
  { slug: "user_comment", name: "User Comment", type: "longtext" },
  { slug: "decision_action", name: "Decision Action", type: "text" },
  { slug: "decided_at", name: "Decided At", type: "date" },
  { slug: "execution_status", name: "Execution Status", type: "text" },
  { slug: "mailbox_operation", name: "Mailbox Operation", type: "text" },
  { slug: "target_folder", name: "Target Folder", type: "text" },
  { slug: "executed_at", name: "Executed At", type: "date" },
  { slug: "execution_reason", name: "Execution Reason", type: "longtext" },
  { slug: "execution_error", name: "Execution Error", type: "longtext" },
  { slug: "has_html", name: "Has HTML", type: "checkbox" },
  { slug: "has_draft", name: "Has Draft", type: "checkbox" },
  { slug: "has_translation", name: "Has Translation", type: "checkbox" },
  { slug: "has_attachments", name: "Has Attachments", type: "checkbox" },
  { slug: "drive_path", name: "Drive Path", type: "text" },
  { slug: "html_drive_path", name: "HTML Drive Path", type: "text" },
  { slug: "attachments_drive_path", name: "Attachments Drive Path", type: "text" },
  { slug: "attachment_count", name: "Attachment Count", type: "number" },
  { slug: "attachment_names", name: "Attachment Names", type: "longtext" },
  { slug: "attachment_refs", name: "Attachment Refs", type: "longtext" },
  { slug: "classification_method", name: "Classification Method", type: "text" },
  { slug: "user_language", name: "User Language", type: "text" },
  { slug: "source_language", name: "Source Language", type: "text" },
  { slug: "body_original_language", name: "Original Language", type: "text" },
  { slug: "body_translation_language", name: "Translation Language", type: "text" },
  { slug: "status", name: "Status", type: "text" },
  { slug: "proposed_action", name: "Proposed Action", type: "text" },
  { slug: "updated_at", name: "Updated At", type: "date" },
  { slug: "created_at", name: "Created At", type: "date" },
  { slug: "cleared_at", name: "Cleared At", type: "date" },
  { slug: "report", name: "Report", type: "json" },
  { slug: "latest_record_id", name: "Latest Record ID", type: "text" },
] as const;

const CONTACT_BASE_FIELDS = [
  { slug: "record_id", name: "Record ID", type: "text", required: true },
  { slug: "kind", name: "Kind", type: "text" },
  { slug: "contact_id", name: "Contact ID", type: "text" },
  { slug: "email", name: "Email", type: "text" },
  { slug: "display_name", name: "Display Name", type: "text" },
  { slug: "domain", name: "Domain", type: "text" },
  { slug: "roles", name: "Roles", type: "text" },
  { slug: "source_accounts", name: "Source Accounts", type: "text" },
  { slug: "first_seen_at", name: "First Seen At", type: "date" },
  { slug: "last_seen_at", name: "Last Seen At", type: "date" },
  { slug: "message_count", name: "Message Count", type: "number" },
  { slug: "last_subject", name: "Last Subject", type: "text" },
  { slug: "last_message_id", name: "Last Message ID", type: "text" },
  { slug: "last_batch_id", name: "Last Batch ID", type: "text" },
  { slug: "last_status", name: "Last Status", type: "text" },
  { slug: "last_proposed_action", name: "Last Proposed Action", type: "text" },
  { slug: "category_counts", name: "Category Counts", type: "longtext" },
  { slug: "risk_tags", name: "Risk Tags", type: "text" },
  { slug: "notes", name: "Notes", type: "longtext" },
  { slug: "default_action", name: "Default Action", type: "text" },
  { slug: "updated_at", name: "Updated At", type: "date" },
  { slug: "created_at", name: "Created At", type: "date" },
] as const;

const RETIRED_BASE_FIELD_SLUGS = new Set(["item"]);

const JSON_FIELD_SLUGS: ReadonlySet<string> = new Set(
  BASE_FIELDS.filter((field) => field.type === "json").map((field) => field.slug),
);

export function createBusabaseClient(options: BusabaseClientOptions) {
  const meta = busabaseMeta(options);
  let folderPromise: Promise<NodeRecord> | null = null;
  let basePromise: Promise<BaseRecord> | null = null;
  let contactsBasePromise: Promise<BaseRecord> | null = null;
  let drivePromise: Promise<DriveRecord> | null = null;
  let vaultPromise: Promise<Record<string, string>> | null = null;
  const recordCache = new Map<string, RecordVO>();
  const contactsRecordCache = new Map<string, RecordVO>();

  function requireConfig() {
    if (!meta.baseUrl || !meta.baseId) {
      throw new Error("Busabase provider needs base_url and base_id.");
    }
  }

  async function api(method: string, pathname: string, body?: unknown): Promise<any> {
    requireConfig();
    const res = await fetch(`${meta.baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(meta.apiKey ? { authorization: `Bearer ${meta.apiKey}` } : {}),
        ...(meta.spaceId ? { "x-busabase-space": meta.spaceId } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function listNodes(): Promise<NodeRecord[]> {
    const nodes = await api("GET", "/api/v1/nodes");
    return Array.isArray(nodes) ? nodes : [];
  }

  async function listBases(): Promise<BaseRecord[]> {
    const bases = await api("GET", "/api/v1/bases");
    return Array.isArray(bases) ? bases : [];
  }

  async function listDrives(): Promise<DriveRecord[]> {
    const drives = await api("GET", "/api/v1/drives");
    return Array.isArray(drives) ? drives : [];
  }

  function flattenNodes(nodes: NodeRecord[]): NodeRecord[] {
    const all: NodeRecord[] = [];
    const visit = (node: NodeRecord) => {
      all.push(node);
      for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
    };
    for (const node of nodes) visit(node);
    return all;
  }

  function findNodeBySlug(nodes: NodeRecord[], slug: string, type?: string) {
    return flattenNodes(nodes).find((node) => node.slug === slug && (!type || node.type === type)) || null;
  }

  function findConfiguredBase(bases: BaseRecord[], target = { id: meta.baseId, slug: meta.baseSlug }) {
    return bases.find((base) => base.id === target.id || base.slug === target.id || base.slug === target.slug);
  }

  function findDriveBySlug(drives: DriveRecord[], slug: string) {
    return drives.find((drive) => drive.node?.slug === slug || drive.node?.id === slug) || null;
  }

  async function moveNodeToFolder(node: NodeRecord, folder: NodeRecord, message: string) {
    if (!node.id || !folder.id || node.parentId === folder.id) return;
    const changeRequest = await api("POST", "/api/v1/nodes/change-requests", {
      message,
      submittedBy: "kelly-email",
      autoMerge: true,
      operations: [{ kind: "move", nodeId: node.id, parentNodeId: folder.id }],
    });
    if (changeRequest.status !== "merged") await approveAndMerge(String(changeRequest.id));
  }

  function recordFields(record: unknown): Record<string, unknown> {
    const rec = (record || {}) as Record<string, unknown>;
    const head = (rec.headCommit || {}) as Record<string, unknown>;
    return deserializeFields((head.fields as Record<string, unknown>) || (rec.fields as Record<string, unknown>) || {});
  }

  function serializeFields(fields: Record<string, unknown>) {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      next[key] = JSON_FIELD_SLUGS.has(key) && typeof value !== "string" ? JSON.stringify(value) : value;
    }
    return next;
  }

  function deserializeFields(fields: Record<string, unknown>) {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields || {})) {
      if (!JSON_FIELD_SLUGS.has(key) || typeof value !== "string" || !value.trim()) {
        next[key] = value;
        continue;
      }
      try {
        next[key] = JSON.parse(value);
      } catch {
        next[key] = value;
      }
    }
    return next;
  }

  async function approveAndMerge(changeRequestId: string) {
    await api("POST", `/api/v1/change-requests/${encodeURIComponent(changeRequestId)}/reviews`, {
      verdict: "approved",
      reason: "Kelly Email app-owned state",
    });
    return api("POST", `/api/v1/change-requests/${encodeURIComponent(changeRequestId)}/merge`, {});
  }

  async function ensureFolder(): Promise<NodeRecord> {
    if (folderPromise) return folderPromise;
    folderPromise = (async () => {
      const existing = findNodeBySlug(await listNodes(), meta.folderSlug, "folder");
      if (existing) return existing;
      const changeRequest = await api("POST", "/api/v1/nodes/change-requests", {
        message: "Initialize Kelly Email workspace folder",
        submittedBy: "kelly-email",
        autoMerge: true,
        operations: [
          {
            kind: "create",
            nodeType: "folder",
            slug: meta.folderSlug,
            name: "Kelly Email",
            description: "Kelly Email App-in-Skill storage: review Base plus app-state Drive.",
            ...(meta.parentNodeId ? { parentNodeId: meta.parentNodeId } : {}),
          },
        ],
      });
      if (changeRequest.status !== "merged") await approveAndMerge(String(changeRequest.id));
      const created = findNodeBySlug(await listNodes(), meta.folderSlug, "folder");
      if (!created) throw new Error(`Busabase folder was not created: ${meta.folderSlug}`);
      return created;
    })().catch((error) => {
      folderPromise = null;
      throw error;
    });
    return folderPromise;
  }

  async function ensureNamedBase(options: {
    id: string;
    slug: string;
    name: string;
    description: string;
    fields: readonly Record<string, unknown>[];
    cacheLabel: string;
  }): Promise<BaseRecord> {
    const bases = await listBases();
    const existing = findConfiguredBase(bases, { id: options.id, slug: options.slug });
    const folder = await ensureFolder();
    if (existing) {
      const node = findNodeBySlug(await listNodes(), existing.slug || options.slug, "base");
      if (node) await moveNodeToFolder(node, folder, `Move Kelly Email ${options.name} Base under workspace folder`);
      return ensureBaseFields(existing, options.fields, options.cacheLabel);
    }
    if (!options.slug) {
      throw new Error(`Busabase base "${options.id}" does not exist and no slug is configured to create it lazily.`);
    }
    const created = await api("POST", "/api/v1/bases", {
      parentNodeId: folder.id,
      slug: options.slug,
      name: options.name,
      description: options.description,
      fields: options.fields,
    });
    if (created?.status && created.status !== "merged") {
      await approveAndMerge(String(created.id));
    }
    const base = findConfiguredBase(await listBases(), { id: options.id, slug: options.slug });
    if (!base) throw new Error(`Busabase ${options.cacheLabel} was not created: ${options.slug || options.id}`);
    return base;
  }

  async function ensureBase(): Promise<BaseRecord> {
    if (basePromise) return basePromise;
    basePromise = ensureNamedBase({
      id: meta.baseId,
      slug: meta.baseSlug,
      name: "Kelly Email Emails",
      description: "Structured Kelly Email review email rows and execution reports.",
      fields: BASE_FIELDS,
      cacheLabel: "Base",
    }).catch((error) => {
      basePromise = null;
      throw error;
    });
    return basePromise;
  }

  async function ensureContactsBase(): Promise<BaseRecord> {
    if (contactsBasePromise) return contactsBasePromise;
    contactsBasePromise = ensureNamedBase({
      id: meta.contactsBaseId,
      slug: meta.contactsBaseSlug,
      name: "Kelly Email Contacts",
      description: "Aggregated Kelly Email contacts linked from review email rows.",
      fields: CONTACT_BASE_FIELDS,
      cacheLabel: "Contacts Base",
    }).catch((error) => {
      contactsBasePromise = null;
      throw error;
    });
    return contactsBasePromise;
  }

  async function ensureBaseFields(
    base: BaseRecord,
    wantedFields: readonly Record<string, unknown>[] = BASE_FIELDS,
    label = "Base",
  ): Promise<BaseRecord> {
    const fields = Array.isArray(base.fields) ? base.fields : [];
    const activeFields = fields.filter((field) => !field.deletedAt && !field.deleted_at);
    const slugs = new Set(activeFields.map((field) => String(field.slug || "")));
    const missing = wantedFields.filter((field) => !slugs.has(String(field.slug || "")));
    for (const field of missing) {
      const changeRequest = await api("POST", `/api/v1/bases/${encodeURIComponent(base.id)}/fields/change-requests`, {
        slug: field.slug,
        name: field.name,
        type: field.type,
        required: Boolean("required" in field && field.required),
        message: `Add Kelly Email ${label} field ${field.slug}`,
        submittedBy: "kelly-email",
      });
      if (changeRequest.status !== "merged") await approveAndMerge(String(changeRequest.id));
    }
    const retired = activeFields.filter((field) => RETIRED_BASE_FIELD_SLUGS.has(String(field.slug || "")) && field.id);
    for (const field of retired) {
      const changeRequest = await api("DELETE", `/api/v1/bases/${encodeURIComponent(base.id)}/fields/change-requests`, {
        fieldId: String(field.id),
        message: `Remove retired Kelly Email ${label} field ${field.slug}`,
        submittedBy: "kelly-email",
      });
      if (changeRequest.status !== "merged") await approveAndMerge(String(changeRequest.id));
    }
    if (!missing.length && !retired.length) return base;
    return findConfiguredBase(await listBases(), { id: base.id, slug: String(base.slug || "") }) || base;
  }

  async function ensureDrive(): Promise<DriveRecord> {
    if (drivePromise) return drivePromise;
    drivePromise = (async () => {
      const existing = findDriveBySlug(await listDrives(), meta.driveSlug);
      const folder = await ensureFolder();
      if (existing) {
        await moveNodeToFolder(existing.node, folder, "Move Kelly Email Drive under workspace folder");
        return findDriveBySlug(await listDrives(), meta.driveSlug) || existing;
      }
      return api("POST", "/api/v1/drives", {
        parentNodeId: folder.id,
        slug: meta.driveSlug,
        name: "Kelly Email Files",
        description: "Kelly Email schema, current batch, decisions, locks, config snapshots, and attachments.",
        visibility: "private",
        version: "1",
        files: [
          {
            path: "README.md",
            content:
              "# Kelly Email Files\n\nApp-state Drive for Kelly Email. Blob snapshots live here; structured email/contact rows live in Kelly Email Bases.\n",
            mimeType: "text/markdown",
          },
        ],
      });
    })().catch((error) => {
      drivePromise = null;
      throw error;
    });
    return drivePromise;
  }

  async function listRecords(baseId: string): Promise<RecordVO[]> {
    const all: RecordVO[] = [];
    let cursor = "";
    do {
      const query = new URLSearchParams({ limit: "100", baseId });
      if (cursor) query.set("cursor", cursor);
      const page = await api("GET", `/api/v1/records/paged?${query.toString()}`);
      const records = Array.isArray(page?.records) ? page.records : Array.isArray(page) ? page : [];
      all.push(...(records as RecordVO[]));
      cursor = String(page?.nextCursor || "");
    } while (cursor);
    return all;
  }

  async function configuredBaseReadOnly(): Promise<BaseRecord | null> {
    return findConfiguredBase(await listBases()) || null;
  }

  async function configuredContactsBaseReadOnly(): Promise<BaseRecord | null> {
    return findConfiguredBase(await listBases(), { id: meta.contactsBaseId, slug: meta.contactsBaseSlug }) || null;
  }

  async function configuredDriveReadOnly(): Promise<DriveRecord | null> {
    return findDriveBySlug(await listDrives(), meta.driveSlug);
  }

  async function findRecordByAppIdInBase(
    recordId: string,
    target: {
      cache: Map<string, RecordVO>;
      ensure: () => Promise<BaseRecord>;
      readOnly: () => Promise<BaseRecord | null>;
    },
    options: { createBase?: boolean } = {},
  ): Promise<RecordVO | null> {
    const cached = target.cache.get(recordId);
    if (cached) return cached;
    const base = options.createBase === false ? await target.readOnly() : await target.ensure();
    if (!base) return null;
    const records = await listRecords(base.id);
    const matches = records
      .filter((record) => String(recordFields(record).record_id || "") === recordId)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const record = matches[0] || null;
    if (record) target.cache.set(recordId, record);
    return record;
  }

  async function findRecordByAppId(recordId: string, options: { createBase?: boolean } = {}): Promise<RecordVO | null> {
    return findRecordByAppIdInBase(
      recordId,
      { cache: recordCache, ensure: ensureBase, readOnly: configuredBaseReadOnly },
      options,
    );
  }

  async function findContactRecordByAppId(
    recordId: string,
    options: { createBase?: boolean } = {},
  ): Promise<RecordVO | null> {
    return findRecordByAppIdInBase(
      recordId,
      { cache: contactsRecordCache, ensure: ensureContactsBase, readOnly: configuredContactsBaseReadOnly },
      options,
    );
  }

  async function getRecordFields(
    recordId: string,
    options: { createBase?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const record = await findRecordByAppId(recordId, options);
    if (!record) throw new Error(`Busabase record not found: ${recordId}`);
    return recordFields(record);
  }

  async function getContactRecordFields(
    recordId: string,
    options: { createBase?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const record = await findContactRecordByAppId(recordId, options);
    if (!record) throw new Error(`Busabase contact record not found: ${recordId}`);
    return recordFields(record);
  }

  async function listRecordFields(options: { createBase?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const base = options.createBase === false ? await configuredBaseReadOnly() : await ensureBase();
    if (!base) return [];
    return (await listRecords(base.id)).map(recordFields);
  }

  async function listContactRecordFields(options: { createBase?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const base = options.createBase === false ? await configuredContactsBaseReadOnly() : await ensureContactsBase();
    if (!base) return [];
    return (await listRecords(base.id)).map(recordFields);
  }

  async function upsertRecordInBase(
    recordId: string,
    fields: Record<string, unknown>,
    message: string,
    target: {
      cache: Map<string, RecordVO>;
      ensure: () => Promise<BaseRecord>;
      find: (recordId: string) => Promise<RecordVO | null>;
    },
  ) {
    const base = await target.ensure();
    const existing = await target.find(recordId);
    const nextFields = serializeFields({ record_id: recordId, ...fields });
    const changeRequest = existing
      ? await api("PUT", `/api/v1/records/${encodeURIComponent(existing.id)}/change-requests`, {
          fields: nextFields,
          message,
          author: "kelly-email",
        })
      : await api("POST", `/api/v1/bases/${encodeURIComponent(base.id)}/change-requests`, {
          fields: nextFields,
          message,
          submittedBy: "kelly-email",
        });
    const merged = await approveAndMerge(String(changeRequest.id));
    const record = (merged?.record || null) as RecordVO | null;
    if (record) target.cache.set(recordId, record);
    else target.cache.delete(recordId);
    return merged;
  }

  async function upsertRecord(recordId: string, fields: Record<string, unknown>, message: string) {
    return upsertRecordInBase(recordId, fields, message, {
      cache: recordCache,
      ensure: ensureBase,
      find: findRecordByAppId,
    });
  }

  async function upsertContactRecord(recordId: string, fields: Record<string, unknown>, message: string) {
    return upsertRecordInBase(recordId, fields, message, {
      cache: contactsRecordCache,
      ensure: ensureContactsBase,
      find: findContactRecordByAppId,
    });
  }

  function driveFilePath(pathname: string) {
    return pathname.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  async function vaultRuntimeEnv(): Promise<Record<string, string>> {
    if (vaultPromise) return vaultPromise;
    vaultPromise = (async () => {
      const settings = await api("GET", "/api/v1/vault");
      const items = Array.isArray(settings?.items) ? (settings.items as VaultItem[]) : [];
      return Object.fromEntries(
        items
          .filter((item) => item?.access?.runtime !== false)
          .filter((item) => !meta.secretsNamespace || !item.scopeId || item.scopeId === meta.secretsNamespace)
          .map((item) => [String(item.key || "").trim(), String(item.value || "")])
          .filter(([key, value]) => key && value),
      );
    })().catch((error) => {
      vaultPromise = null;
      throw error;
    });
    return vaultPromise;
  }

  async function getSecret(name: string) {
    const key = String(name || "").trim();
    if (!key) return "";
    const runtimeEnv = await vaultRuntimeEnv();
    return runtimeEnv[key] || "";
  }

  async function readDriveText(pathname: string, options: { createDrive?: boolean } = {}): Promise<string> {
    const drive = options.createDrive === false ? await configuredDriveReadOnly() : await ensureDrive();
    if (!drive) throw new Error(`Busabase drive not found: ${meta.driveSlug}`);
    const file = await api(
      "GET",
      `/api/v1/drives/${encodeURIComponent(drive.node.id)}/files/${driveFilePath(pathname)}`,
    );
    return String(file?.content || "");
  }

  async function readDriveJson(
    pathname: string,
    options: { createDrive?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const text = await readDriveText(pathname, options);
    return text ? JSON.parse(text) : {};
  }

  async function writeDriveText(pathname: string, content: string, message: string, mimeType = "application/json") {
    const drive = await ensureDrive();
    const exists = (drive.files || []).some((file) => file.path === pathname);
    const changeRequest = await api("POST", `/api/v1/drives/${encodeURIComponent(drive.node.id)}/change-requests`, {
      message,
      submittedBy: "kelly-email",
      operations: [
        {
          kind: exists ? "update" : "create",
          path: pathname,
          content,
          mimeType,
        },
      ],
    });
    const merged = await approveAndMerge(String(changeRequest.id));
    drivePromise = null;
    return merged;
  }

  async function writeDriveJson(pathname: string, value: unknown, message: string) {
    return writeDriveText(pathname, `${JSON.stringify(value, null, 2)}\n`, message, "application/json");
  }

  async function putDriveFile(pathname: string, data: unknown, metaFields: Record<string, unknown> = {}) {
    const payload = { data, meta: metaFields, updated_at: new Date().toISOString() };
    await writeDriveJson(pathname, payload, `Drive file ${pathname}`);
    return { drive_id: meta.driveId, drive_slug: meta.driveSlug, path: pathname };
  }

  async function getDriveFile(pathname: string) {
    return readDriveJson(pathname);
  }

  return {
    meta,
    api,
    listNodes,
    listBases,
    listDrives,
    configuredBaseReadOnly,
    configuredContactsBaseReadOnly,
    configuredDriveReadOnly,
    ensureFolder,
    ensureBase,
    ensureContactsBase,
    ensureDrive,
    getRecordFields,
    getContactRecordFields,
    listRecordFields,
    listContactRecordFields,
    upsertRecord,
    upsertContactRecord,
    commitRecord: upsertRecord,
    readDriveText,
    readDriveJson,
    writeDriveText,
    writeDriveJson,
    putDriveFile,
    getDriveFile,
    getSecret,
    vaultRuntimeEnv,
    async verifyConnection() {
      const [nodes, bases, drives] = await Promise.all([listNodes(), listBases(), listDrives()]);
      const folder = findNodeBySlug(nodes, meta.folderSlug, "folder");
      const base = findConfiguredBase(bases);
      const contactsBase = findConfiguredBase(bases, { id: meta.contactsBaseId, slug: meta.contactsBaseSlug });
      const drive = findDriveBySlug(drives, meta.driveSlug);
      return {
        ok: true,
        folder_exists: Boolean(folder),
        base_exists: Boolean(base),
        contacts_base_exists: Boolean(contactsBase),
        drive_exists: Boolean(drive),
        base_url: meta.baseUrl,
        base_id: meta.baseId,
        base_slug: base?.slug || meta.baseSlug,
        resolved_base_id: base?.id || "",
        contacts_base_id: meta.contactsBaseId,
        contacts_base_slug: contactsBase?.slug || meta.contactsBaseSlug,
        resolved_contacts_base_id: contactsBase?.id || "",
        folder_slug: meta.folderSlug,
        folder_node_id: folder?.id || "",
        drive_slug: meta.driveSlug,
        drive_node_id: drive?.node?.id || "",
        drive_id: meta.driveId,
        secrets_namespace: meta.secretsNamespace,
        api_key: meta.apiKey ? "configured" : "none",
        space_id: meta.spaceId || "",
        folder_prefix: meta.folderPrefix || "",
        parent_node_id: meta.parentNodeId || "",
      };
    },
  };
}
