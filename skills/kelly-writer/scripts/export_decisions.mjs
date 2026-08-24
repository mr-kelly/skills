#!/usr/bin/env node
// Trusted export step. Kelly Writer's AirApp only ever writes a human
// verdict (approve/request_changes/block/revise) onto a draft record in
// Busabase — the browser cannot write to the local filesystem, and this
// skill never publishes to a channel itself (see SKILL.md's boundary). This
// script is the process authorized to act on `approved` drafts: it re-reads
// Busabase, packages each approved draft's title/channel/format/CTA/
// hashtags/media brief as Markdown (same layout as the retired
// lib/data-provider/local-file-provider.ts's exportApproved()), reattaches
// any locally-referenced images next to the original source
// (scripts/lib/content-assets.mjs, ported verbatim from that same file),
// zips the pair (scripts/lib/zip.mjs, ported verbatim from lib/zip.ts),
// writes the archive to a local output directory grouped by batch, and
// marks each exported draft `done`.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-writer-app/app/js/config.js";
import { packageMarkdownAssets } from "./lib/content-assets.mjs";
import { slugify } from "./lib/text.mjs";
import { writeZipFile } from "./lib/zip.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/export_decisions.mjs [--apply] [--out <dir>]

Reads drafts with status "approved" from Busabase. Without --apply this is a
dry run that only prints what would be exported. With --apply it writes a
Markdown file plus a ZIP archive (Markdown + any locally-referenced images)
per approved draft to <out>/<batch-id>/ (default out: exports/ at the skill
root), then marks each exported draft "done" in Busabase.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

// Same Markdown layout as the retired lib/data-provider/local-file-provider.ts's
// exportApproved().
function buildMarkdown(row) {
  const hashtags = parseJsonList(row.hashtags);
  return [
    `# ${row.title || ""}`,
    "",
    `Channel: ${row.channel || ""}`,
    `Format: ${row.format || "post"}`,
    row.decision_note ? `Review note: ${row.decision_note}` : "",
    "",
    row.body || "",
    "",
    row.cta ? `CTA: ${row.cta}` : "",
    hashtags.length ? `Hashtags: ${hashtags.join(" ")}` : "",
    row.media_brief ? `Media brief: ${row.media_brief}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf("--out");
  const outRoot = path.resolve(outIndex >= 0 ? argv[outIndex + 1] : path.join(SKILL_DIR, "exports"));

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Writer Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const draftsBase = resources.bases.find((base) => base.key === "drafts");
  const rows = await readAll(client, draftsBase);

  const exported = [];
  const skipped = [];

  for (const row of rows) {
    if (row.status !== "approved") continue;
    const batchId = row.batch_id || "kelly-writer";
    const outDir = path.join(outRoot, slugify(batchId));
    const markdown = buildMarkdown(row);
    const packaged = await packageMarkdownAssets(`${markdown}\n`, row.source_draft_path);
    const requestedFilename = row.export_filename || `${slugify(row.channel)}-${slugify(row.title)}.md`;
    const filename = path.basename(requestedFilename);
    const markdownTarget = path.join(outDir, filename);
    const archiveTarget = path.join(outDir, `${path.basename(filename, path.extname(filename))}.zip`);

    if (apply) {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(markdownTarget, packaged.markdown);
      await writeZipFile(archiveTarget, [
        { name: path.basename(markdownTarget), data: packaged.markdown },
        ...packaged.assets.map((asset) => ({ name: asset.archivePath, data: asset.data })),
      ]);
    }

    exported.push({
      draft_id: row.draft_id,
      channel: row.channel,
      file: archiveTarget,
      markdown_file: markdownTarget,
      assets: packaged.assets.map((asset) => asset.archivePath),
      missing_assets: packaged.missing,
    });

    if (apply) {
      const now = new Date().toISOString();
      await client.records.changeRequest({
        recordId: row.__recordId,
        operation: "update",
        fields: toBusabaseFields({ ...row, status: "done", decided_at: row.decided_at || now }),
        message: `Export draft ${row.draft_id}`,
        author: "kelly-writer-exporter",
        baseCommitId: row.__headCommitId,
        autoMerge: true,
      });
    }
  }

  for (const row of rows) {
    if (row.status !== "approved") skipped.push({ draft_id: row.draft_id, reason: `status ${row.status}` });
  }

  console.log(
    JSON.stringify(
      { exported_at: new Date().toISOString(), dry_run: !apply, output_root: outRoot, exported, skipped },
      null,
      2,
    ),
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write the export ZIPs and mark drafts done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
