#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "../lib/data-provider/busabase-client.ts";

type JsonRecord = Record<string, any>;

function parseArgs(argv = process.argv.slice(2)) {
  const flags: JsonRecord = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}

async function readJson<T = JsonRecord>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs();
const manifestPath = String(args.manifest || path.join(skillDir, "app", ".data", "busabase_restore_manifest.json"));
const filesRoot = path.resolve(String(args.filesRoot || args["files-root"] || process.cwd()));
const apply = Boolean(args.apply);
const dryRun = Boolean(args["dry-run"] || !apply);
const chunkSize = Number.parseInt(String(args.chunkSize || args["chunk-size"] || "50"), 10);

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

function basePayload(base: JsonRecord, parentNodeId: string) {
  return {
    parentNodeId,
    slug: base.slug,
    name: base.name,
    description: base.description || "",
    fields: (base.fields || []).map((field: JsonRecord) => ({
      slug: field.slug,
      name: field.name || field.slug,
      type: field.type || "text",
      required: Boolean(field.required),
      options: field.options || {},
    })),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function existingState(client: ReturnType<typeof createBusabaseClient>) {
  const [nodes, bases] = await Promise.all([client.listNodes(), client.listBases()]);
  return { nodes: flatten(Array.isArray(nodes) ? nodes : []), bases };
}

async function ensureFolderAndDrive(client: ReturnType<typeof createBusabaseClient>, manifest: JsonRecord) {
  const state = await existingState(client);
  let folder = state.nodes.find((node) => node.slug === manifest.folder.slug && node.type === "folder");
  let drive = folder
    ? state.nodes.find(
        (node) => node.parentId === folder.id && node.slug === manifest.drive.slug && node.type === "drive",
      )
    : null;

  const operations: JsonRecord[] = [];
  if (!folder) {
    operations.push({
      kind: "create",
      ref: "restore-folder",
      nodeType: "folder",
      slug: manifest.folder.slug,
      name: manifest.folder.name,
      description: manifest.folder.description || "",
    });
  }
  if (!drive) {
    operations.push({
      kind: "create",
      ref: "restore-drive",
      nodeType: "drive",
      parentNodeId: folder?.id,
      parentNodeRef: folder ? undefined : "restore-folder",
      slug: manifest.drive.slug,
      name: manifest.drive.name,
      description: manifest.drive.description || "",
      metadata: manifest.drive.metadata || {},
    });
  }
  if (!operations.length) return { folder, drive, created: false };
  if (dryRun) {
    console.log(JSON.stringify({ dry_run: true, action: "create_nodes", operations }, null, 2));
    return { folder, drive, created: false };
  }
  await client.createNodeChangeRequest(operations, "Restore Kelly Insure Data folder and Drive");
  const refreshed = await existingState(client);
  folder = refreshed.nodes.find((node) => node.slug === manifest.folder.slug && node.type === "folder");
  drive = folder
    ? refreshed.nodes.find(
        (node) => node.parentId === folder.id && node.slug === manifest.drive.slug && node.type === "drive",
      )
    : null;
  if (!folder || !drive) throw new Error("Failed to resolve restored folder or Drive.");
  return { folder, drive, created: true };
}

async function ensureBases(
  client: ReturnType<typeof createBusabaseClient>,
  manifest: JsonRecord,
  parentNodeId: string,
) {
  let state = await existingState(client);
  const result: JsonRecord = {};
  for (const kind of ["qa", "news", "feedback"]) {
    const expected = manifest.bases[kind];
    if (!expected) continue;
    let found = state.bases.find((base: JsonRecord) => base.slug === expected.slug);
    if (found) {
      result[kind] = found;
      continue;
    }
    if (dryRun) {
      console.log(
        JSON.stringify(
          { dry_run: true, action: "create_base", kind, payload: basePayload(expected, parentNodeId) },
          null,
          2,
        ),
      );
      result[kind] = null;
      continue;
    }
    const created = await client.createBase(basePayload(expected, parentNodeId));
    if (created?.id && created?.targetType === "node") {
      await client.approveAndMerge(created.id);
    }
    state = await existingState(client);
    found = state.bases.find((base: JsonRecord) => base.slug === expected.slug);
    if (!found) throw new Error(`Failed to resolve restored ${kind} Base: ${expected.slug}`);
    result[kind] = found;
  }
  return result;
}

async function restoreFiles(
  client: ReturnType<typeof createBusabaseClient>,
  driveNodeId: string,
  manifest: JsonRecord,
) {
  const existing = await client.listDriveFiles(driveNodeId);
  const existingPaths = new Set(existing.map((file: JsonRecord) => file.path));
  const operations: JsonRecord[] = [];
  let missingLocal = 0;
  let skippedExisting = 0;
  for (const file of manifest.drive.files || []) {
    if (existingPaths.has(file.path)) {
      skippedExisting += 1;
      continue;
    }
    const localFile = path.join(filesRoot, file.path);
    try {
      await fs.access(localFile);
    } catch {
      missingLocal += 1;
      console.warn(`Missing local file: ${localFile}`);
      continue;
    }
    if (dryRun) {
      operations.push({ kind: "create", path: file.path, localFile, mimeType: file.mimeType });
      continue;
    }
    const uploaded = await client.uploadAsset(
      localFile,
      file.mimeType || "application/octet-stream",
      file.metadata || {},
    );
    operations.push({
      kind: "create",
      path: file.path,
      assetId: uploaded.assetId,
      displayName: file.displayName || file.name,
      mimeType: file.mimeType,
    });
    if (operations.length >= chunkSize) {
      const cr = await client.createDriveChangeRequest(
        driveNodeId,
        operations.splice(0),
        "Restore Kelly Insure Data Drive files",
      );
      await client.approveAndMerge(cr.id);
    }
  }
  if (dryRun) {
    console.log(
      JSON.stringify(
        { dry_run: true, action: "restore_files", count: operations.length, missingLocal, skippedExisting },
        null,
        2,
      ),
    );
    return { restored: 0, planned: operations.length, missingLocal, skippedExisting };
  }
  if (operations.length) {
    const cr = await client.createDriveChangeRequest(driveNodeId, operations, "Restore Kelly Insure Data Drive files");
    await client.approveAndMerge(cr.id);
  }
  return {
    restored: (manifest.drive.files || []).length - missingLocal - skippedExisting,
    missingLocal,
    skippedExisting,
  };
}

async function restoreRecords(
  client: ReturnType<typeof createBusabaseClient>,
  baseId: string,
  records: JsonRecord[],
  label: string,
) {
  if (!records?.length) return { restored: 0 };
  const existingRecords = await client.listRecords(baseId, 1000).catch(() => []);
  const existingSignatures = new Set(
    existingRecords.map((record: JsonRecord) => stableJson(record.fields || record.headCommit?.fields || {})),
  );
  const missingRecords = records.filter((record) => !existingSignatures.has(stableJson(record.fields || {})));
  if (!missingRecords.length)
    return dryRun ? { planned: 0, skippedExisting: records.length } : { restored: 0, skippedExisting: records.length };
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          action: "restore_records",
          label,
          records: missingRecords.length,
          skippedExisting: records.length - missingRecords.length,
        },
        null,
        2,
      ),
    );
    return { planned: missingRecords.length, skippedExisting: records.length - missingRecords.length };
  }
  let restored = 0;
  for (let index = 0; index < missingRecords.length; index += chunkSize) {
    const chunk = missingRecords.slice(index, index + chunkSize).map((record) => record.fields || {});
    const cr = await client.bulkRecordChangeRequest(baseId, chunk, `Restore Kelly Insure Data ${label} records`);
    await client.approveAndMerge(cr.id);
    restored += chunk.length;
  }
  return { restored, skippedExisting: records.length - missingRecords.length };
}

