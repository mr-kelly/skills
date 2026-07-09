import type { Batch, Config, ConfigWithMeta, DecisionsPayload } from "../types.ts";
import { createBusabaseClient } from "./busabase-client.ts";
import { BUSABASE_LEGACY_RECORDS, BUSABASE_SCHEMA, schemaFingerprint } from "./busabase-schema.ts";
import { CONFIG_EXAMPLE_PATH } from "./local-file-provider.ts";
import type { AttachmentInput, AttachmentResult, DecisionInput, DetailInput } from "./provider-interface.ts";
import {
  applyDetailUpdate,
  applyItemsDecision,
  decisionsFromBatch,
  emptyBatch,
  normalizeBatch,
  utcNow,
} from "./provider-utils.ts";

const ENV_PREFIX = "KELLY_EMAIL";
const LEGACY_RECORDS = BUSABASE_LEGACY_RECORDS;
const DRIVE_FILES = {
  config: "config/config.json",
  schema: "state/schema.json",
  currentBatch: "state/current_batch.json",
  decisions: "state/decisions.json",
  lock: "state/lock.json",
  scanState: "state/scan_state.json",
} as const;
const DEFAULT_LOCK_MESSAGE = "/kelly-email is processing this batch.";

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function emptyDecisions(batchId = ""): DecisionsPayload {
  return { batch_id: batchId, updated_at: "", decisions: [] };
}

function secretRef(endpoint: unknown) {
  const data = asObject(endpoint);
  return String(data.vault_ref || data.password_vault_ref || data.secret_ref || data.password_env || "").trim();
}

function compactText(value: unknown, limit = 1200) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}

