#!/usr/bin/env node
// Idempotent: creates the video-factory Folder + videos/video-shots Bases only if missing.
// Structure changes use autoMerge — only run this after the human has approved the schema
// shape once (see SKILL.md). Safe to re-run: it no-ops if bases exist.
//
// Ported from the retired scripts/ensure_schema.ts onto scripts/lib/busabase-client.mjs
// (which fixes several REST call shapes that predate verification against the real
// busabase-sdk 0.11.0 contract — see that file's header comment). One deliberate
// addition beyond a faithful port: every created node gets a `metadata:
// {appId, resourceKey, schemaVersion}` stamp matching app/app/js/config.js's
// declarations, so the AirApp's generic resource-provisioning.js (which expects that
// stamp, or a "legacy" exact slug/name/description match, to treat a Folder/Base as
// already provisioned) adopts these resources immediately with no repair step —
// same convention every other Busabase-only Kelly skill's browser-side provisioning
// already uses for resources it creates itself.
import {
  approveAndMerge,
  createFieldChangeRequest,
  createNodeChangeRequest,
  findBase,
  getNode,
  listBases,
  loadBusabaseConfig,
  updateFieldChangeRequest,
} from "./lib/busabase-client.mjs";

const APP_ID = "kelly-demo-video-factory";
const SCHEMA_VERSION = 1;

const cfg = loadBusabaseConfig();

function meta(resourceKey) {
  return { appId: APP_ID, resourceKey, schemaVersion: SCHEMA_VERSION };
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

  let folderNodeId;
  let videosBaseId;

  if (!existingVideos) {
    const r = await createNodeChangeRequest(
      cfg,
      [
        {
          kind: "create",
          ref: "folder",
          nodeType: "folder",
          slug: "video-factory",
          name: "Video Factory",
          description:
            "Demo/marketing video planning pipeline: idea -> storyboard -> verified claims -> recording -> post-production.",
          metadata: meta("app-root"),
        },
        {
          kind: "create",
          parentNodeRef: "folder",
          nodeType: "base",
          slug: "videos",
          name: "Videos",
          description:
            "One row per video: purpose, hook, pain point, concept, status, verified claims, HyperFrame path, final video URL, owner.",
          metadata: meta("videos"),
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
      "Create video-factory folder + videos Base",
    );
    folderNodeId = r.mergeSummary.mergedNodeIds[0];
    videosBaseId = (await findBase(cfg, "videos")).id;
    console.log("Created folder", folderNodeId, "and videos base", videosBaseId);
  } else {
    videosBaseId = existingVideos.id;
    const bases = await listBases(cfg);
    const videosNode = bases.find((b) => b.slug === "videos");
    // parent folder id: fetch node tree ancestor — fall back to re-deriving via node get.
    const node = await getNode(cfg, videosNode.nodeId);
    folderNodeId = node.parentNodeId ?? node.parentId ?? node.node?.parentId;
  }

  if (!existingShots) {
    await createNodeChangeRequest(
      cfg,
      [
        {
          kind: "create",
          parentNodeId: folderNodeId,
          nodeType: "base",
          slug: "video-shots",
          name: "Video Shots",
          description:
            "One row per shot: linked video, shot number, timecode, scene, code reference, script line, note, recording status, asset.",
          metadata: meta("video-shots"),
          fields: [
            { slug: "title", name: "Title", type: "text", required: true },
            {
              slug: "video",
              name: "Video",
              type: "relation",
              options: { targetBaseId: videosBaseId, multiple: false },
            },
            { slug: "shot-number", name: "Shot Number", type: "number", options: { number: { format: "plain" } } },
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
            { slug: "asset", name: "Asset", type: "attachment", options: { attachment: { maxFiles: 10 } } },
          ],
        },
      ],
      "Create video-shots Base",
    );
    console.log("Created video-shots base");

    // Inverse relation on videos so a Video record shows its Shots in the Busabase UI.
    // Field ChangeRequests have no autoMerge option (unlike node/record CRs — see
    // createFieldChangeRequest's comment), so both steps below explicitly
    // approveAndMerge after proposing.
    const shotsBase = await findBase(cfg, "video-shots");
    const shotsBaseId = shotsBase.id;
    const videoField = shotsBase.fields.find((f) => f.slug === "video");
    const shotsFieldCr = await createFieldChangeRequest(
      cfg,
      videosBaseId,
      {
        name: "Shots",
        slug: "shots",
        type: "relation",
        options: { targetBaseId: shotsBaseId, multiple: true, inverseFieldId: videoField.id },
      },
      "Add inverse relation field so Videos shows its Shots",
    );
    await approveAndMerge(cfg, shotsFieldCr.id, "Schema setup — inverse relation");

    const shotsField = (await findBase(cfg, "videos")).fields.find((f) => f.slug === "shots");
    const videoFieldUpdateCr = await updateFieldChangeRequest(
      cfg,
      shotsBaseId,
      videoField.id,
      { options: { targetBaseId: videosBaseId, multiple: false, inverseFieldId: shotsField.id } },
      "Link video field to inverse Shots field on Videos base",
    );
    await approveAndMerge(cfg, videoFieldUpdateCr.id, "Schema setup — bidirectional relation");
    console.log("Wired bidirectional relation (videos.shots <-> video-shots.video)");
  }

  console.log("Schema ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
