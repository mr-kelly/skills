import type { Batch, Config, ConfigWithMeta, DecisionsPayload } from "../types.ts";
import { createBusabaseClient } from "./busabase-client.ts";
import { BUSABASE_SCHEMA, schemaFingerprint } from "./busabase-schema.ts";
import {
  applyDetailUpdate,
  applyItemsDecision,
  decisionsFromBatch,
  emptyBatch,
  normalizeBatch,
  utcNow,
} from "./provider-utils.ts";
import type { AttachmentInput, AttachmentResult, DecisionInput, DetailInput } from "./provider-interface.ts";
import {
  configFileCandidates,
  loadConfigWithMeta as loadLocalConfigWithMeta,
  loadDotenv as loadLocalDotenv,
  onboardingStatus as localOnboardingStatus,
} from "./local-file-provider.ts";

const ENV_PREFIX = "KELLY_EMAIL";
const RECORDS = BUSABASE_SCHEMA.records;
const DEFAULT_LOCK_MESSAGE = "/kelly-email is processing this batch.";

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function autoInitialize(config: Config) {
  return (
    process.env.KELLY_EMAIL_BUSABASE_AUTO_INITIALIZE === "1" ||
    process.env.KELLY_EMAIL_BUSABASE_AUTO_INITIALIZE === "true" ||
    config.busabase?.auto_initialize === true
  );
}

function emptyDecisions(batchId = ""): DecisionsPayload {
  return { batch_id: batchId, updated_at: "", decisions: [] };
}

