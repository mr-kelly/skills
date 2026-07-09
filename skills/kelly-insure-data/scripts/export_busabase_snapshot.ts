#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BusabaseRestoreClient, fieldsOf, parseArgs, text, writeJson, type JsonRecord } from "./busabase_restore_lib.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs();
const output = String(args.output || path.join(skillDir, "app", ".data", "busabase_restore_manifest.json"));
const folderSlug = String(args.folderSlug || args["folder-slug"] || "hk-insurance-library-0630");
const driveSlug = String(args.driveSlug || args["drive-slug"] || "hk-insurance-drive");
const qaSlug = String(args.qaSlug || args["qa-slug"] || "insurance-qa");
const newsSlug = String(args.newsSlug || args["news-slug"] || "insurance-news");
const concurrency = Number.parseInt(String(args.concurrency || "8"), 10);

function flatten(nodes: JsonRecord[]): JsonRecord[] {
  const out: JsonRecord[] = [];
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.shift();
    if (!node) continue;
    out.push(node);
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return out;
}

function normalizeField(field: JsonRecord) {
  return {
    slug: field.slug,
    name: text(field.name) || field.slug,
    type: field.type || "text",
    required: Boolean(field.required),
    options: field.options || {},
  };
}

function normalizeRecord(record: JsonRecord) {
  return {
    id: record.id,
    fields: fieldsOf(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const client = new BusabaseRestoreClient();
  const [nodes, bases] = await Promise.all([client.listNodes(), client.listBases()]);
  const allNodes = flatten(Array.isArray(nodes) ? nodes : []);
  const folder = allNodes.find((node) => node.slug === folderSlug);
  if (!folder) throw new Error(`Folder not found: ${folderSlug}`);
  const driveNode = allNodes.find((node) => node.parentId === folder.id && node.type === "drive" && node.slug === driveSlug);
  if (!driveNode) throw new Error(`Drive not found under ${folderSlug}: ${driveSlug}`);
  const qaBase = bases.find((base: JsonRecord) => base.slug === qaSlug);
  const newsBase = bases.find((base: JsonRecord) => base.slug === newsSlug);
  if (!qaBase) throw new Error(`QA Base not found: ${qaSlug}`);
  if (!newsBase) throw new Error(`News Base not found: ${newsSlug}`);

  const [drive, driveFiles, qaRecords, newsRecords] = await Promise.all([
    client.getDrive(driveNode.id),
    client.listDriveFiles(driveNode.id),
    client.recordsForBase(qaBase.id),
    client.recordsForBase(newsBase.id),
  ]);

  const files = await mapLimit(driveFiles, concurrency, async (file) => {
    let assetMetadata: JsonRecord = {};
    let contentHash = "";
    if (file.assetId) {
      try {
        const detail = await client.getAsset(file.assetId);
        assetMetadata = detail?.asset?.metadata || {};
        contentHash = detail?.asset?.contentHash || "";
      } catch {
        assetMetadata = {};
      }
    }
    return {
      path: file.path,
      name: file.name,
      displayName: file.displayName || file.name,
      size: file.size,
      mimeType: file.mimeType,
      updatedAt: file.updatedAt,
      assetId: file.assetId,
      contentHash,
      metadata: assetMetadata,
    };
  });

  const manifest = {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "busabase",
    folder: {
      id: folder.id,
      slug: folder.slug,
      name: folder.name,
      description: folder.description || "",
    },
    drive: {
      node_id: driveNode.id,
      slug: driveNode.slug,
      name: driveNode.name,
      description: driveNode.description || "",
      metadata: drive?.node?.metadata || driveNode.metadata || {},
      files,
    },
    bases: {
      qa: {
        id: qaBase.id,
        node_id: qaBase.nodeId,
        slug: qaBase.slug,
        name: qaBase.name,
        description: qaBase.description || "",
        fields: (qaBase.fields || []).map(normalizeField),
        records: qaRecords.map(normalizeRecord),
      },
      news: {
        id: newsBase.id,
        node_id: newsBase.nodeId,
        slug: newsBase.slug,
        name: newsBase.name,
        description: newsBase.description || "",
        fields: (newsBase.fields || []).map(normalizeField),
        records: newsRecords.map(normalizeRecord),
      },
    },
  };

  await writeJson(output, manifest);
  console.log(
    JSON.stringify(
      {
        ok: true,
        output,
        files: files.length,
        qa_records: qaRecords.length,
        news_records: newsRecords.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