async function main() {
  const manifest = await readJson<JsonRecord>(manifestPath);
  const client = createBusabaseClient({ envPrefix: "KELLY_INSURE_DATA" });
  const nodeResult = await ensureFolderAndDrive(client, manifest);
  const folderId = nodeResult.folder?.id;
  const driveNodeId = nodeResult.drive?.id;
  if (!folderId || !driveNodeId) {
    if (dryRun) {
      console.log(
        JSON.stringify(
          { dry_run: true, done: true, note: "Use --apply to create missing folder/Drive before restoring data." },
          null,
          2,
        ),
      );
      return;
    }
    throw new Error("Missing folder or Drive after node restore.");
  }
  const bases = await ensureBases(client, manifest, folderId);
  const files = await restoreFiles(client, driveNodeId, manifest);
  const qa = bases.qa?.id
    ? await restoreRecords(client, bases.qa.id, manifest.bases.qa.records || [], "QA")
    : { restored: 0 };
  const news = bases.news?.id
    ? await restoreRecords(client, bases.news.id, manifest.bases.news.records || [], "news")
    : { restored: 0 };
  const feedback = bases.feedback?.id
    ? await restoreRecords(client, bases.feedback.id, manifest.bases.feedback?.records || [], "feedback")
    : { restored: 0 };
  console.log(JSON.stringify({ ok: true, dry_run: dryRun, files, qa, news, feedback }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