export function createBusabaseProvider() {
  let configMetaPromise: Promise<ConfigWithMeta> | null = null;

  async function configMeta() {
    if (!configMetaPromise) {
      configMetaPromise = loadLocalConfigWithMeta().then((meta) => ({
        ...meta,
        reader: "busabase",
        provider: "busabase",
      }));
    }
    return configMetaPromise;
  }

  async function client() {
    const meta = await configMeta();
    return createBusabaseClient({ envPrefix: ENV_PREFIX, config: meta.config });
  }

  async function commit(recordId: string, fields: Record<string, unknown>, message: string) {
    const busa = await client();
    return busa.commitRecord(recordId, fields, message);
  }

  async function readFields(recordId: string): Promise<Record<string, any>> {
    const busa = await client();
    return busa.getRecordFields(recordId);
  }

  async function schemaStatus() {
    const busa = await client();
    const expected = schemaFingerprint();
    try {
      const fields = await busa.getRecordFields(RECORDS.schema_meta);
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
        secrets_namespace: busa.meta.secretsNamespace,
        record_kinds: BUSABASE_SCHEMA.base.record_kinds,
      };
    }
  }

  async function ensureInitialized() {
    const meta = await configMeta();
    const status = await schemaStatus();
    if (status.ok) return status;
    if (!autoInitialize(meta.config)) return status;
    return provider.ensureSchema?.({ apply: true }) || status;
  }

  async function requireWritableSchema() {
    const status = await ensureInitialized();
    if (!status.ok) {
      throw new Error(
        "Kelly Email Busabase schema is not initialized. Run `KELLY_EMAIL_DATA_PROVIDER=busabase node scripts/init_busabase_schema.ts --apply` or set config.busabase.auto_initialize=true after confirming the target Base.",
      );
    }
    return status;
  }

  const provider = {
    kind: "busabase",

    async loadDotenv() {
      return loadLocalDotenv();
    },

    async loadConfigWithMeta() {
      await ensureInitialized().catch(() => null);
      return configMeta();
    },

    async loadConfig() {
      return (await this.loadConfigWithMeta()).config;
    },

    onboardingStatus(config: Config, meta: ConfigWithMeta = {} as ConfigWithMeta) {
      const base = localOnboardingStatus(config, { ...meta, reader: "busabase", provider: "busabase" });
      return {
        ...base,
        reader: "busabase",
        data_provider: "busabase",
        busabase: {
          schema_id: BUSABASE_SCHEMA.schema_id,
          schema_version: BUSABASE_SCHEMA.schema_version,
          config_candidates: configFileCandidates(),
        },
      };
    },

    async getBatch(): Promise<Batch> {
      await ensureInitialized();
      try {
        const fields = await readFields(RECORDS.current_batch);
        const batch = (fields.batch || fields) as Batch;
        if (!batch || !Array.isArray(batch.items)) return emptyBatch();
        return normalizeBatch(batch);
      } catch {
        return emptyBatch();
      }
    },

    async saveBatch(batch: Batch) {
      await requireWritableSchema();
      const next = normalizeBatch({ ...batch, updated_at: utcNow() });
      await commit(
        RECORDS.current_batch,
        {
          kind: "batch",
          batch: next,
          batch_id: next.batch_id,
          updated_at: next.updated_at,
        },
        `Kelly Email batch ${next.batch_id || "current"}`,
      );
      for (const item of next.items || []) {
        await commit(
          `email-item-${item.id}`,
          {
            kind: "review_item",
            batch_id: next.batch_id,
            item_id: item.id,
            item,
            status: item.status,
            proposed_action: item.proposed_action,
            updated_at: item.updated_at || next.updated_at,
          },
          `Review item ${item.subject || item.id}`,
        );
      }
      return next;
    },

    async getDecisions() {
      await ensureInitialized();
      try {
        const fields = await readFields(RECORDS.decisions);
        return (fields.decisions_payload as DecisionsPayload) || emptyDecisions(String(fields.batch_id || ""));
      } catch {
        const batch = await this.getBatch();
        return emptyDecisions(batch.batch_id);
      }
    },

    async writeDecisions(batch: Batch) {
      await requireWritableSchema();
      const payload = decisionsFromBatch(batch);
      await commit(
        RECORDS.decisions,
        {
          kind: "decision_set",
          batch_id: payload.batch_id,
          decisions_payload: payload,
          updated_at: payload.updated_at,
        },
        `Kelly Email decisions ${payload.batch_id || "current"}`,
      );
      return payload;
    },

    async updateItems(input: DecisionInput) {
      await this.rejectIfLocked();
      const batch = await this.getBatch();
      const changed = applyItemsDecision(batch, input);
      await this.saveBatch(batch);
      const decisions = await this.writeDecisions(batch);
      return { changed, decisions: decisions.decisions?.length || 0 };
    },

    async updateDetail(input: DetailInput) {
      await this.rejectIfLocked();
      const batch = await this.getBatch();
      const item = applyDetailUpdate(batch, input);
      await this.saveBatch(batch);
      const decisions = await this.writeDecisions(batch);
      return { id: item.id, decisions: decisions.decisions?.length || 0 };
    },

    async getLock() {
      await ensureInitialized();
      try {
        const fields = await readFields(RECORDS.lock);
        const lock = asObject(fields.lock || fields);
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
      await commit(
        RECORDS.lock,
        {
          kind: "lock",
          lock: {
            locked: true,
            owner: "kelly-email-agent",
            message,
            started_at: utcNow(),
          },
        },
        "Kelly Email agent lock",
      );
    },

    async clearLock() {
      await requireWritableSchema();
      await commit(
        RECORDS.lock,
        {
          kind: "lock",
          lock: { locked: false, cleared_at: utcNow() },
        },
        "Clear Kelly Email agent lock",
      );
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
      await commit(
        `attachments-${batchId}`,
        {
          kind: "drive_folder",
          drive_id: (await client()).meta.driveId,
          path: `attachments/${batchId}`,
          cleared_at: utcNow(),
        },
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

    async checkSchema() {
      return schemaStatus();
    },

    async ensureSchema(options: { apply?: boolean } = {}) {
      const busa = await client();
      const status = await schemaStatus();
      if (status.ok || !options.apply) return { ...status, applied: false };
      const fingerprint = schemaFingerprint();
      await busa.commitRecord(
        RECORDS.schema_meta,
        {
          kind: "schema_meta",
          schema: BUSABASE_SCHEMA,
          schema_id: BUSABASE_SCHEMA.schema_id,
          schema_version: BUSABASE_SCHEMA.schema_version,
          fingerprint,
          base_id: busa.meta.baseId,
          drive_id: busa.meta.driveId,
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
  };

  return provider;
}