function safeDate(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function itemAttachments(item: Record<string, any>) {
  return Array.isArray(item.attachments)
    ? item.attachments.map((attachment: Record<string, any>) => ({
        filename: attachment.filename || "",
        content_type: attachment.content_type || attachment.contentType || "",
        size: attachment.size || 0,
        url: attachment.url || "",
        preview: Boolean(attachment.preview),
      }))
    : [];
}

function reviewBrief(item: Record<string, any>) {
  return asObject(item.review_brief);
}

function baseRowFields(item: Record<string, any>, batchId: string) {
  const attachments = itemAttachments(item);
  const brief = reviewBrief(item);
  return {
    kind: "review_item",
    batch_id: batchId,
    item_id: item.id,
    email_uid: compactText(item.uid, 80),
    thread_id: compactText(item.thread_id, 240),
    message_id: compactText(item.message_id, 240),
    folder: compactText(item.folder, 120),
    subject: compactText(item.subject, 240),
    sender: compactText(item.from, 240),
    recipients: compactText(item.to, 800),
    cc: compactText(item.cc, 800),
    source_account: compactText(item.account, 120),
    email_date: safeDate(item.date),
    category: compactText(item.category, 80),
    risk: Array.isArray(item.risk) ? item.risk.join(",") : "",
    reason: compactText(item.reason, 1200),
    summary: compactText(item.summary, 1800),
    review_background: compactText(brief.background, 1200),
    review_recommendation: compactText(brief.recommendation, 1200),
    body_excerpt: compactText(item.body || item.body_original, 1800),
    draft_excerpt: compactText(item.draft || item.suggested_reply, 1200),
    user_comment: compactText(item.user_comment, 1200),
    has_html: Boolean(item.has_html || item.html),
    has_draft: Boolean(String(item.draft || item.suggested_reply || "").trim()),
    has_translation: Boolean(String(item.body_translation || "").trim()),
    has_attachments: attachments.length > 0,
    drive_path: batchId ? `batches/${batchId}.json` : DRIVE_FILES.currentBatch,
    attachment_count: attachments.length,
    attachment_names: compactText(
      attachments
        .map((attachment) => attachment.filename)
        .filter(Boolean)
        .join(", "),
      1200,
    ),
    classification_method: compactText(item.classification_method, 120),
    user_language: compactText(item.user_language, 40),
    source_language: compactText(item.source_language || item.body_original_language, 40),
    status: item.status,
    proposed_action: item.proposed_action,
    updated_at: item.updated_at,
  };
}

export function createBusabaseProvider() {
  let configMetaPromise: Promise<ConfigWithMeta> | null = null;
  let clientPromise: ReturnType<typeof createBusabaseClient> | null = null;

  function bootstrapConfig(): Config {
    return {
      busabase: {
        base_url: process.env.KELLY_EMAIL_BUSABASE_URL || "http://127.0.0.1:15419",
        base_id: process.env.KELLY_EMAIL_BUSABASE_BASE_ID || "kelly-email",
        base_slug: process.env.KELLY_EMAIL_BUSABASE_BASE_SLUG || "kelly-email",
        folder_slug: process.env.KELLY_EMAIL_BUSABASE_FOLDER_SLUG || "kelly-email-workspace",
        drive_slug: process.env.KELLY_EMAIL_BUSABASE_DRIVE_SLUG || "kelly-email-workspace-files",
        drive_id: process.env.KELLY_EMAIL_BUSABASE_DRIVE_ID || "kelly-email-files",
        secrets_namespace: process.env.KELLY_EMAIL_BUSABASE_SECRETS_NAMESPACE || "kelly-email",
        api_key_env: "KELLY_EMAIL_BUSABASE_API_KEY",
        space_id: process.env.KELLY_EMAIL_BUSABASE_SPACE_ID || process.env.BUSABASE_SPACE_ID || "",
      },
    };
  }

  async function client() {
    if (!clientPromise) clientPromise = createBusabaseClient({ envPrefix: ENV_PREFIX, config: bootstrapConfig() });
    return clientPromise;
  }

  function normalizeConfig(value: unknown): Config {
    const object = asObject(value);
    const config =
      asObject(object.data).mailboxes || asObject(object.data).identities
        ? (object.data as Config)
        : (object as Config);
    if (!Array.isArray(config.mailboxes)) config.mailboxes = [];
    if (!Array.isArray(config.identities)) config.identities = [];
    return config;
  }

  function configSecretRefs(config: Config) {
    const refs = [];
    for (const mailbox of config.mailboxes || []) {
      for (const endpoint of [mailbox.imap, mailbox.smtp]) {
        const ref = secretRef(endpoint);
        if (ref) refs.push(ref);
      }
    }
    return [...new Set(refs)];
  }

  async function driveConfigMeta(): Promise<ConfigWithMeta> {
    const busa = await client();
    try {
      const config = normalizeConfig(await busa.readDriveJson(DRIVE_FILES.config, { createDrive: false }));
      const vaultRefs = configSecretRefs(config);
      const runtimeEnv = await busa.vaultRuntimeEnv().catch(() => ({}));
      const missingVaultRefs = vaultRefs.filter((ref) => !runtimeEnv[ref]);
      return {
        config,
        source: `busabase:drive/${DRIVE_FILES.config}`,
        reader: "busabase",
        provider: "busabase",
        is_example: false,
        has_private_config: true,
        vault_refs: vaultRefs,
        missing_vault_refs: missingVaultRefs,
        recommended_config: `busabase:drive/${DRIVE_FILES.config}`,
        recommended_env: `busabase:vault/${busa.meta.secretsNamespace}`,
        example_config: CONFIG_EXAMPLE_PATH,
      };
    } catch {
      return {
        config: { mailboxes: [], identities: [] },
        source: "",
        reader: "busabase",
        provider: "busabase",
        is_example: false,
        has_private_config: false,
        recommended_config: `busabase:drive/${DRIVE_FILES.config}`,
        recommended_env: `busabase:vault/${busa.meta.secretsNamespace}`,
        example_config: CONFIG_EXAMPLE_PATH,
      };
    }
  }

  async function configMeta() {
    if (!configMetaPromise) configMetaPromise = driveConfigMeta();
    return configMetaPromise;
  }

  async function commit(recordId: string, fields: Record<string, unknown>, message: string) {
    const busa = await client();
    return busa.upsertRecord(recordId, fields, message);
  }

  async function readFields(recordId: string): Promise<Record<string, any>> {
    const busa = await client();
    return busa.getRecordFields(recordId);
  }

  async function readDriveJson(pathname: string): Promise<Record<string, any>> {
    const busa = await client();
    return busa.readDriveJson(pathname) as Promise<Record<string, any>>;
  }

  async function writeDriveJson(pathname: string, value: unknown, message: string) {
    const busa = await client();
    return busa.writeDriveJson(pathname, value, message);
  }

  async function writeBatchSnapshot(batch: Batch, options: { archive?: boolean } = {}) {
    await writeDriveJson(DRIVE_FILES.currentBatch, batch, `Kelly Email batch ${batch.batch_id || "current"}`);
    if (options.archive && batch.batch_id) {
      await writeDriveJson(`batches/${batch.batch_id}.json`, batch, `Kelly Email batch archive ${batch.batch_id}`);
    }
  }

  async function writeBaseRows(batch: Batch, itemIds?: string[]) {
    const wanted = itemIds ? new Set(itemIds.map(String)) : null;
    for (const item of batch.items || []) {
      if (wanted && !wanted.has(String(item.id))) continue;
      await commit(
        `email-item-${item.id}`,
        baseRowFields(item as Record<string, any>, batch.batch_id || ""),
        `Review item ${item.subject || item.id}`,
      );
    }
  }

  async function schemaStatus(options: { createBase?: boolean } = {}) {
    const busa = await client();
    const expected = schemaFingerprint();
    try {
      const fields = await busa.readDriveJson(DRIVE_FILES.schema, { createDrive: options.createBase !== false });
      const current = String(fields.fingerprint || "");
      return {
        ok:
          fields.schema_id === BUSABASE_SCHEMA.schema_id &&
          fields.schema_version === BUSABASE_SCHEMA.schema_version &&
          current === expected,
        initialized: Boolean(fields.schema_id),
        expected_fingerprint: expected,
        current_fingerprint: current,
        schema_id: BUSABASE_SCHEMA.schema_id,
        schema_version: BUSABASE_SCHEMA.schema_version,
        base_id: busa.meta.baseId,
        drive_id: busa.meta.driveId,
        drive_slug: busa.meta.driveSlug,
        folder_slug: busa.meta.folderSlug,
        secrets_namespace: busa.meta.secretsNamespace,
        record_kinds: BUSABASE_SCHEMA.base.record_kinds,
      };
    } catch (error) {
      return {
        ok: false,
        initialized: false,
        error: error instanceof Error ? error.message : String(error),
        expected_fingerprint: expected,
        schema_id: BUSABASE_SCHEMA.schema_id,
        schema_version: BUSABASE_SCHEMA.schema_version,
        base_id: busa.meta.baseId,
        drive_id: busa.meta.driveId,
        drive_slug: busa.meta.driveSlug,
        folder_slug: busa.meta.folderSlug,
        secrets_namespace: busa.meta.secretsNamespace,
        record_kinds: BUSABASE_SCHEMA.base.record_kinds,
      };
    }
  }

  async function ensureInitialized() {
    return provider.init();
  }

  async function requireWritableSchema() {
    const status = await ensureInitialized();
    if (!status.ok) {
      const action = typeof status.action === "string" ? ` ${status.action}` : "";
      throw new Error(`Kelly Email Busabase provider is not ready.${action}`);
    }
    return status;
  }

  const provider = {
    kind: "busabase",

    async loadDotenv() {
      return [];
    },

    async loadConfigWithMeta() {
      await ensureInitialized().catch(() => null);
      return configMeta();
    },

    async loadConfig() {
      return (await this.loadConfigWithMeta()).config;
    },

    onboardingStatus(config: Config, meta: ConfigWithMeta = {} as ConfigWithMeta) {
      const mailboxes = config.mailboxes || [];
      const missingSecrets = [];
      for (const mailbox of mailboxes) {
        for (const endpoint of [mailbox.imap, mailbox.smtp]) {
          const ref = secretRef(endpoint);
          if (!ref)
            missingSecrets.push(`${mailbox.mailbox_id || "mailbox"}:${endpoint === mailbox.imap ? "imap" : "smtp"}`);
        }
      }
      const missingVaultRefs = Array.isArray(meta.missing_vault_refs) ? meta.missing_vault_refs.map(String) : [];
      const configured = Boolean(meta.has_private_config && mailboxes.length && missingSecrets.length === 0);
      const ready = configured && missingVaultRefs.length === 0;
      return {
        configured: ready,
        state:
          !meta.has_private_config || !mailboxes.length
            ? "needs_config"
            : missingSecrets.length || missingVaultRefs.length
              ? "missing_secrets"
              : "ready",
        message:
          !meta.has_private_config || !mailboxes.length
            ? `No Kelly Email Busabase config found. Create ${meta.recommended_config || `busabase:drive/${DRIVE_FILES.config}`} and store IMAP/SMTP secret values in ${meta.recommended_env || "busabase:vault"}.`
            : missingSecrets.length || missingVaultRefs.length
              ? "Kelly Email Busabase config is present, but one or more Busabase Vault secrets are missing or not referenced."
              : "Kelly Email Busabase config is ready.",
        missing_env: [...missingSecrets, ...missingVaultRefs],
        reader: "busabase",
        data_provider: "busabase",
        recommended_config: meta.recommended_config || `busabase:drive/${DRIVE_FILES.config}`,
        recommended_env: meta.recommended_env || "busabase:vault/kelly-email",
        example_config: meta.example_config || CONFIG_EXAMPLE_PATH,
        busabase: {
          schema_id: BUSABASE_SCHEMA.schema_id,
          schema_version: BUSABASE_SCHEMA.schema_version,
          config_path: DRIVE_FILES.config,
          secrets_namespace: String(meta.recommended_env || "").replace(/^busabase:vault\//, ""),
        },
      };
    },

    async getBatch(): Promise<Batch> {
      await ensureInitialized();
      try {
        const batch = (await readDriveJson(DRIVE_FILES.currentBatch)) as Batch;
        if (!batch || !Array.isArray(batch.items)) return emptyBatch();
        return normalizeBatch(batch);
      } catch {
        try {
          const fields = await readFields(LEGACY_RECORDS.current_batch);
          const batch = (fields.batch || fields) as Batch;
          if (!batch || !Array.isArray(batch.items)) return emptyBatch();
          return normalizeBatch(batch);
        } catch {
          return emptyBatch();
        }
      }
    },

    async saveBatch(batch: Batch) {
      await requireWritableSchema();
      const next = normalizeBatch({ ...batch, updated_at: utcNow() });
      await writeBatchSnapshot(next, { archive: true });
      await writeBaseRows(next);
      return next;
    },

    async getDecisions() {
      await ensureInitialized();
      try {
        return ((await readDriveJson(DRIVE_FILES.decisions)) as DecisionsPayload) || emptyDecisions();
      } catch {
        try {
          const fields = await readFields(LEGACY_RECORDS.decisions);
          return (fields.decisions_payload as DecisionsPayload) || emptyDecisions(String(fields.batch_id || ""));
        } catch {
          const batch = await this.getBatch();
          return emptyDecisions(batch.batch_id);
        }
      }
    },

    async writeDecisions(batch: Batch) {
      await requireWritableSchema();
      const payload = decisionsFromBatch(batch);
      await writeDriveJson(DRIVE_FILES.decisions, payload, `Kelly Email decisions ${payload.batch_id || "current"}`);
      return payload;
    },

    async writeScanState(value: Record<string, unknown>) {
      await requireWritableSchema();
      await writeDriveJson(DRIVE_FILES.scanState, value, "Kelly Email scan state");
    },

    async updateItems(input: DecisionInput) {
      await this.rejectIfLocked();
      const batch = await this.getBatch();
      const changed = applyItemsDecision(batch, input);
      const next = normalizeBatch({ ...batch, updated_at: utcNow() });
      await writeBatchSnapshot(next);
      await writeBaseRows(next, changed);
      const decisions = await this.writeDecisions(next);
      return { changed, decisions: decisions.decisions?.length || 0 };
    },

    async updateDetail(input: DetailInput) {
      await this.rejectIfLocked();
      const batch = await this.getBatch();
      const item = applyDetailUpdate(batch, input);
      const next = normalizeBatch({ ...batch, updated_at: utcNow() });
      await writeBatchSnapshot(next);
      await writeBaseRows(next, [item.id]);
      const decisions = await this.writeDecisions(next);
      return { id: item.id, decisions: decisions.decisions?.length || 0 };
    },

    async getLock() {
      await ensureInitialized();
      try {
        const lock = asObject(await readDriveJson(DRIVE_FILES.lock));
        if (!lock.locked && !lock.started_at) return { locked: false, provider: "busabase" };
        return {
          locked: true,
          provider: "busabase",
          message: lock.message || DEFAULT_LOCK_MESSAGE,
          owner: lock.owner || "kelly-email-agent",
          started_at: lock.started_at,
        };
      } catch {
        return { locked: false, provider: "busabase" };
      }
    },

    async rejectIfLocked() {
      const lock = await this.getLock();
      if (lock.locked) throw new Error(String(lock.message || DEFAULT_LOCK_MESSAGE));
    },

    async writeLock(message: string) {
      await requireWritableSchema();
      await writeDriveJson(
        DRIVE_FILES.lock,
        {
          locked: true,
          owner: "kelly-email-agent",
          message,
          started_at: utcNow(),
        },
        "Kelly Email agent lock",
      );
    },

    async clearLock() {
      await requireWritableSchema();
      await writeDriveJson(DRIVE_FILES.lock, { locked: false, cleared_at: utcNow() }, "Clear Kelly Email agent lock");
    },

    async writeExecutionReport(batch: Batch, report: Record<string, unknown>, stamp = "") {
      await requireWritableSchema();
      const reportStamp =
        stamp ||
        new Date()
          .toISOString()
          .replace(/[-:T.Z]/g, "")
          .slice(0, 14);
      const recordId = `execution-report-${batch.batch_id}-${reportStamp}`;
      await commit(
        recordId,
        {
          kind: "execution_report",
          batch_id: batch.batch_id,
          report,
          created_at: utcNow(),
        },
        `Execution report ${batch.batch_id}`,
      );
      await commit(
        "kelly-email-latest-execution-report",
        {
          kind: "execution_report",
          batch_id: batch.batch_id,
          report,
          latest_record_id: recordId,
          updated_at: utcNow(),
        },
        `Latest execution report ${batch.batch_id}`,
      );
      return { provider: "busabase", record_id: recordId };
    },

    async clearBatchAttachments(batchId: string) {
      await requireWritableSchema();
      await writeDriveJson(
        `attachments/${batchId}/.cleared.json`,
        { path: `attachments/${batchId}`, cleared_at: utcNow() },
        `Clear attachments ${batchId}`,
      );
    },

    async persistAttachments(
      batchId: string,
      itemId: string,
      htmlBody: string,
      attachments: AttachmentInput[],
    ): Promise<AttachmentResult> {
      await requireWritableSchema();
      const busa = await client();
      const cidUrls = new Map<string, string>();
      const saved: AttachmentInput[] = [];
      for (const [index, attachment] of attachments.entries()) {
        const filename = String(attachment.filename || `attachment-${index + 1}.bin`);
        const contentType = attachment.contentType || attachment.content_type || "application/octet-stream";
        const content = attachment.content;
        const base64 = Buffer.isBuffer(content)
          ? content.toString("base64")
          : typeof content === "string"
            ? Buffer.from(content).toString("base64")
            : "";
        const pathname = `attachments/${batchId}/${itemId}/${filename}`;
        const ref = await busa.putDriveFile(pathname, base64, {
          content_type: contentType,
          size: attachment.size || Buffer.byteLength(base64, "base64"),
          encoding: "base64",
        });
        const url = `/api/provider-file/${encodeURIComponent(pathname)}`;
        const contentId = String(attachment.contentId || attachment.content_id || "").replace(/^<|>$/g, "");
        if (contentId) cidUrls.set(contentId, url);
        saved.push({
          filename,
          content_type: contentType,
          size: attachment.size || Buffer.byteLength(base64, "base64"),
          content_id: contentId,
          url,
          busabase_ref: ref,
          preview: String(contentType).startsWith("image/") || contentType === "application/pdf",
        });
      }
      let html = htmlBody || "";
      for (const [contentId, url] of cidUrls.entries()) {
        html = html.replaceAll(`cid:${contentId}`, url).replaceAll(`CID:${contentId}`, url);
      }
      return { html, attachments: saved };
    },

    async getFile(pathname: string) {
      await ensureInitialized();
      const busa = await client();
      const fields = await busa.getDriveFile(pathname);
      return fields || null;
    },

    async putFile(pathname: string, data: unknown, meta: Record<string, unknown> = {}) {
      await requireWritableSchema();
      const busa = await client();
      await busa.writeDriveJson(pathname, data, `Kelly Email Drive file ${pathname}`);
      return {
        provider: "busabase",
        drive_id: busa.meta.driveId,
        drive_slug: busa.meta.driveSlug,
        path: pathname,
        meta,
      };
    },

    async getSecret(name: string) {
      const busa = await client();
      return busa.getSecret(name);
    },

    async init() {
      const busa = await client();
      const base = {
        provider: "busabase",
        mode: "busabase",
        base_url: busa.meta.baseUrl,
        base_id: busa.meta.baseId,
        base_slug: busa.meta.baseSlug,
        drive_id: busa.meta.driveId,
        drive_slug: busa.meta.driveSlug,
        folder_slug: busa.meta.folderSlug,
        secrets_namespace: busa.meta.secretsNamespace,
        space_id: busa.meta.spaceId || "",
        folder_prefix: busa.meta.folderPrefix || "",
        parent_node_id: busa.meta.parentNodeId || "",
      };
      try {
        const schema = await this.ensureSchema({ apply: true });
        const connection = await busa.verifyConnection();
        return {
          ...base,
          ok: Boolean(schema.ok),
          connection_ok: true,
          connection,
          schema,
          initialized: Boolean(schema.ok),
          message: schema.ok
            ? "Kelly Email is connected to Busabase."
            : "Kelly Email connected to Busabase, but schema initialization did not complete.",
          action: schema.ok ? "" : "Check Busabase permissions and the configured Base fields.",
          error: schema.ok ? "" : String(schema.error || "schema initialization failed"),
        };
      } catch (error) {
        return {
          ...base,
          ok: false,
          connection_ok: false,
          initialized: false,
          message: "Kelly Email is set to Busabase mode, but the Busabase provider could not initialize.",
          action:
            "Start Busabase, then check KELLY_EMAIL_BUSABASE_URL, KELLY_EMAIL_BUSABASE_BASE_ID, KELLY_EMAIL_BUSABASE_SPACE_ID, and API key settings.",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async checkSchema() {
      return schemaStatus({ createBase: false });
    },

    async ensureSchema(options: { apply?: boolean } = {}) {
      const busa = await client();
      if (options.apply) {
        await Promise.all([busa.ensureFolder(), busa.ensureBase(), busa.ensureDrive()]);
      }
      const status = await schemaStatus({ createBase: Boolean(options.apply) });
      if (status.ok || !options.apply) return { ...status, applied: false };
      const fingerprint = schemaFingerprint();
      await busa.writeDriveJson(
        DRIVE_FILES.schema,
        {
          kind: "storage_schema",
          schema: BUSABASE_SCHEMA,
          schema_id: BUSABASE_SCHEMA.schema_id,
          schema_version: BUSABASE_SCHEMA.schema_version,
          fingerprint,
          base_id: busa.meta.baseId,
          drive_id: busa.meta.driveId,
          drive_slug: busa.meta.driveSlug,
          folder_slug: busa.meta.folderSlug,
          config_path: DRIVE_FILES.config,
          secrets_namespace: busa.meta.secretsNamespace,
          updated_at: utcNow(),
        },
        `Initialize ${BUSABASE_SCHEMA.schema_id} schema`,
      );
      return { ...(await schemaStatus()), applied: true };
    },

    async verifyConnection() {
      const busa = await client();
      return busa.verifyConnection();
    },

    async providerStatus() {
      return this.init();
    },
  };

  return provider;
}
