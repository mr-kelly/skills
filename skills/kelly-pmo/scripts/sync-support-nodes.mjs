#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../content/kelly-pmo-app/app/js/config.js";

const ownership = (resourceKey) => ({ appId: appConfig.appId, resourceKey, schemaVersion: appConfig.schemaVersion });
const createNodeId = (result) =>
  result.node?.id || result.mergeSummary?.mergedNodeIds?.[0] || result.operations?.[0]?.nodeId;
const flatten = (nodes) => nodes.flatMap((node) => [node, ...flatten(node.children || [])]);

async function createContentNode(client, folderId, declaration, content) {
  const result = await client.nodes.createChangeRequest({
    operations: [
      {
        kind: "create",
        nodeType: declaration.type,
        slug: declaration.slug,
        name: declaration.name,
        description: `${declaration.name} for Kelly PMO`,
        parentNodeId: folderId,
        metadata: ownership(declaration.key),
      },
    ],
    message: `Create Kelly PMO ${declaration.name}`,
    submittedBy: appConfig.appId,
    autoMerge: true,
  });
  const nodeId = createNodeId(result);
  if (!nodeId) throw new Error(`Could not resolve created node id for ${declaration.slug}.`);
  if (content) {
    await client.nodes.updateContent({
      nodeId,
      content,
      message: `Initialize Kelly PMO ${declaration.name}`,
      submittedBy: appConfig.appId,
      autoMerge: true,
    });
  }
  return nodeId;
}

