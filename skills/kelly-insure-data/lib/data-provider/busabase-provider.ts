import { fieldMapping, recordLimit, summarizeConfig } from "../config.ts";
import type {
  ConfigResult,
  FieldMapping,
  InsureFile,
  InsureSnapshot,
  MetadataField,
  NewsItem,
  QaPair,
} from "../types.ts";
import { createBusabaseClient } from "./busabase-client.ts";

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
  const required = [mapping.question, mapping.answer, mapping.category, mapping.source].filter(Boolean) as string[];
  return {
    id: String(record.id || fields.id || crypto.randomUUID()),
    question: text(fields[mapping.question || "question"]) || "(no question)",
    answer: text(fields[mapping.answer || "answer"]),
    category: text(fields[mapping.category || "category"]),
    source: text(fields[mapping.source || "source"]),
    tags: compactArray(fields[mapping.tags || "tags"]),
    updated_at: String(record.updatedAt || record.createdAt || ""),
    status: text(fields.status) || record.status || "active",
    fields,
    governance: governance(fields, required),
  };
}

function normalizeNews(record: AnyRecord, mapping: FieldMapping): NewsItem {
  const fields = fieldsOf(record);
  const required = [mapping.title, mapping.summary, mapping.source, mapping.published_at].filter(Boolean) as string[];
  return {
    id: String(record.id || fields.id || crypto.randomUUID()),
    title: text(fields[mapping.title || "title"]) || "(untitled)",
    summary: text(fields[mapping.summary || "summary"]),
    url: text(fields[mapping.url || "url"]),
    source: text(fields[mapping.source || "source"]),
    published_at: text(fields[mapping.published_at || "published_at"]) || String(record.updatedAt || ""),
    category: text(fields[mapping.category || "category"]),
    tags: compactArray(fields[mapping.tags || "tags"]),
    status: text(fields.status) || record.status || "active",
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
  const qaBaseId = busa.meta.qaBaseId;
  const qaBaseSlug = busa.meta.qaBaseSlug;
  const newsBaseId = busa.meta.newsBaseId;
  const newsBaseSlug = busa.meta.newsBaseSlug;
  const limit = recordLimit(config);
  const fileRequiredFields = Array.isArray(config.taxonomy?.file_metadata_fields)
    ? config.taxonomy.file_metadata_fields
    : [];

  async function readSnapshot(): Promise<InsureSnapshot> {
    const [drive, qaBase, newsBase] = await Promise.all([
      busa.resolveDrive(driveNodeId, driveNodeSlug),
      busa.resolveBase(qaBaseId, qaBaseSlug),
      busa.resolveBase(newsBaseId, newsBaseSlug),
    ]);
    const resolvedDriveNodeId = drive?.node?.id || drive?.nodeId || drive?.id || driveNodeId;
    const [driveFiles, qaRecords, newsRecords] = await Promise.all([
      resolvedDriveNodeId ? busa.listDriveFiles(resolvedDriveNodeId) : [],
      qaBase ? busa.listRecords(qaBase.id, limit) : [],
      newsBase ? busa.listRecords(newsBase.id, limit) : [],
    ]);

    const files = driveFiles.map((file) => normalizeFile(file, fileRequiredFields));
    const qaPairs = qaRecords.map((record) => normalizeQa(record, fieldMapping("qa", config)));
    const newsItems = newsRecords.map((record) => normalizeNews(record, fieldMapping("news", config)));
    const allGoverned = [...files, ...qaPairs, ...newsItems];
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
    if (!newsBase)
      warnings.push({
        id: "missing-news-base",
        severity: "warning",
        message: "Busabase news Base is not configured or not found.",
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
        news: {
          base_id: String(newsBase?.id || newsBaseId || ""),
          name: String(newsBase?.name || "新闻资讯"),
          slug: String(newsBase?.slug || newsBaseSlug || ""),
          fields: Array.isArray(newsBase?.fields)
            ? newsBase.fields.map((field: AnyRecord) => ({
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
        news_count: newsItems.length,
        total_records: files.length + qaPairs.length + newsItems.length,
        data_quality_score: qualityScore(allGoverned),
        needs_governance: needsGovernance(allGoverned),
      },
      files,
      qa_pairs: qaPairs,
      news_items: newsItems,
      warnings,
    };
  }

  return {
    name: "busabase",

    async verifyConnection() {
      return busa.verifyConnection();
    },

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
            qa: { base_id: qaBaseId, name: "问答", slug: qaBaseSlug, fields: [] },
            news: { base_id: newsBaseId, name: "新闻资讯", slug: newsBaseSlug, fields: [] },
          },
          metrics: {
            file_count: 0,
            metadata_field_count: 0,
            qa_count: 0,
            news_count: 0,
            total_records: 0,
            data_quality_score: 0,
            needs_governance: 0,
          },
          files: [],
          qa_pairs: [],
          news_items: [],
          warnings: [{ id: "busabase-error", severity: "warning", message: (error as Error).message }],
        };
      }
      return {
        app: "kelly-insure-data",
        data_provider: this.name,
        config_summary: { ...summarizeConfig(configResult), provider: this.name },
        onboarding: { completed: true, source: "busabase" },
        lock: null,
        snapshot,
      };
    },
  };
}
