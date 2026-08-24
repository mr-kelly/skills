// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// The dataset itself is ported verbatim from the retired
// lib/data-provider/local-file-provider.ts's demoSnapshot() (this skill's
// original local-mode fixture), reusing js/insure-model.js's governance()
// scorer so the completeness math matches the Busabase-backed provider
// exactly.
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
import { governance } from "../insure-model.js?v=0.1.0";

const NOW = "2026-07-08T10:30:00.000Z";

function demoSnapshot() {
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
    },
  ].map((item) => {
    const fields = {
      question: item.question,
      answer: item.answer,
      carrier: item.source,
      source_path: item.source,
      status: item.status,
    };
    return { ...item, fields, governance: governance(fields, qaRequired) };
  });

  const newsSeeds = [
    {
      id: "news-ai-underwriting",
      collection: "featured",
      title: "Insurers expand AI-assisted underwriting pilots",
      summary:
        "Several carriers are testing AI triage for non-binding underwriting review, with human sign-off retained for final decisions.",
      url: "https://example.com/insurance-ai-underwriting",
      source: "Industry Brief",
      published_at: "2026-07-08",
      category: "underwriting",
      tags: ["ai", "underwriting"],
      status: "watch",
    },
    {
      id: "news-cat-risk",
      collection: "featured",
      title: "Catastrophe risk models add new regional flood layers",
      summary:
        "Model vendors are adding more granular flood and urban drainage assumptions after recent extreme rainfall events.",
      url: "https://example.com/cat-risk-flood",
      source: "Risk Weekly",
      published_at: "2026-07-05",
      category: "risk",
      tags: ["cat_risk", "flood"],
      status: "active",
    },
    {
      id: "news-health-claims",
      collection: "notice",
      title: "Health claim automation focuses on document completeness",
      summary:
        "New automation efforts are prioritizing missing-document detection before adjudication to reduce claim cycle time.",
      url: "https://example.com/claims-document-completeness",
      source: "Claims Monitor",
      published_at: "2026-07-03",
      category: "claims",
      tags: ["claims", "automation"],
      status: "active",
    },
  ];
  const newsItems = newsSeeds.map((item) => {
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
    return { ...item, fields, governance: governance(fields, newsRequired) };
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
    },
  ].map((item) => {
    const fields = {
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
    };
    return { ...item, fields, governance: governance(fields, feedbackRequired) };
  });

  const governed = [...files, ...qaPairs, ...newsItems, ...feedbackItems];
  const dataQualityScore = Math.round(
    governed.reduce((sum, item) => sum + Number(item.governance.completeness_pct || 0), 0) / governed.length,
  );

  return {
    schema_version: "1",
    generated_at: NOW,
    source: "kelly-insure-data-demo",
    drive: {
      node_id: "",
      name: "港险资料库",
      slug: "kelly-insure-data-files",
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
        slug: "kelly-insure-data-featured",
        fields: [
          { key: "title", value: "Title (text, required)" },
          { key: "content", value: "Content (longtext)" },
          { key: "source_url", value: "Source URL (url)" },
          { key: "published_at", value: "Published at (date)" },
          { key: "carrier", value: "Carrier (text)" },
          { key: "status", value: "Status (text)" },
        ],
      },
      notices: {
        base_id: "bse_demo_notices",
        name: "保司通知",
        slug: "kelly-insure-data-notices",
        fields: [
          { key: "title", value: "Title (text, required)" },
          { key: "content", value: "Content (longtext)" },
          { key: "source_url", value: "Source URL (url)" },
          { key: "published_at", value: "Published at (date)" },
          { key: "carrier", value: "Carrier (text)" },
          { key: "status", value: "Status (text)" },
        ],
      },
      qa: {
        base_id: "bse_demo_qa",
        name: "问答",
        slug: "kelly-insure-data-qa",
        fields: [
          { key: "question", value: "Question (text)" },
          { key: "answer", value: "Answer (longtext)" },
          { key: "carrier", value: "Carrier (text)" },
          { key: "source_path", value: "Source path (text)" },
          { key: "status", value: "Status (text)" },
        ],
      },
      feedback: {
        base_id: "bse_demo_feedback",
        name: "用户反馈",
        slug: "kelly-insure-data-feedback",
        fields: [
          { key: "title", value: "Title (text)" },
          { key: "content", value: "Content (longtext)" },
          { key: "source", value: "Source (text)" },
          { key: "status", value: "Status (select)" },
          { key: "created_at", value: "Created at (date)" },
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
      total_records: files.length + qaPairs.length + newsItems.length + feedbackItems.length,
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

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const snapshot = demoSnapshot();
    return {
      app: "kelly-insure-data",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-insure-data/config.json",
        is_example: false,
        drive: { slug: snapshot.drive.slug },
        bases: {
          featured: snapshot.bases.featured.slug,
          notices: snapshot.bases.notices.slug,
          qa: snapshot.bases.qa.slug,
          feedback: snapshot.bases.feedback.slug,
        },
      },
      demo_visuals: demoVisualsForApp("kelly-insure-data"),
      snapshot: { ...snapshot, demo_visuals: demoVisualsForApp("kelly-insure-data") },
    };
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
