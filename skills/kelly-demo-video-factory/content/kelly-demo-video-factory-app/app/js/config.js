// Static resource declaration for Kelly Demo Video Factory.
//
// Read-only AirApp: the browser only ever reads `videos`/`video-shots` (see
// js/providers/busabase-provider.js — writeProcedures is empty, records.changeRequest
// and bases.createChangeRequest are never called from here). Every record write
// (proposing a video/shot, marking recording status) goes through the skill-root
// trusted scripts (scripts/ensure_schema.mjs / propose_video.mjs /
// set_shot_status.mjs / status.mjs), or a human editing directly in the Busabase
// web app — see SKILL.md's Boundary section.
//
// Schema/structure is normally created ahead of time by `scripts/ensure_schema.mjs`
// (which also wires the videos.shots <-> video-shots.video bidirectional relation —
// a two-phase operation the generic lazy-create flow below cannot do in one shot,
// since a relation field's targetBaseId must name an ALREADY-CREATED Base). That
// script stamps the same ownership metadata (appId/resourceKey/schemaVersion) this
// config declares, so js/resource-provisioning.js adopts its output immediately.
// The `fields` below (including the `select`/`relation`/`markdown`/`url`/`attachment`
// types) mirror the retired lib/data-provider/busabase-schema.ts manifest field for
// field, and matter for two things: documentation, and resource-provisioning.js's
// ownership-repair field-shape check if it ever needs to re-adopt a legacy folder.
export const appConfig = {
  appId: "kelly-demo-video-factory",
  appName: "Kelly Demo Video Factory",
  deployment: "cloud",
  locale: "auto",
  readOnly: true,
  spaceId: "",
  schemaVersion: 1,
  folder: {
    name: "Video Factory",
    description:
      "Demo/marketing video planning pipeline: idea -> storyboard -> verified claims -> recording -> post-production.",
    slug: "kelly-demo-video-factory",
  },
  airApp: {
    name: "Kelly Demo Video Factory",
    slug: "kelly-demo-video-factory-app",
    resourceKey: "kelly-demo-video-factory-app",
  },
  bases: [
    {
      key: "videos",
      name: "Videos",
      slug: "kelly-demo-video-factory-videos",
      description:
        "One row per video: purpose, hook, pain point, concept, status, verified claims, HyperFrame path, final video URL, owner.",
      readLimit: 100,
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "series", name: "Series", type: "select", required: false, options: { choices: [] } },
        { slug: "purpose", name: "Purpose", type: "longtext", required: false },
        { slug: "hook", name: "Hook", type: "longtext", required: false },
        { slug: "pain-point", name: "Pain Point", type: "longtext", required: false },
        { slug: "concept", name: "Concept", type: "longtext", required: false },
        {
          slug: "status",
          name: "Status",
          type: "select",
          required: false,
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
        { slug: "verified-claims", name: "Verified Claims", type: "markdown", required: false },
        { slug: "hyperframe-path", name: "Hyperframe Path", type: "text", required: false },
        { slug: "final-video-url", name: "Final Video URL", type: "url", required: false },
        {
          slug: "owner",
          name: "Owner",
          type: "select",
          required: false,
          options: {
            choices: [
              { id: "kelly", name: "kelly", color: "pink" },
              { id: "ai", name: "ai", color: "cyan" },
            ],
          },
        },
        // Inverse of video-shots.video — backfilled per-record by
        // scripts/propose_video.mjs --merge after shots exist. The AirApp's own
        // read never depends on this field: busabase-provider.js joins shots to
        // their video client-side instead (see the "known limitation" this
        // mirrors from the retired lib/data-provider/busabase-schema.ts).
        { slug: "shots", name: "Shots", type: "relation", required: false, options: { multiple: true } },
      ],
    },
    {
      key: "video-shots",
      name: "Video Shots",
      slug: "kelly-demo-video-factory-video-shots",
      description:
        "One row per shot: linked video, shot number, timecode, scene, code reference, script line, note, recording status, asset.",
      readLimit: 100,
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "video", name: "Video", type: "relation", required: false, options: { multiple: false } },
        {
          slug: "shot-number",
          name: "Shot Number",
          type: "number",
          required: false,
          options: { number: { format: "plain" } },
        },
        { slug: "timecode", name: "Timecode", type: "text", required: false },
        { slug: "scene", name: "Scene", type: "longtext", required: false },
        { slug: "code-reference", name: "Code Reference", type: "text", required: false },
        { slug: "script-line", name: "Script Line", type: "longtext", required: false },
        { slug: "note", name: "Note", type: "longtext", required: false },
        {
          slug: "recording-status",
          name: "Recording Status",
          type: "select",
          required: false,
          options: {
            choices: [
              { id: "pending", name: "pending", color: "gray" },
              { id: "recorded", name: "recorded", color: "green" },
              { id: "needs_reshoot", name: "needs_reshoot", color: "red" },
            ],
          },
        },
        {
          slug: "asset",
          name: "Asset",
          type: "attachment",
          required: false,
          options: { attachment: { maxFiles: 10 } },
        },
      ],
    },
  ],
  templateRelations: {
    "videos.shots": "video-shots",
    "video-shots.video": "videos",
  },
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    writeProcedures: [],
  },
};
