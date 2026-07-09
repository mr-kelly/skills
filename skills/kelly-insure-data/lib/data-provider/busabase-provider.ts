import { Busabase } from "busabase-sdk";
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

async function listRecords(bb: Busabase, baseId: string, limit: number): Promise<AnyRecord[]> {
  const records = bb.records as AnyRecord;
  if (typeof records.listPaged === "function") {
    const page = await records.listPaged({ baseId, limit });
    return Array.isArray(page?.records) ? page.records : [];
  }
  const list = await records.list({ limit });
  return Array.isArray(list) ? list.filter((record) => record.baseId === baseId) : [];
}

async function resolveBase(bb: Busabase, id: string, slug: string) {
  if (!id && !slug) return null;
  const bases = await bb.bases.list();
  return bases.find((base: AnyRecord) => base.id === id || base.slug === slug) || null;
}

async function resolveDrive(bb: Busabase, id: string, slug: string) {
  const drives = bb.drives as AnyRecord;
  if (id && typeof drives.get === "function") {
    try {
      return await drives.get({ nodeId: id });
    } catch {
      // Fall through to list-based resolution for older or renamed nodes.
    }
  }
  const list = typeof drives.list === "function" ? await drives.list() : [];
  if (!Array.isArray(list)) return null;
  if (!id && !slug) return list[0] || null;
  return (
    list.find(
      (drive: AnyRecord) => drive?.node?.id === id || drive?.node?.slug === slug || drive?.node?.name === slug,
    ) || null
  );
}

async function listDriveFiles(bb: Busabase, drive: AnyRecord): Promise<AnyRecord[]> {
  const nodeId = drive?.node?.id || drive?.nodeId || drive?.id;
  if (nodeId && typeof (bb.drives as AnyRecord).listFiles === "function") {
    try {
      return await (bb.drives as AnyRecord).listFiles({ nodeId });
    } catch {
      // The drive object may already include a file list.
    }
  }
  return Array.isArray(drive?.files) ? drive.files : [];
}

export function createBusabaseProvider(configResult: ConfigResult) {
  const config = configResult.config || {};
  const busa = config.busabase || {};
  const baseUrl = process.env.KELLY_INSURE_DATA_BUSABASE_URL || busa.base_url || process.env.BUSABASE_BASE_URL || "";
  const apiKeyEnv = busa.api_key_env || "KELLY_INSURE_DATA_BUSABASE_API_KEY";
  const apiKey =
    process.env[apiKeyEnv] || process.env.KELLY_INSURE_DATA_BUSABASE_API_KEY || process.env.BUSABASE_API_KEY || "";
  const spaceId =
    process.env.KELLY_INSURE_DATA_BUSABASE_SPACE_ID || busa.space_id || process.env.BUSABASE_SPACE_ID || "";
  const driveNodeId = process.env.KELLY_INSURE_DATA_BUSABASE_DRIVE_NODE_ID || busa.drive_node_id || "";
  const driveNodeSlug = busa.drive_node_slug || "";
  const qaBaseId = process.env.KELLY_INSURE_DATA_BUSABASE_QA_BASE_ID || busa.qa_base_id || "";
  const qaBaseSlug = busa.qa_base_slug || "";
  const newsBaseId = process.env.KELLY_INSURE_DATA_BUSABASE_NEWS_BASE_ID || busa.news_base_id || "";
  const newsBaseSlug = busa.news_base_slug || "";
  const limit = recordLimit(config);
  const fileRequiredFields = Array.isArray(config.taxonomy?.file_metadata_fields)
    ? config.taxonomy.file_metadata_fields
    : [];

  function client() {
    return new Busabase({ baseUrl: baseUrl || undefined, apiKey: apiKey || undefined, spaceId: spaceId || undefined });
  }

  async function readSnapshot(): Promise<InsureSnapshot> {
    const bb = client();
    const [drive, qaBase, newsBase] = await Promise.all([
      resolveDrive(bb, driveNodeId, driveNodeSlug),
      resolveBase(bb, qaBaseId, qaBaseSlug),
      resolveBase(bb, newsBaseId, newsBaseSlug),
    ]);
    const [driveFiles, qaRecords, newsRecords] = await Promise.all([
      drive ? listDriveFiles(bb, drive) : [],
      qaBase ? listRecords(bb, qaBase.id, limit) : [],
      newsBase ? listRecords(bb, newsBase.id, limit) : [],
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
      const health = await client().health();
      return { ok: true, health };
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
