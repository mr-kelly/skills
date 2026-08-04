// Reads the operator-provisioned Kelly Insure Data Busabase workspace (one
// Drive node, four Bases) through js/insure-client.js and normalizes it with
// js/insure-model.js — a faithful port of the retired
// lib/data-provider/busabase-provider.ts's readSnapshot(). Never creates or
// writes anything (see js/config.js's header comment for why); a missing
// Drive or Base degrades to a snapshot warning instead of a blocking setup
// screen, exactly like the original.
import { appConfig } from "../config.js?v=0.1.0";
import { listDriveFiles, listRecords, resolveBase, resolveDrive } from "../insure-client.js?v=0.1.0";
import {
  metadataFields,
  needsGovernance,
  normalizeFeedback,
  normalizeFile,
  normalizeNews,
  normalizeQa,
  qualityScore,
} from "../insure-model.js?v=0.1.0";

function baseByKey(key) {
  return appConfig.bases.find((base) => base.key === key);
}

function baseSummary(resolved, declared) {
  return {
    base_id: String(resolved?.id || ""),
    name: String(resolved?.name || declared.name),
    slug: String(resolved?.slug || declared.slug),
    fields: Array.isArray(resolved?.fields)
      ? resolved.fields.map((field) => ({
          key: field.slug || field.id,
          value: `${field.name || field.slug} (${field.type})`,
        }))
      : [],
  };
}

function emptySnapshot(message) {
  const drive = appConfig.drive;
  const featured = baseByKey("featured");
  const notices = baseByKey("notices");
  const qa = baseByKey("qa");
  const feedback = baseByKey("feedback");
  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "busabase",
    drive: { node_id: "", name: drive.name, slug: drive.slug, metadata: {}, metadata_fields: [] },
    bases: {
      featured: { base_id: "", name: featured.name, slug: featured.slug, fields: [] },
      notices: { base_id: "", name: notices.name, slug: notices.slug, fields: [] },
      qa: { base_id: "", name: qa.name, slug: qa.slug, fields: [] },
      feedback: { base_id: "", name: feedback.name, slug: feedback.slug, fields: [] },
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
    warnings: [{ id: "busabase-error", severity: "warning", message }],
  };
}

async function readSnapshot() {
  const drive = appConfig.drive;
  const featured = baseByKey("featured");
  const notices = baseByKey("notices");
  const qa = baseByKey("qa");
  const feedback = baseByKey("feedback");

  const [driveResult, featuredBase, noticesBase, qaBase, feedbackBase] = await Promise.all([
    resolveDrive("", drive.slug),
    resolveBase("", featured.slug),
    resolveBase("", notices.slug),
    resolveBase("", qa.slug),
    resolveBase("", feedback.slug),
  ]);
  const resolvedDriveNodeId = driveResult?.node?.id || driveResult?.nodeId || driveResult?.id || "";
  const [driveFiles, featuredRecords, noticesRecords, qaRecords, feedbackRecords] = await Promise.all([
    resolvedDriveNodeId ? listDriveFiles(resolvedDriveNodeId) : [],
    featuredBase ? listRecords(featuredBase.id, featured.readLimit) : [],
    noticesBase ? listRecords(noticesBase.id, notices.readLimit) : [],
    qaBase ? listRecords(qaBase.id, qa.readLimit) : [],
    feedbackBase ? listRecords(feedbackBase.id, feedback.readLimit) : [],
  ]);

  const files = driveFiles.map((file) => normalizeFile(file, appConfig.taxonomy.file_metadata_fields));
  const qaPairs = qaRecords.map((record) => normalizeQa(record, appConfig.taxonomy.qa_fields));
  const featuredItems = featuredRecords.map((record) =>
    normalizeNews(record, appConfig.taxonomy.featured_fields, "featured"),
  );
  const noticeItems = noticesRecords.map((record) =>
    normalizeNews(record, appConfig.taxonomy.notices_fields, "notice"),
  );
  const newsItems = [...featuredItems, ...noticeItems];
  const feedbackItems = feedbackRecords.map((record) => normalizeFeedback(record, appConfig.taxonomy.feedback_fields));
  const allGoverned = [...files, ...qaPairs, ...newsItems, ...feedbackItems];
  const driveMetadata = driveResult?.node?.metadata || {};

  const warnings = [];
  if (!driveResult)
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

  const snapshot = {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "busabase",
    drive: {
      node_id: String(resolvedDriveNodeId || ""),
      name: String(driveResult?.node?.name || drive.name),
      slug: String(driveResult?.node?.slug || drive.slug),
      metadata: driveMetadata,
      metadata_fields: metadataFields(driveMetadata),
    },
    bases: {
      featured: baseSummary(featuredBase, featured),
      notices: baseSummary(noticesBase, notices),
      qa: baseSummary(qaBase, qa),
      feedback: baseSummary(feedbackBase, feedback),
    },
    metrics: {
      file_count: files.length,
      metadata_field_count: metadataFields(driveMetadata).length,
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

  return snapshot;
}

function configSummary() {
  const drive = appConfig.drive;
  const featured = baseByKey("featured");
  const notices = baseByKey("notices");
  const qa = baseByKey("qa");
  const feedback = baseByKey("feedback");
  return {
    config_path: "busabase:workspace/kelly-insure-data",
    is_example: false,
    drive: { slug: drive.slug },
    bases: {
      featured: featured.slug,
      notices: notices.slug,
      qa: qa.slug,
      feedback: feedback.slug,
    },
  };
}

export const busabaseProvider = {
  kind: "busabase",

  // Mirrors the retired lib/data-provider/busabase-provider.ts's getState():
  // readSnapshot() is allowed to throw on ANY single unexpected Busabase
  // error (a network hiccup, an auth/permission error, an endpoint the
  // connected Busabase server version doesn't expose) and this wrapper
  // always still returns a valid, empty-but-labeled snapshot instead of
  // letting the AirApp crash into the generic "workspace not ready" screen.
  // A resource that is simply not found (missing Drive/Base) is handled
  // more precisely inside readSnapshot() as a per-resource warning; this
  // catch is the coarse fallback for everything else.
  async getState() {
    let snapshot;
    try {
      snapshot = await readSnapshot();
    } catch (error) {
      snapshot = emptySnapshot(error instanceof Error ? error.message : String(error));
    }
    return {
      app: "kelly-insure-data",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: true, source: "busabase" },
      config_summary: configSummary(),
      lock: null,
      snapshot,
    };
  },

  async provisionResources() {
    throw new Error(
      "Kelly Insure Data reads an operator-provisioned Busabase workspace; there is nothing for the AirApp to provision.",
    );
  },
};
