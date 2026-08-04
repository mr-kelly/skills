// Static resource declaration for Kelly Insure Data.
//
// Unlike every other skill in this migration batch, the Drive node and the
// four Bases below are NOT owned/created by this AirApp — they are an
// existing production Busabase workspace (one insurance-document Drive plus
// four Bases) that an operator provisions out-of-band with the trusted
// scripts in the skill-root scripts/ directory
// (export_busabase_snapshot.mjs / restore_busabase_snapshot.mjs /
// backfill_pdf_metadata.mjs). The AirApp only ever resolves these resources
// by slug and reads them (see js/insure-client.js + js/providers/busabase-provider.js);
// it never runs resource-provisioning.js's create-if-missing flow, because
// there is nothing for a read-only reader to safely create in someone else's
// canonical insurance dataset. A missing Drive or Base degrades to a
// snapshot warning, exactly like the retired lib/data-provider/busabase-provider.ts
// did, instead of blocking behind a "Initialize workspace" setup screen.
export const appConfig = {
  appId: "kelly-insure-data",
  appName: "Kelly Insure Data",
  deployment: "cloud",
  locale: "auto",
  readOnly: true,
  drive: {
    key: "drive",
    name: "港险资料库 Drive",
    slug: "hk-insurance-drive",
  },
  bases: [
    {
      key: "featured",
      name: "资讯精选",
      slug: "featured-information",
      readLimit: 100,
    },
    {
      key: "notices",
      name: "保司通知",
      slug: "insurance-news",
      readLimit: 100,
    },
    {
      key: "qa",
      name: "问答",
      slug: "insurance-qa",
      readLimit: 100,
    },
    {
      key: "feedback",
      name: "用户反馈",
      slug: "user-feedback",
      readLimit: 100,
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
