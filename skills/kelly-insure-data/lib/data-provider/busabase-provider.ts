import { fieldMapping, recordLimit, summarizeConfig } from "../config.ts";
import type {
  ConfigResult,
  FeedbackItem,
  FieldMapping,
  InsureFile,
  InsureSnapshot,
  MetadataField,
  NewsItem,
  QaPair,
} from "../types.ts";
import { createBusabaseClient } from "./busabase-client.ts";
import type { ReviewInput } from "./provider-interface.ts";

type AnyRecord = Record<string, any>;

function compactArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  return [];
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const locale = (value as AnyRecord)["zh-CN"] || (value as AnyRecord).zh || (value as AnyRecord).en;
    if (locale) return String(locale);
  }
  return "";
}

function fieldsOf(record: AnyRecord): Record<string, unknown> {
  return record?.headCommit?.fields || record?.fields || record?.commit?.fields || {};
}

function fieldName(field: AnyRecord): string {
  return text(field?.name) || String(field?.slug || field?.id || "");
}

function metadataFields(metadata: Record<string, unknown> = {}): MetadataField[] {
  return Object.entries(metadata).map(([key, value]) => ({ key, value }));
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function governance(fields: Record<string, unknown>, requiredFields: string[]) {
  const required = requiredFields.filter(Boolean);
  const missing = required.filter((key) => !isPresent(fields[key]));
  const completeness = required.length ? Math.round(((required.length - missing.length) / required.length) * 100) : 100;
  const status = text(fields.status) || (missing.length ? "needs_metadata" : "active");
  return { completeness_pct: completeness, missing_fields: missing, status };
}

function normalizeFile(file: AnyRecord, requiredFields: string[]): InsureFile {
  const metadata = (file.metadata || file.asset?.metadata || {}) as Record<string, unknown>;
  const gov = governance(metadata, requiredFields);
  return {
    id: String(file.id || file.assetId || file.asset?.id || file.path || file.name || crypto.randomUUID()),
    name: String(file.displayName || file.name || file.fileName || file.asset?.fileName || "Untitled file"),
    path: String(file.path || file.node?.slug || file.name || ""),
    size: Number(file.size || file.asset?.size || 0),
    mime_type: String(file.mimeType || file.asset?.mimeType || ""),
    updated_at: String(file.updatedAt || file.asset?.createdAt || ""),
    asset_id: file.assetId || file.asset?.id || undefined,
    url: file.url || file.asset?.url || undefined,
    metadata,
    governance: gov,
  };
}

function normalizeQa(record: AnyRecord, mapping: FieldMapping): QaPair {
  const fields = fieldsOf(record);
  const required = [mapping.question, mapping.answer, mapping.source].filter(Boolean) as string[];
  return {
    id: String(record.id || fields.id || crypto.randomUUID()),
    question: text(fields[mapping.question || "question"]) || "(no question)",
    answer: text(fields[mapping.answer || "answer"]),
    category: mapping.category ? text(fields[mapping.category]) : "",
    source: text(fields[mapping.source || "carrier"]),
    tags: mapping.tags ? compactArray(fields[mapping.tags]) : [],
    updated_at: String(record.updatedAt || record.createdAt || ""),
    status: text(fields[mapping.status || "status"]) || record.status || "active",
    fields,
    governance: governance(fields, required),
  };
}

function normalizeNews(record: AnyRecord, mapping: FieldMapping, collection: "featured" | "notice"): NewsItem {
  const fields = fieldsOf(record);
  const required = [mapping.title].filter(Boolean) as string[];
  return {
    id: String(record.id || fields.id || crypto.randomUUID()),
    collection,
    title: text(fields[mapping.title || "title"]) || "(untitled)",
    summary: text(fields[mapping.summary || "content"]),
    url: text(fields[mapping.url || "source_url"]),
    source: text(fields[mapping.source || "carrier"]),
    published_at: text(fields[mapping.published_at || "published_at"]) || String(record.updatedAt || ""),
    category: text(fields[mapping.category || "category"]),
    tags: mapping.tags ? compactArray(fields[mapping.tags]) : [],
    status: text(fields[mapping.status || "status"]) || record.status || "active",
    fields,
    governance: governance(fields, required),
  };
}

function normalizeFeedback(record: AnyRecord, mapping: FieldMapping): FeedbackItem {
  const fields = fieldsOf(record);
  const required = [mapping.title, mapping.content, mapping.source, mapping.created_at, mapping.status].filter(
    Boolean,
  ) as string[];
  return {
    id: String(record.id || fields.id || crypto.randomUUID()),
    title: text(fields[mapping.title || "title"]) || "(untitled feedback)",
    content: text(fields[mapping.content || "content"]),
    source: text(fields[mapping.source || "source"]),
    user_name: text(fields[mapping.user_name || "user_name"]),
    contact: text(fields[mapping.contact || "contact"]),
    rating: text(fields[mapping.rating || "rating"]),
    category: text(fields[mapping.category || "category"]),
    tags: compactArray(fields[mapping.tags || "tags"]),
    created_at: text(fields[mapping.created_at || "created_at"]) || String(record.createdAt || record.updatedAt || ""),
    status: text(fields[mapping.status || "status"]) || record.status || "new",
    fields,
    governance: governance(fields, required),
  };
}

function qualityScore(items: Array<{ governance?: { completeness_pct: number } }>): number {
  if (!items.length) return 100;
  return Math.round(
    items.reduce((sum, item) => sum + Number(item.governance?.completeness_pct || 0), 0) / items.length,
  );
}

function needsGovernance(items: Array<{ governance?: { missing_fields: string[]; status: string } }>): number {
  return items.filter((item) => {
    const status = item.governance?.status || "";
    return (
      Boolean(item.governance?.missing_fields?.length) ||
      ["draft", "review", "needs_metadata", "needs_review"].includes(status)
    );
  }).length;
}

export function createBusabaseProvider(configResult: ConfigResult) {
  const config = configResult.config || {};
  const busa = createBusabaseClient({ envPrefix: "KELLY_INSURE_DATA", config });
  const driveNodeId = busa.meta.driveNodeId;
  const driveNodeSlug = busa.meta.driveNodeSlug;
  const featuredBaseId = busa.meta.featuredBaseId;
  const featuredBaseSlug = busa.meta.featuredBaseSlug;
  const noticesBaseId = busa.meta.noticesBaseId;
  const noticesBaseSlug = busa.meta.noticesBaseSlug;
  const qaBaseId = busa.meta.qaBaseId;
  const qaBaseSlug = busa.meta.qaBaseSlug;
  const feedbackBaseId = busa.meta.feedbackBaseId;
  const feedbackBaseSlug = busa.meta.feedbackBaseSlug;
  const limit = recordLimit(config);
  const fileRequiredFields = Array.isArray(config.taxonomy?.file_metadata_fields)
    ? config.taxonomy.file_metadata_fields
    : [];
  const configSummary = () => ({ ...summarizeConfig(configResult), provider: "busabase" });

  async function providerStatus() {
    const summary = configSummary();
    const missing = [
      !summary.busabase.base_url ? "base_url" : "",
      !summary.busabase.space_id ? "space_id" : "",
      !summary.busabase.api_key_ready ? summary.busabase.api_key_env : "",
    ].filter(Boolean);
    if (missing.length) {
      return {
        ok: false,
        provider: "busabase",
        mode: "configuration",
        action: "configure_busabase",
        message: `Missing Busabase configuration: ${missing.join(", ")}`,
        connection: {
          base_url: Boolean(summary.busabase.base_url),
          space_id: Boolean(summary.busabase.space_id),
          api_key_ready: summary.busabase.api_key_ready,
        },
      };
    }
    try {
      const connection = await busa.verifyConnection();
      return { ok: true, provider: "busabase", mode: "ready", connection };
    } catch (error) {
      return {
        ok: false,
        provider: "busabase",
        mode: "connection_error",
        action: "check_busabase_connection",
        message: (error as Error).message,
      };
    }
  }

  async function readSnapshot(): Promise<InsureSnapshot> {
    const [drive, featuredBase, noticesBase, qaBase, feedbackBase] = await Promise.all([
      busa.resolveDrive(driveNodeId, driveNodeSlug),
      busa.resolveBase(featuredBaseId, featuredBaseSlug),
      busa.resolveBase(noticesBaseId, noticesBaseSlug),
      busa.resolveBase(qaBaseId, qaBaseSlug),
      busa.resolveBase(feedbackBaseId, feedbackBaseSlug),
    ]);
    const resolvedDriveNodeId = drive?.node?.id || drive?.nodeId || drive?.id || driveNodeId;
    const [driveFiles, featuredRecords, noticesRecords, qaRecords, feedbackRecords] = await Promise.all([
      resolvedDriveNodeId ? busa.listDriveFiles(resolvedDriveNodeId) : [],
      featuredBase ? busa.listRecords(featuredBase.id, limit) : [],
      noticesBase ? busa.listRecords(noticesBase.id, limit) : [],
      qaBase ? busa.listRecords(qaBase.id, limit) : [],
      feedbackBase ? busa.listRecords(feedbackBase.id, limit) : [],
    ]);

    const files = driveFiles.map((file) => normalizeFile(file, fileRequiredFields));
    const qaPairs = qaRecords.map((record) => normalizeQa(record, fieldMapping("qa", config)));
    const featuredItems = featuredRecords.map((record) =>
      normalizeNews(record, fieldMapping("featured", config), "featured"),
    );
    const noticeItems = noticesRecords.map((record) =>
      normalizeNews(record, fieldMapping("notices", config), "notice"),
    );
    const newsItems = [...featuredItems, ...noticeItems];
    const feedbackItems = feedbackRecords.map((record) => normalizeFeedback(record, fieldMapping("feedback", config)));
    const allGoverned = [...files, ...qaPairs, ...newsItems, ...feedbackItems];
    const warnings: InsureSnapshot["warnings"] = [];
    if (!drive)
      warnings.push({
        id: "missing-drive",
        severity: "warning",
        message: "Busabase Drive node is not configured or not found.",
      });
    if (!qaBase)
      warnings.push({
        id: "missing-qa-base",
        severity: "warning",
        message: "Busabase QA Base is not configured or not found.",
      });
    if (!featuredBase)
      warnings.push({
        id: "missing-featured-base",
        severity: "warning",
        message: "Busabase Featured Information Base is not configured or not found.",
      });
    if (!noticesBase)
      warnings.push({
        id: "missing-notices-base",
        severity: "warning",
        message: "Busabase Insurer Notices Base is not configured or not found.",
      });
    if (!feedbackBase)
      warnings.push({
        id: "missing-feedback-base",
        severity: "warning",
        message: "Busabase feedback Base is not configured or not found.",
      });

    return {
      schema_version: "1",
      generated_at: new Date().toISOString(),
      source: "busabase",
      drive: {
        node_id: String(drive?.node?.id || driveNodeId || ""),
        name: String(drive?.node?.name || "文件盘"),
        slug: String(drive?.node?.slug || driveNodeSlug || ""),
        metadata: (drive?.node?.metadata || {}) as Record<string, unknown>,
        metadata_fields: metadataFields(drive?.node?.metadata || {}),
      },
      bases: {
        qa: {
          base_id: String(qaBase?.id || qaBaseId || ""),
          name: String(qaBase?.name || "问答"),
          slug: String(qaBase?.slug || qaBaseSlug || ""),
          fields: Array.isArray(qaBase?.fields)
            ? qaBase.fields.map((field: AnyRecord) => ({
                key: field.slug || field.id,
                value: `${fieldName(field)} (${field.type})`,
              }))
            : [],
        },
        featured: {
          base_id: String(featuredBase?.id || featuredBaseId || ""),
          name: String(featuredBase?.name || "资讯精选"),
          slug: String(featuredBase?.slug || featuredBaseSlug || "featured-information"),
          fields: Array.isArray(featuredBase?.fields)
            ? featuredBase.fields.map((field: AnyRecord) => ({
                key: field.slug || field.id,
                value: `${fieldName(field)} (${field.type})`,
              }))
            : [],
        },
        notices: {
          base_id: String(noticesBase?.id || noticesBaseId || ""),
          name: String(noticesBase?.name || "保司通知"),
          slug: String(noticesBase?.slug || noticesBaseSlug || "insurance-news"),
          fields: Array.isArray(noticesBase?.fields)
            ? noticesBase.fields.map((field: AnyRecord) => ({
                key: field.slug || field.id,
                value: `${fieldName(field)} (${field.type})`,
              }))
            : [],
        },
        feedback: {
          base_id: String(feedbackBase?.id || feedbackBaseId || ""),
          name: String(feedbackBase?.name || "用户反馈"),
          slug: String(feedbackBase?.slug || feedbackBaseSlug || ""),
          fields: Array.isArray(feedbackBase?.fields)
            ? feedbackBase.fields.map((field: AnyRecord) => ({
                key: field.slug || field.id,
                value: `${fieldName(field)} (${field.type})`,
              }))
            : [],
        },
      },
      metrics: {
        file_count: files.length,
        metadata_field_count: metadataFields(drive?.node?.metadata || {}).length,
        qa_count: qaPairs.length,
        featured_count: featuredItems.length,
        notice_count: noticeItems.length,
        news_count: newsItems.length,
        feedback_count: feedbackItems.length,
        total_records: files.length + qaPairs.length + newsItems.length + feedbackItems.length,
        data_quality_score: qualityScore(allGoverned),
        needs_governance: needsGovernance(allGoverned),
      },
      files,
      qa_pairs: qaPairs,
      news_items: newsItems,
      featured_items: featuredItems,
      notice_items: noticeItems,
      feedback_items: feedbackItems,
      warnings,
    };
  }

  return {
    name: "busabase",

    async verifyConnection() {
      return busa.verifyConnection();
    },

    providerStatus,

    async getState() {
      let snapshot: InsureSnapshot;
      try {
        snapshot = await readSnapshot();
      } catch (error) {
        snapshot = {
          schema_version: "1",
          generated_at: new Date().toISOString(),
          source: "busabase",
          drive: { node_id: driveNodeId, name: "文件盘", slug: driveNodeSlug, metadata: {}, metadata_fields: [] },
          bases: {
            featured: {
              base_id: featuredBaseId,
              name: "资讯精选",
              slug: featuredBaseSlug || "featured-information",
              fields: [],
            },
            notices: {
              base_id: noticesBaseId,
              name: "保司通知",
              slug: noticesBaseSlug || "insurance-news",
              fields: [],
            },
            qa: { base_id: qaBaseId, name: "问答", slug: qaBaseSlug, fields: [] },
            feedback: { base_id: feedbackBaseId, name: "用户反馈", slug: feedbackBaseSlug, fields: [] },
          },
          metrics: {
            file_count: 0,
            metadata_field_count: 0,
            qa_count: 0,
            featured_count: 0,
            notice_count: 0,
            news_count: 0,
            feedback_count: 0,
            total_records: 0,
            data_quality_score: 0,
            needs_governance: 0,
          },
          files: [],
          qa_pairs: [],
          news_items: [],
          featured_items: [],
          notice_items: [],
          feedback_items: [],
          warnings: [{ id: "busabase-error", severity: "warning", message: (error as Error).message }],
        };
      }
      return {
        app: "kelly-insure-data",
        data_provider: this.name,
        config_summary: await this.getConfigSummary(),
        onboarding: await this.getOnboarding(),
        lock: await this.getLock(),
        snapshot,
      };
    },

    async submitReview(review: ReviewInput) {
      return {
        ok: false,
        provider: this.name,
        unsupported: true,
        review,
        message:
          "Kelly Insure Data is currently a read-first Busabase governance dashboard; review writeback is not enabled.",
      };
    },

    async getAgentTasks() {
      return { ok: true, provider: this.name, tasks: [] };
    },

    async getConfigSummary() {
      return configSummary();
    },

    async getLock() {
      return null;
    },

    async getOnboarding() {
      const status = await providerStatus();
      return {
        completed: Boolean(status.ok),
        source: "busabase",
        provider_status: status,
      };
    },

    async completeOnboarding(marker: Record<string, unknown> = {}) {
      const status = await providerStatus();
      return {
        completed: Boolean(status.ok),
        completed_at: status.ok ? new Date().toISOString() : "",
        source: "busabase",
        provider_status: status,
        ...marker,
      };
    },
  };
}