export async function syncSupportNodes(
  client,
  { apply = false, log = console, baseUrl = process.env.BUSABASE_BASE_URL } = {},
) {
  const tree = await client.nodes.list({ depth: 2 });
  const nodes = flatten(tree);
  const folder = nodes.find((node) => node.type === "folder" && node.slug === appConfig.folder.slug);
  if (!folder) throw new Error(`Folder not ready: ${appConfig.folder.slug}`);
  const children = nodes.filter((node) => node.parentId === folder.id);
  const bySlug = new Map(children.map((node) => [node.slug, node]));
  const missing = appConfig.supportNodes.filter((item) => !bySlug.has(item.slug));
  const repairs = [];
  for (const declaration of appConfig.supportNodes) {
    const existing = bySlug.get(declaration.slug);
    if (existing && existing.type !== declaration.type) {
      throw new Error(`Node collision: ${declaration.slug} is ${existing.type}, expected ${declaration.type}.`);
    }
    if (
      existing &&
      (existing.metadata?.appId !== appConfig.appId ||
        existing.metadata?.resourceKey !== declaration.key ||
        existing.metadata?.schemaVersion !== appConfig.schemaVersion)
    ) {
      repairs.push({ declaration, existing });
    }
  }
  if (!missing.length && !repairs.length) {
    log.log("Kelly PMO supporting nodes are up to date.");
    return { missing: 0, applied: 0 };
  }
  for (const item of missing) log.log(`create ${item.type.padEnd(10)} ${item.slug}`);
  for (const item of repairs) log.log(`repair ${item.declaration.type.padEnd(10)} ${item.declaration.slug}`);
  if (!apply) {
    log.log(
      `Dry run only. Re-run with --apply to materialize ${missing.length + repairs.length} supporting node change(s).`,
    );
    return { missing: missing.length, repairs: repairs.length, applied: 0 };
  }

  for (const repair of repairs) {
    await client.nodes.updateMetadata({
      nodeId: repair.existing.id,
      metadata: ownership(repair.declaration.key),
    });
  }

  const reportsBase = nodes.find((node) => node.type === "base" && node.slug === "kelly-pmo-reports");
  for (const declaration of missing) {
    if (declaration.type === "doc") {
      const created = await client.docs.create({
        parentNodeId: folder.id,
        slug: declaration.slug,
        name: declaration.name,
        description: "Versioned operating guidance for the Kelly PMO workspace.",
        body: "# PMO Operating Playbook\n\nKeep health evidence-based, update one report per project and ISO week, and record cross-project decisions.",
        autoMerge: true,
      });
      await client.nodes.updateMetadata({ nodeId: created.node.id, metadata: ownership(declaration.key) });
      continue;
    }
    if (declaration.type === "drive" || declaration.type === "skill") {
      const files =
        declaration.type === "drive"
          ? [{ path: "README.md", content: "# PMO Files\n\nSource packs, evidence, exports, and attachments.\n" }]
          : [
              {
                path: "SKILL.md",
                content:
                  "---\nname: kelly-pmo-operator\ndescription: Maintain Kelly PMO from approved project evidence.\n---\n\n# PMO Operator\n",
              },
            ];
      const created = await client.fileTrees.create({
        type: declaration.type,
        parentNodeId: folder.id,
        slug: declaration.slug,
        name: declaration.name,
        description: `${declaration.name} for Kelly PMO`,
        version: "0.2.0",
        visibility: "workspace",
        metadata: ownership(declaration.key),
        files,
        mergeMode: "replace",
        autoMerge: true,
      });
      await client.nodes.updateMetadata({ nodeId: created.node.id, metadata: ownership(declaration.key) });
      continue;
    }
    if (declaration.type === "file") {
      const bytes = Buffer.from(
        "project-id,name,program,team,status,health,owner,sponsor,progress,start-date,target-date,next-report-due,next-action\n",
        "utf8",
      );
      const upload = await client.assets.createUploadUrl({
        fileName: "pmo-import-schema.csv",
        mimeType: "text/csv",
        sizeBytes: bytes.byteLength,
        context: appConfig.appId,
      });
      if (!baseUrl) throw new Error("A Busabase base URL is required to upload the PMO import schema.");
      const response = await fetch(new URL(upload.uploadUrl, baseUrl), {
        method: "PUT",
        headers: { "content-type": "text/csv" },
        body: bytes,
      });
      if (!response.ok) throw new Error(`PMO import schema upload failed with HTTP ${response.status}.`);
      const confirmed = await client.assets.confirm({
        storageKey: upload.storageKey,
        fileName: "pmo-import-schema.csv",
        mimeType: "text/csv",
        sizeBytes: bytes.byteLength,
        context: appConfig.appId,
      });
      const created = await client.files.create({
        parentNodeId: folder.id,
        slug: declaration.slug,
        name: declaration.name,
        description: "Header-only CSV template for project-plan imports.",
        assetId: confirmed.assetId,
        autoMerge: true,
      });
      await client.nodes.updateMetadata({ nodeId: created.node.id, metadata: ownership(declaration.key) });
      continue;
    }
    if (declaration.type === "whiteboard") {
      await createContentNode(client, folder.id, declaration, {
        kind: "whiteboard",
        document: { version: 1, elements: [], appState: { title: "Kelly PMO dependency map" } },
      });
      continue;
    }
    if (declaration.type === "workflow") {
      await createContentNode(client, folder.id, declaration, {
        kind: "workflow",
        document: {
          version: 2,
          nodes: [
            { id: "weekly", kind: "trigger", position: { x: 0, y: 0 }, label: "Weekly status", eventName: "weekly" },
            { id: "review", kind: "approval", position: { x: 220, y: 0 }, label: "PMO review", approver: "PMO lead" },
            { id: "done", kind: "end", position: { x: 440, y: 0 }, label: "Portfolio refreshed", outcome: "complete" },
          ],
          edges: [
            { id: "weekly-review", source: "weekly", target: "review", label: "", outcome: "" },
            { id: "review-done", source: "review", target: "done", label: "approved", outcome: "approved" },
          ],
          settings: { executionMode: "manual", concurrency: 1, timeoutMs: 300_000, errorPolicy: "stop" },
        },
      });
      continue;
    }
    if (declaration.type === "html") {
      await createContentNode(client, folder.id, declaration, {
        kind: "html",
        document: {
          version: 1,
          source:
            '<!doctype html><meta charset="utf-8"><title>Kelly PMO Wallboard</title><main><h1>Kelly PMO</h1><p>Open the AirApp for live portfolio health.</p></main>',
        },
      });
      continue;
    }
    if (declaration.type === "form") {
      if (!reportsBase?.baseId) throw new Error("Status Reports Base is not ready for the weekly form.");
      const nodeId = await createContentNode(client, folder.id, declaration);
      await client.forms.create({
        nodeId,
        targetBaseId: reportsBase.baseId,
        name: declaration.name,
        description: "Private weekly project status intake.",
        bindings: [
          { inputName: "report_id", fieldSlug: "report-id", required: true, label: "Report ID" },
          { inputName: "project_id", fieldSlug: "project-id", required: true, label: "Project ID" },
          { inputName: "period_key", fieldSlug: "period-key", required: true, label: "ISO week" },
          { inputName: "summary", fieldSlug: "summary", required: true, label: "Summary" },
          { inputName: "health", fieldSlug: "health", required: true, label: "Health" },
        ],
        page: { code: "<main><h1>Weekly project status</h1></main>" },
        share: { isPublic: false, anonymousSubmit: false },
      });
    }
  }
  log.log(`Materialized ${missing.length + repairs.length} Kelly PMO supporting node change(s).`);
  return { missing: missing.length, repairs: repairs.length, applied: missing.length + repairs.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("Missing BUSABASE_BASE_URL; support-node sync needs an explicit trusted connection.");
  const client = createBusabaseClient({
    baseUrl,
    apiKey: process.env.BUSABASE_API_KEY || undefined,
    spaceId: process.env.BUSABASE_SPACE_ID || undefined,
  });
  await syncSupportNodes(client, { apply: process.argv.includes("--apply"), baseUrl });
}
