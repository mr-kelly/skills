import fs from "node:fs/promises";
import path from "node:path";
import { summarizeConfig } from "../config.ts";
import { DATA_DIR, LOCK_PATH, ONBOARDING_PATH, SNAPSHOT_PATH } from "../paths.ts";
import type { ConfigResult, InsureSnapshot, InsureState } from "../types.ts";
import type { ReviewInput } from "./provider-interface.ts";

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function governance(fields: Record<string, unknown>, requiredFields: string[]) {
  const missing = requiredFields.filter((key) => {
    const value = fields[key];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
  const completeness_pct = requiredFields.length
    ? Math.round(((requiredFields.length - missing.length) / requiredFields.length) * 100)
    : 100;
  return {
    completeness_pct,
    missing_fields: missing,
    status: String(fields.status || (missing.length ? "needs_metadata" : "active")),
  };
}

export function demoSnapshot(): InsureSnapshot {
  const fileRequired = ["policy_type", "carrier", "region", "effective_date", "status"];
  const qaRequired = ["question", "answer", "carrier"];
  const newsRequired = ["title"];
  const feedbackRequired = ["title", "content", "source", "created_at", "status"];
  const files = [
    {
      id: "file-policy-hk-medical",
      name: "HK Medical Plan Summary.pdf",
      path: "/plans/hk-medical-summary.pdf",
      size: 842130,
      mime_type: "application/pdf",
      updated_at: "2026-07-07T09:20:00.000Z",
      metadata: {
        policy_type: "medical",
        carrier: "Example Life",
        region: "Hong Kong",
        effective_date: "2026-01-01",
        status: "active",
      },
    },
    {
      id: "file-critical-illness",
      name: "Critical Illness Rider Notes.md",
      path: "/riders/critical-illness.md",
      size: 18640,
      mime_type: "text/markdown",
      updated_at: "2026-07-04T11:10:00.000Z",
      metadata: {
        policy_type: "critical_illness",
        carrier: "Northstar Mutual",
        region: "US",
        status: "review",
      },
    },
    {
      id: "file-claims-playbook",
      name: "Claims Playbook.docx",
      path: "/operations/claims-playbook.docx",
      size: 233901,
      mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      updated_at: "2026-07-01T16:40:00.000Z",
      metadata: {
        policy_type: "claims",
        owner: "ops",
        status: "active",
        tags: ["claims", "workflow"],
      },
    },
    {
      id: "file-annuity-table",
      name: "Annuity Rate Table.xlsx",
      path: "/products/annuity-rate-table.xlsx",
      size: 112004,
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      updated_at: "2026-06-29T03:05:00.000Z",
      metadata: {
        policy_type: "annuity",
        carrier: "Example Life",
        status: "draft",
      },
    },
  ].map((file) => ({ ...file, governance: governance(file.metadata, fileRequired) }));
  const qaPairs = [
    {
      id: "qa-waiting-period",
      question: "住院医疗险的 waiting period 通常怎么看？",
      answer:
        "先看 policy schedule 和 exclusions。常见结构是意外即时生效、疾病有等待期，既往症和特定治疗会有单独限制。",
      category: "policy_terms",
      source: "HK Medical Plan Summary.pdf",
      tags: ["waiting_period", "medical"],
      updated_at: "2026-07-07T09:45:00.000Z",
      status: "active",
      fields: {},
    },
    {
      id: "qa-critical-illness",
      question: "Critical illness rider 和医疗报销有什么本质区别？",
      answer: "重疾 rider 通常按诊断条件触发一次性给付；医疗报销通常按合资格医疗费用和限额报销。",
      category: "product_compare",
      source: "Critical Illness Rider Notes.md",
      tags: ["critical_illness", "claims"],
      updated_at: "2026-07-04T12:00:00.000Z",
      status: "active",
      fields: {},
    },
    {
      id: "qa-claim-docs",
      question: "理赔资料最少要准备哪些？",
      answer: "一般至少需要保单信息、身份证明、诊断或账单、收据、付款证明，以及保险公司指定的 claim form。",
      category: "claims",
      source: "Claims Playbook.docx",
      tags: ["claims", "documents"],
      updated_at: "2026-07-01T17:00:00.000Z",
      status: "active",
      fields: {},
    },
    {
      id: "qa-annuity-rate",
      question: "年金利率表更新后要同步检查什么？",
      answer: "检查 illustration、销售话术、最低保证描述、适用地区和生效日期，避免旧表继续被引用。",
      category: "ops",
      source: "Annuity Rate Table.xlsx",
      tags: ["annuity", "rate_table"],
      updated_at: "2026-06-29T04:00:00.000Z",
      status: "review",
      fields: {},
    },
  ].map((item) => {
    const fields = {
      question: item.question,
      answer: item.answer,
      carrier: item.source,
      source_path: item.source,
      status: item.status,
    };
    return {
      ...item,
      fields,
      governance: governance(fields, qaRequired),
    };
  });
  const newsItems = [
    {
      id: "news-ai-underwriting",
      collection: "featured" as const,
      title: "Insurers expand AI-assisted underwriting pilots",
      summary:
        "Several carriers are testing AI triage for non-binding underwriting review, with human sign-off retained for final decisions.",
      url: "https://example.com/insurance-ai-underwriting",
      source: "Industry Brief",
      published_at: "2026-07-08",
      category: "underwriting",
      tags: ["ai", "underwriting"],
      status: "watch",
      fields: {},
    },
    {
      id: "news-cat-risk",
      collection: "featured" as const,
      title: "Catastrophe risk models add new regional flood layers",
      summary:
        "Model vendors are adding more granular flood and urban drainage assumptions after recent extreme rainfall events.",
      url: "https://example.com/cat-risk-flood",
      source: "Risk Weekly",
      published_at: "2026-07-05",
      category: "risk",
      tags: ["cat_risk", "flood"],
      status: "active",
      fields: {},
    },
    {
      id: "news-health-claims",
      collection: "notice" as const,
      title: "Health claim automation focuses on document completeness",
      summary:
        "New automation efforts are prioritizing missing-document detection before adjudication to reduce claim cycle time.",
      url: "https://example.com/claims-document-completeness",
      source: "Claims Monitor",
      published_at: "2026-07-03",
      category: "claims",
      tags: ["claims", "automation"],
      status: "active",
      fields: {},
    },
  ].map((item) => {
    const fields = {
      title: item.title,
      content: item.summary,
      source_url: item.url,
      published_at: item.published_at,
      carrier: item.source,
      status: item.status,
      content_html: "",
      content_type: item.collection === "featured" ? "information" : "knowledge",
      category: item.category,
      attachments: [],
      lifebee_key: item.id,
    };
    return {
      ...item,
      fields,
      governance: governance(fields, newsRequired),
    };
  });
  const featuredItems = newsItems.filter((item) => item.collection === "featured");
  const noticeItems = newsItems.filter((item) => item.collection === "notice");
  const feedbackItems = [
    {
      id: "feedback-brochure-clarity",
      title: "产品小册子的等待期说明不够醒目",
      content: "客户反馈等待期和既往症限制散落在不同页，销售同事希望能有统一摘要。",
      source: "HK Medical Plan Summary.pdf",
      user_name: "Ops reviewer",
      contact: "",
      rating: "4",
      category: "document_clarity",
      tags: ["medical", "waiting_period"],
      created_at: "2026-07-08T10:30:00.000Z",
      status: "new",
      fields: {},
    },
    {
      id: "feedback-qa-source",
      title: "问答需要补充条款页码",
      content: "部分 QA 已有答案但缺少具体 PDF 页码，复核时需要回到原文件确认。",
      source: "问答",
      user_name: "Kelly",
      contact: "",
      rating: "",
      category: "traceability",
      tags: ["qa", "source"],
      created_at: "2026-07-06T15:20:00.000Z",
      status: "needs_review",
      fields: {},
    },
  ].map((item) => ({
    ...item,
    fields: {
      title: item.title,
      content: item.content,
      source: item.source,
      user_name: item.user_name,
      contact: item.contact,
      rating: item.rating,
      category: item.category,
      tags: item.tags,
      created_at: item.created_at,
      status: item.status,
    },
    governance: governance(item, feedbackRequired),
  }));
  const governed = [...files, ...qaPairs, ...newsItems, ...feedbackItems];
  const dataQualityScore = Math.round(
    governed.reduce((sum, item) => sum + Number(item.governance.completeness_pct || 0), 0) / governed.length,
  );
  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-insure-data-demo",
    drive: {
      node_id: "",
      name: "港险资料库",
      slug: "hk-insurance-drive",
      metadata: {
        owner: "Kelly",
        purpose: "Policy documents, product brochures, claims guides, and underwriting notes",
        region: "HK / US",
        retention: "review quarterly",
      },
      metadata_fields: [
        { key: "owner", value: "Kelly" },
        { key: "purpose", value: "Policy documents, product brochures, claims guides, and underwriting notes" },
        { key: "region", value: "HK / US" },
        { key: "retention", value: "review quarterly" },
      ],
    },
    bases: {
      featured: {
        base_id: "bse_demo_featured",
        name: "资讯精选",
        slug: "featured-information",
        fields: [
          { key: "title", value: "text (required)" },
          { key: "content", value: "longtext" },
          { key: "source_url", value: "url" },
          { key: "published_at", value: "date" },
          { key: "carrier", value: "text" },
          { key: "status", value: "text" },
          { key: "content_html", value: "html" },
          { key: "content_type", value: "select (information/knowledge)" },
          { key: "category", value: "text" },
          { key: "attachments", value: "attachment" },
          { key: "lifebee_key", value: "text" },
        ],
      },
      notices: {
        base_id: "bse_demo_notices",
        name: "保司通知",
        slug: "insurance-news",
        fields: [
          { key: "title", value: "text (required)" },
          { key: "content", value: "longtext" },
          { key: "source_url", value: "url" },
          { key: "published_at", value: "date" },
          { key: "carrier", value: "text" },
          { key: "status", value: "text" },
          { key: "content_html", value: "html" },
          { key: "content_type", value: "select (information/knowledge)" },
          { key: "category", value: "text" },
          { key: "attachments", value: "attachment" },
          { key: "lifebee_key", value: "text" },
        ],
      },
      qa: {
        base_id: "bse_demo_qa",
        name: "问答",
        slug: "insurance-qa",
        fields: [
          { key: "question", value: "text" },
          { key: "answer", value: "longtext" },
          { key: "carrier", value: "text" },
          { key: "source_path", value: "text" },
          { key: "status", value: "text" },
        ],
      },
      feedback: {
        base_id: "bse_demo_feedback",
        name: "用户反馈",
        slug: "user-feedback",
        fields: [
          { key: "title", value: "text" },
          { key: "content", value: "longtext" },
          { key: "source", value: "text" },
          { key: "status", value: "select" },
          { key: "created_at", value: "date" },
        ],
      },
    },
    metrics: {
      file_count: files.length,
      metadata_field_count: 4,
      qa_count: qaPairs.length,
      featured_count: featuredItems.length,
      notice_count: noticeItems.length,
      news_count: newsItems.length,
      feedback_count: feedbackItems.length,
      total_records: governed.length,
      data_quality_score: dataQualityScore,
      needs_governance: governed.filter(
        (item) =>
          item.governance.missing_fields.length ||
          ["draft", "review", "needs_metadata"].includes(item.governance.status),
      ).length,
    },
    files,
    qa_pairs: qaPairs,
    news_items: newsItems,
    featured_items: featuredItems,
    notice_items: noticeItems,
    feedback_items: feedbackItems,
    warnings: [],
  };
}

function normalizeLocalSnapshot(snapshot: InsureSnapshot | Record<string, unknown>): InsureSnapshot {
  const value = snapshot as Record<string, any>;
  value.bases ||= {};
  value.bases.featured ||= {
    base_id: "",
    name: "资讯精选",
    slug: "featured-information",
    fields: [],
  };
  value.bases.notices ||= value.bases.news || {
    base_id: "",
    name: "保司通知",
    slug: "insurance-news",
    fields: [],
  };

  const newsItems = Array.isArray(value.news_items)
    ? value.news_items.map((item: Record<string, unknown>) => ({
        ...item,
        collection: item.collection === "featured" ? "featured" : "notice",
      }))
    : [];
  value.news_items = newsItems;
  value.featured_items = Array.isArray(value.featured_items)
    ? value.featured_items
    : newsItems.filter((item: Record<string, unknown>) => item.collection === "featured");
  value.notice_items = Array.isArray(value.notice_items)
    ? value.notice_items
    : newsItems.filter((item: Record<string, unknown>) => item.collection === "notice");
  value.metrics ||= {};
  value.metrics.featured_count ??= value.featured_items.length;
  value.metrics.notice_count ??= value.notice_items.length;
  value.metrics.news_count ??= newsItems.length;
  return value as InsureSnapshot;
}

export function createLocalFileProvider(configResult: ConfigResult) {
  async function getConfigSummary() {
    return { ...summarizeConfig(configResult), provider: "local" };
  }

  async function getOnboarding() {
    return (await readJson<Record<string, unknown>>(ONBOARDING_PATH, { completed: false })) || { completed: false };
  }

  async function getLock() {
    return await readJson<Record<string, unknown>>(LOCK_PATH, null);
  }

  return {
    name: "local",

    async readSnapshot(): Promise<InsureSnapshot> {
      const snapshot = await readJson<InsureSnapshot | Record<string, unknown>>(SNAPSHOT_PATH, demoSnapshot());
      return normalizeLocalSnapshot(snapshot || demoSnapshot());
    },

    async getState(): Promise<InsureState> {
      const [snapshot, onboarding, lock] = await Promise.all([
        this.readSnapshot(),
        this.getOnboarding(),
        this.getLock(),
      ]);
      return {
        app: "kelly-insure-data",
        data_provider: this.name,
        config_summary: await this.getConfigSummary(),
        onboarding,
        lock,
        snapshot,
      };
    },

    async submitReview(review: ReviewInput) {
      return {
        ok: false,
        provider: this.name,
        unsupported: true,
        review,
        message: "Kelly Insure Data is currently a read-first governance dashboard; review writeback is not enabled.",
      };
    },

    async getAgentTasks() {
      return { ok: true, provider: this.name, tasks: [] };
    },

    getConfigSummary,

    getLock,

    getOnboarding,

    async completeOnboarding(marker: Record<string, unknown> = {}) {
      const onboarding = {
        completed: true,
        completed_at: new Date().toISOString(),
        config_version: "1",
        ...marker,
      };
      await writeJson(ONBOARDING_PATH, onboarding);
      return onboarding;
    },

    async writeSnapshot(snapshot: Record<string, unknown>) {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await writeJson(SNAPSHOT_PATH, snapshot);
      const typedSnapshot = snapshot as unknown as Partial<InsureSnapshot>;
      const metrics = typedSnapshot.metrics || {
        file_count: 0,
        qa_count: 0,
        featured_count: 0,
        notice_count: 0,
        news_count: 0,
        feedback_count: 0,
      };
      return {
        ok: true,
        path: SNAPSHOT_PATH,
        file_count: metrics.file_count || 0,
        qa_count: metrics.qa_count || 0,
        featured_count: metrics.featured_count || 0,
        notice_count: metrics.notice_count || 0,
        news_count: metrics.news_count || 0,
        feedback_count: metrics.feedback_count || 0,
      };
    },
  };
}
