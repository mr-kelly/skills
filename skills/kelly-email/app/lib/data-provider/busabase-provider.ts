import { appConfig } from "../../app/js/config.js";
import { isAirAppRequest } from "../runtime-context.ts";
import type { Batch, Config, ConfigWithMeta } from "../types.ts";
import { createBusabaseClient } from "./busabase-client.ts";
import { rowsFromContactsBatch } from "./email-contacts.ts";
import { batchFromEmailRecords, emailRecordId, reviewItemToEmailRecordFields } from "./email-records.ts";
import type { AttachmentInput, AttachmentResult, DecisionInput, DetailInput } from "./provider-interface.ts";
import { applyDetailUpdate, applyItemsDecision, decisionsFromBatch, normalizeBatch, utcNow } from "./provider-utils.ts";

const CONFIG_RECORD_ID = "kelly-email-config";
const LOCK_RECORD_ID = "kelly-email-lock";
const SCAN_STATE_RECORD_ID = "kelly-email-scan-state";
const DEFAULT_LOCK_MESSAGE = "/kelly-email is processing this batch.";

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function parsePayload(value: unknown) {
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asObject(value);
}

function secretRef(endpoint: unknown) {
  const data = asObject(endpoint);
  return String(data.vault_ref || data.password_vault_ref || data.secret_ref || data.password_env || "").trim();
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

export function createBusabaseProvider() {
  let clientPromise: Promise<ReturnType<typeof createBusabaseClient>> | null = null;
  const client = async () => (clientPromise ||= Promise.resolve(createBusabaseClient()));

  async function readSettingsRows() {
    return (await client()).listSettingsFields();
  }

  async function readConfigMeta(): Promise<ConfigWithMeta> {
    const rows = await readSettingsRows();
    const row = rows.find((item: any) => item.record_id === CONFIG_RECORD_ID || item.kind === "config");
    const config = parsePayload(row?.payload) as Config;
    if (!Array.isArray(config.mailboxes)) config.mailboxes = [];
    if (!Array.isArray(config.identities)) config.identities = [];
    const refs = configSecretRefs(config);
    // AirApp receives the authenticated Busabase request context, never Vault
    // values. Only the trusted skill process can verify injected secrets.
    const missing = isAirAppRequest() ? [] : refs.filter((name) => !process.env[name]);
    return {
      config,
      source: row ? "busabase:base/kelly-email-settings-v3" : "",
      reader: "busabase",
      provider: "busabase",
      is_example: false,
      has_private_config: Boolean(row),
      vault_refs: refs,
      missing_vault_refs: missing,
      recommended_config: "busabase:base/kelly-email-settings-v3",
      recommended_env: `busabase:vault/${appConfig.vaultNamespace}`,
      example_config: "config.example.json",
    };
  }

  async function configMeta() {
    return readConfigMeta();
  }

  async function readReviewRows() {
    const rows = await (await client()).listRecordFields();
    return rows.filter((row: any) => String(row.kind || "review_item") === "review_item");
  }

  async function writeReviewRows(batch: Batch, itemIds?: string[]) {
    const busabase = await client();
    const wanted = itemIds ? new Set(itemIds.map(String)) : null;
    const writes = [];
    for (const item of batch.items || []) {
      if (wanted && !wanted.has(String(item.id))) continue;
      writes.push(
        busabase.upsertRecord(
          emailRecordId(item),
          reviewItemToEmailRecordFields(item, batch.batch_id || ""),
          `Review item ${item.subject || item.id}`,
        ),
      );
    }
    return Promise.all(writes);
  }

  async function writeContactRows(batch: Batch) {
    const busabase = await client();
    return Promise.all(
      rowsFromContactsBatch(batch).map((row) =>
        busabase.upsertContactRecord(row.record_id, row, `Email contact ${row.email}`),
      ),
    );
  }

  async function settingsRecord(recordId: string) {
    try {
      return await (await client()).getSettingsFields(recordId);
    } catch {
      return {};
    }
  }

  async function writeSettings(recordId: string, fields: Record<string, unknown>, message: string) {
    return (await client()).upsertSettingsRecord(recordId, fields, message);
  }

  const provider = {
    kind: "busabase",

    async loadDotenv() {
      return [];
    },

    async loadConfigWithMeta() {
      await this.init();
      return configMeta();
    },

    async loadConfig() {
      return (await this.loadConfigWithMeta()).config;
    },

    onboardingStatus(config: Config, meta: ConfigWithMeta = {} as ConfigWithMeta) {
      const mailboxes = config.mailboxes || [];
      const missingRefs = [];
      for (const mailbox of mailboxes) {
        if (!secretRef(mailbox.imap)) missingRefs.push(`${mailbox.mailbox_id || "mailbox"}:imap`);
        if (!secretRef(mailbox.smtp)) missingRefs.push(`${mailbox.mailbox_id || "mailbox"}:smtp`);
      }
      const missingVaultRefs = Array.isArray(meta.missing_vault_refs) ? meta.missing_vault_refs.map(String) : [];
      const hasConfig = Boolean(meta.has_private_config && mailboxes.length);
      const missing = [...missingRefs, ...missingVaultRefs];
      return {
        configured: hasConfig && missing.length === 0,
        has_config: hasConfig,
        state: !hasConfig ? "needs_config" : missing.length ? "missing_secrets" : "ready",
        message: !hasConfig
          ? "Kelly Email resources are ready. Add an account configuration record to Email Settings."
          : missing.length
            ? "Account configuration is present, but one or more Busabase Vault references are not ready."
            : "Kelly Email is ready.",
        missing_env: missing,
        reader: "busabase",
        data_provider: "busabase",
        recommended_config: meta.recommended_config,
        recommended_env: meta.recommended_env,
        example_config: meta.example_config,
      };
    },

    async getBatch(): Promise<Batch> {
      await this.init();
      return batchFromEmailRecords(await readReviewRows());
    },

    async saveBatch(batch: Batch) {
      await this.init();
      const next = normalizeBatch({ ...batch, updated_at: utcNow() });
      await writeReviewRows(next);
      await writeContactRows(next);
      return next;
    },

    async getDecisions() {
      return decisionsFromBatch(await this.getBatch());
    },

    async writeDecisions(batch: Batch) {
      return decisionsFromBatch(batch);
    },

    async writeScanState(value: Record<string, unknown>) {
      await this.init();
      await writeSettings(
        SCAN_STATE_RECORD_ID,
        { kind: "scan_state", name: "Scan State", payload: value, updated_at: utcNow() },
        "Update Kelly Email scan state",
      );
    },

    async updateItems(input: DecisionInput) {
      await this.rejectIfLocked();
      const batch = await this.getBatch();
      const changed = applyItemsDecision(batch, input);
      const next = normalizeBatch({ ...batch, updated_at: utcNow() });
      const writes = await writeReviewRows(next, changed);
      return {
        changed,
        decisions: changed.length,
        change_requests: writes.map((write: any) => write.change_request_id).filter(Boolean),
      };
    },

    async updateDetail(input: DetailInput) {
      await this.rejectIfLocked();
      const batch = await this.getBatch();
      const item = applyDetailUpdate(batch, input);
      const next = normalizeBatch({ ...batch, updated_at: utcNow() });
      const [write] = await writeReviewRows(next, [item.id]);
      return { id: item.id, decisions: 1, change_requests: [write?.change_request_id].filter(Boolean) };
    },

    async getLock() {
      await this.init();
      const row = await settingsRecord(LOCK_RECORD_ID);
      return row.locked
        ? {
            locked: true,
            provider: "busabase",
            message: row.message || DEFAULT_LOCK_MESSAGE,
            owner: row.owner || "kelly-email-agent",
            started_at: row.started_at,
          }
        : { locked: false, provider: "busabase" };
    },

    async rejectIfLocked() {
      const lock = await this.getLock();
      if (lock.locked) throw new Error(String(lock.message || DEFAULT_LOCK_MESSAGE));
    },

    async writeLock(message: string) {
      await this.init();
      await writeSettings(
        LOCK_RECORD_ID,
        {
          kind: "lock",
          name: "Agent Lock",
          locked: true,
          owner: "kelly-email-agent",
          message,
          started_at: utcNow(),
          updated_at: utcNow(),
        },
        "Set Kelly Email agent lock",
      );
    },

    async clearLock() {
      await this.init();
      await writeSettings(
        LOCK_RECORD_ID,
        { kind: "lock", name: "Agent Lock", locked: false, updated_at: utcNow() },
        "Clear Kelly Email agent lock",
      );
    },

    async writeExecutionReport(batch: Batch, report: Record<string, unknown>, stamp = "") {
      await this.init();
      const reportStamp =
        stamp ||
        new Date()
          .toISOString()
          .replace(/[-:T.Z]/g, "")
          .slice(0, 14);
      const recordId = `execution-report-${batch.batch_id}-${reportStamp}`;
      const write = await (await client()).upsertRecord(
        recordId,
        {
          kind: "execution_report",
          subject: `Execution report ${batch.batch_id}`,
          batch_id: batch.batch_id,
          report,
          created_at: utcNow(),
        },
        `Execution report ${batch.batch_id}`,
      );
      return { provider: "busabase", record_id: recordId, change_request_id: write.change_request_id };
    },

    async clearBatchAttachments(batchId: string) {
      await (await client()).writeDriveFile(
        `attachments/${batchId}/cleared.json`,
        JSON.stringify({ cleared_at: utcNow() }),
        "application/json",
      );
    },

    async persistAttachments(
      batchId: string,
      itemId: string,
      htmlBody: string,
      attachments: AttachmentInput[],
    ): Promise<AttachmentResult> {
      await this.init();
      const busabase = await client();
      const cidUrls = new Map<string, string>();
      const saved: AttachmentInput[] = [];
      for (const [index, attachment] of attachments.entries()) {
        const filename = String(attachment.filename || `attachment-${index + 1}.bin`).replaceAll("/", "-");
        const contentType = String(attachment.contentType || attachment.content_type || "application/octet-stream");
        const content = attachment.content;
        const base64 = Buffer.isBuffer(content)
          ? content.toString("base64")
          : Buffer.from(String(content || "")).toString("base64");
        const pathname = `attachments/${batchId}/${itemId}/${filename}`;
        const write = await busabase.writeDriveFile(
          pathname,
          JSON.stringify({ encoding: "base64", data: base64, content_type: contentType }),
          "application/json",
        );
        const url = `/api/provider-file/${encodeURIComponent(pathname)}`;
        const contentId = String(attachment.contentId || attachment.content_id || "").replace(/^<|>$/g, "");
        if (contentId) cidUrls.set(contentId, url);
        saved.push({
          filename,
          content_type: contentType,
          size: attachment.size || Buffer.byteLength(base64, "base64"),
          content_id: contentId,
          url,
          busabase_ref: write,
          preview: contentType.startsWith("image/") || contentType === "application/pdf",
        });
      }
      let html = htmlBody || "";
      for (const [contentId, url] of cidUrls)
        html = html.replaceAll(`cid:${contentId}`, url).replaceAll(`CID:${contentId}`, url);
      return { html, attachments: saved };
    },

    async getFile(pathname: string) {
      const file = await (await client()).readDriveFile(pathname).catch(() => null);
      if (!file || file.encoding !== "utf8") return null;
      const payload = parsePayload(file.content);
      return payload.encoding === "base64"
        ? { data: payload.data, meta: { encoding: "base64", content_type: payload.content_type } }
        : { data: file.content, meta: { encoding: "utf8", content_type: file.mimeType } };
    },

    async putFile(pathname: string, data: unknown, meta: Record<string, unknown> = {}) {
      const write = await (await client()).writeDriveFile(
        pathname,
        typeof data === "string" ? data : JSON.stringify(data),
        String(meta.content_type || "application/json"),
      );
      return { provider: "busabase", path: pathname, ...write };
    },

    async getSecret(name: string) {
      return (await client()).getSecret(name);
    },

    async init() {
      const busabase = await client();
      try {
        const resources = await busabase.provisionResources();
        const connection = await busabase.verifyConnection();
        return {
          ok: true,
          provider: "busabase",
          mode: "airapp",
          hosting: "cloud",
          base_url: busabase.meta.baseUrl || "same-origin",
          base_id: busabase.meta.baseId,
          contacts_base_id: busabase.meta.contactsBaseId,
          settings_base_id: busabase.meta.settingsBaseId,
          drive_id: busabase.meta.driveId,
          drive_slug: busabase.meta.driveSlug,
          folder_slug: busabase.meta.folderSlug,
          secrets_namespace: busabase.meta.secretsNamespace,
          space_id: busabase.meta.spaceId,
          connection,
          initialized: Boolean(resources.folder),
          message: "Kelly Email is connected to Busabase Cloud.",
          action: "",
        };
      } catch (error) {
        return {
          ok: false,
          provider: "busabase",
          mode: "airapp",
          hosting: "cloud",
          base_url: busabase.meta.baseUrl || "same-origin",
          space_id: busabase.meta.spaceId,
          message: "Kelly Email could not initialize its declared Busabase resources.",
          action: "Open this AirApp in the target Space and initialize its resources.",
          error: error instanceof Error ? error.message : String(error),
          connection: {},
        };
      }
    },

    async checkSchema() {
      const busabase = await client();
      const resources = await busabase.inspectResources();
      return { ok: Boolean(resources.folder && !resources.missing.length && resources.drive), resources };
    },

    async ensureSchema(options: { apply?: boolean } = {}) {
      const busabase = await client();
      const resources = options.apply ? await busabase.provisionResources() : await busabase.inspectResources();
      return {
        ok: Boolean(resources.folder && !resources.missing.length && resources.drive),
        resources,
        applied: Boolean(options.apply),
      };
    },

    async verifyConnection() {
      return (await client()).verifyConnection();
    },

    async providerStatus() {
      return this.init();
    },
  };

  return provider;
}
