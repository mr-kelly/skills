// Static resource declaration for Kelly Insure Data.
//
// The AirApp remains a read-only reader. Template installs create the declared
// Drive and Bases from generated content sidecars; existing operators can still
// populate them through the trusted snapshot/backfill scripts at skill root.
export const appConfig = {
  appId: "kelly-insure-data",
  appName: "Kelly Insure Data",
  deployment: "cloud",
  locale: "auto",
  readOnly: true,
  schemaVersion: 1,
  drive: {
    key: "drive",
    name: "港险资料库 Drive",
    slug: "kelly-insure-data-files",
    description: "Hong Kong insurance documents and source material",
  },
  // Transport page size is the reader's own concern (js/insure-client.js),
  // not a per-Base declaration — a Base is read to exhaustion regardless of
  // how many records it holds.
  folder: {
    slug: "kelly-insure-data",
    name: "Kelly Insure Data",
    description:
      "Insurance-industry App-in-Skill for read-only data governance, backed by an operator-provisioned Busabase workspace (one Drive node for the file drive plus four Bases for QA pairs, featured information, insurer notices, and user feedback) and trusted export/restore/PDF-text-backfill scripts. Use when the user invokes $kelly-insure-data or /kelly-insure-data, wants an insurance data workspace with UI, needs to review insurance files, metadata completeness, QA pairs, featured information, insurer notices, or user feedback, wants to back up or restore a Kelly Insure Data Busabase workspace from local PDFs, or wants Busabase Drive/Base data surfaced for data quality review and ongoing data governance.",
  },
  airApp: { name: "Kelly Insure Data", slug: "kelly-insure-data-app", resourceKey: "kelly-insure-data-app" },
  bases: [
    {
      key: "featured",
      name: "资讯精选",
      slug: "kelly-insure-data-featured",
      description: "Curated insurance information and product updates",
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "content", name: "Content", type: "longtext", required: false },
        { slug: "source_url", name: "Source URL", type: "url", required: false },
        { slug: "carrier", name: "Carrier", type: "text", required: false },
        { slug: "published_at", name: "Published At", type: "date", required: false },
        { slug: "category", name: "Category", type: "text", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
      ],
    },
    {
      key: "notices",
      name: "保司通知",
      slug: "kelly-insure-data-notices",
      description: "Carrier notices and operational announcements",
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "content", name: "Content", type: "longtext", required: false },
        { slug: "source_url", name: "Source URL", type: "url", required: false },
        { slug: "carrier", name: "Carrier", type: "text", required: false },
        { slug: "published_at", name: "Published At", type: "date", required: false },
        { slug: "category", name: "Category", type: "text", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
      ],
    },
    {
      key: "qa",
      name: "问答",
      slug: "kelly-insure-data-qa",
      description: "Insurance questions with reviewed answers and sources",
      fields: [
        { slug: "question", name: "Question", type: "text", required: true },
        { slug: "answer", name: "Answer", type: "longtext", required: false },
        { slug: "carrier", name: "Carrier", type: "text", required: false },
        { slug: "source_path", name: "Source Path", type: "text", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
      ],
    },
    {
      key: "feedback",
      name: "用户反馈",
      slug: "kelly-insure-data-feedback",
      description: "User feedback on insurance information and answers",
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "content", name: "Content", type: "longtext", required: false },
        { slug: "source", name: "Source", type: "text", required: false },
        { slug: "user_name", name: "User Name", type: "text", required: false },
        { slug: "contact", name: "Contact", type: "text", required: false },
        { slug: "rating", name: "Rating", type: "number", required: false },
        { slug: "category", name: "Category", type: "text", required: false },
        { slug: "tags", name: "Tags", type: "longtext", required: false },
        { slug: "created_at", name: "Created At", type: "date", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
      ],
    },
  ],
  // Default Busabase field slugs per collection, ported from the retired
  // lib/config.ts fieldMapping()/summarizeConfig() defaults. The retired
  // private-config-file override mechanism (per-deployment field renaming)
  // is not carried forward — every deployment of this AirApp reads the same
  // canonical field slugs.
  taxonomy: {
    file_metadata_fields: ["policy_type", "carrier", "region", "effective_date", "status"],
    qa_fields: {
      question: "question",
      answer: "answer",
      source: "carrier",
      source_path: "source_path",
      status: "status",
    },
    featured_fields: {
      title: "title",
      summary: "content",
      url: "source_url",
      source: "carrier",
      published_at: "published_at",
      category: "category",
      status: "status",
    },
    notices_fields: {
      title: "title",
      summary: "content",
      url: "source_url",
      source: "carrier",
      published_at: "published_at",
      category: "category",
      status: "status",
    },
    feedback_fields: {
      title: "title",
      content: "content",
      source: "source",
      user_name: "user_name",
      contact: "contact",
      rating: "rating",
      category: "category",
      tags: "tags",
      created_at: "created_at",
      status: "status",
    },
  },
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.list", "records.list", "drives.get", "drives.files.list"],
    writeProcedures: [],
  },
};
