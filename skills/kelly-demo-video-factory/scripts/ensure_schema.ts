#!/usr/bin/env node
// Idempotent: creates the video-factory Folder + videos/video-shots Bases only if missing.
// Structure changes use autoMerge — only run this after the human has approved the schema
// shape once (see references/busabase-schema.md). Safe to re-run: it no-ops if bases exist.

import { findBase, loadBusabaseConfig } from "../lib/data-provider/busabase-client.ts";

const cfg = loadBusabaseConfig();

async function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.spaceId) headers["x-busabase-space"] = cfg.spaceId;
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return data;
}

async function main() {
  const existingVideos = await findBase(cfg, "videos");
  const existingShots = await findBase(cfg, "video-shots");

  if (existingVideos && existingShots) {
    console.log("Schema already present:");
    console.log("  videos      ", existingVideos.id);
    console.log("  video-shots ", existingShots.id);
    return;
  }

  let folderNodeId: string;
  let videosBaseId: string;

  if (!existingVideos) {
    const r = await call("POST", "/api/v1/nodes/change-requests", {
      message: "Create video-factory folder + videos Base",
      submittedBy: "agent",
      autoMerge: true,
      operations: [
        { kind: "create", ref: "folder", nodeType: "folder", slug: "video-factory", name: "Video Factory" },
        {
          kind: "create",
          parentNodeRef: "folder",
          nodeType: "base",
          slug: "videos",
          name: "Videos",
          fields: [
            { slug: "title", name: "Title", type: "text", required: true },
            { slug: "series", name: "Series", type: "select", options: { choices: [] } },
            { slug: "purpose", name: "Purpose", type: "longtext" },
            { slug: "hook", name: "Hook", type: "longtext" },
            { slug: "pain-point", name: "Pain Point", type: "longtext" },
            { slug: "concept", name: "Concept", type: "longtext" },
            {
              slug: "status",
              name: "Status",
              type: "select",
              options: {
                choices: [
                  { id: "idea", name: "idea", color: "gray" },
                  { id: "needs_review", name: "needs_review", color: "yellow" },
                  { id: "approved", name: "approved", color: "blue" },
                  { id: "recording", name: "recording", color: "orange" },
                  { id: "post_production", name: "post_production", color: "purple" },
                  { id: "done", name: "done", color: "green" },
                ],
              },
            },
            { slug: "verified-claims", name: "Verified Claims", type: "markdown" },
            { slug: "hyperframe-path", name: "Hyperframe Path", type: "text" },
            { slug: "final-video-url", name: "Final Video URL", type: "url" },
            {
              slug: "owner",
              name: "Owner",
              type: "select",
              options: {
                choices: [
                  { id: "kelly", name: "kelly", color: "pink" },
                  { id: "ai", name: "ai", color: "cyan" },
                ],
              },
            },
          ],
        },
      ],
    });
    folderNodeId = r.mergeSummary.mergedNodeIds[0];
    videosBaseId = (await findBase(cfg, "videos"))!.id;
    console.log("Created folder", folderNodeId, "and videos base", videosBaseId);
  } else {
    videosBaseId = existingVideos.id;
    const bases = (await call("GET", "/api/v1/bases")) as Array<{ id: string; nodeId: string; slug: string }>;
    const videosNode = bases.find((b) => b.slug === "videos")!;
    // parent folder id: fetch node tree ancestor — fall back to re-deriving via node get.
    const node = await call("GET", `/api/v1/nodes/${videosNode.nodeId}`);
    folderNodeId = node.parentNodeId ?? node.parentId;
  }

  if (!existingShots) {
    await call("POST", "/api/v1/nodes/change-requests", {
      message: "Create video_shots Base",
      submittedBy: "agent",
      autoMerge: true,
      operations: [
        {
          kind: "create",
          parentNodeId: folderNodeId,
          nodeType: "base",
          slug: "video-shots",
          name: "Video Shots",
          fields: [
            { slug: "title", name: "Title", type: "text", required: true },
            {
              slug: "video",
              name: "Video",
              type: "relation",
              options: { targetBaseId: videosBaseId, multiple: false },
            },
            { slug: "shot-number", name: "Shot Number", type: "number", options: { format: "plain" } },
            { slug: "timecode", name: "Timecode", type: "text" },
            { slug: "scene", name: "Scene", type: "longtext" },
            { slug: "code-reference", name: "Code Reference", type: "text" },
            { slug: "script-line", name: "Script Line", type: "longtext" },
            { slug: "note", name: "Note", type: "longtext" },
            {
              slug: "recording-status",
              name: "Recording Status",
              type: "select",
              options: {
                choices: [
                  { id: "pending", name: "pending", color: "gray" },
                  { id: "recorded", name: "recorded", color: "green" },
                  { id: "needs_reshoot", name: "needs_reshoot", color: "red" },
                ],
              },
            },
            { slug: "asset", name: "Asset", type: "attachment", options: { maxFiles: 10 } },
          ],
        },
      ],
    });
    console.log("Created video-shots base");

    // Inverse relation on videos so a Video record shows its Shots in the Busabase UI.
    const shotsBaseId = (await findBase(cfg, "video-shots"))!.id;
    const videoField = (await findBase(cfg, "video-shots"))!.fields.find((f) => f.slug === "video")!;
    const shotsFieldCr = await call("POST", `/api/v1/bases/${videosBaseId}/fields/change-requests`, {
      message: "Add inverse relation field so Videos shows its Shots",
      submittedBy: "agent",
      name: "Shots",
      slug: "shots",
      type: "relation",
      options: { targetBaseId: shotsBaseId, multiple: true, inverseFieldId: videoField.id },
    });
    await call("POST", `/api/v1/change-requests/${shotsFieldCr.id}/reviews`, {
      verdict: "approved",
      reason: "Schema setup — inverse relation",
    });
    await call("POST", `/api/v1/change-requests/${shotsFieldCr.id}/merge`);

    const shotsField = (await findBase(cfg, "videos"))!.fields.find((f) => f.slug === "shots")!;
    const videoFieldPatchCr = await call("PATCH", `/api/v1/bases/${shotsBaseId}/fields/change-requests`, {
      message: "Link video field to inverse Shots field on Videos base",
      submittedBy: "agent",
      fieldId: videoField.id,
      patch: { options: { targetBaseId: videosBaseId, multiple: false, inverseFieldId: shotsField.id } },
    });
    await call("POST", `/api/v1/change-requests/${videoFieldPatchCr.id}/reviews`, {
      verdict: "approved",
      reason: "Schema setup — bidirectional relation",
    });
    await call("POST", `/api/v1/change-requests/${videoFieldPatchCr.id}/merge`);
    console.log("Wired bidirectional relation (videos.shots <-> video-shots.video)");
  }

  console.log("Schema ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
