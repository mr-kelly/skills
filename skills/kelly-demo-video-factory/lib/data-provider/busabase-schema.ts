// Machine-readable storage manifest for kelly-demo-video-factory.
// Mirrors the live schema validated against a running Busabase instance on 2026-07-11/12.
// See references/private-config-and-providers.md (app-in-skill-creator) for the manifest contract.

export const BUSABASE_SCHEMA = {
  provider: "busabase",
  schema_id: "kelly-demo-video-factory.storage",
  schema_version: "1",
  folder: {
    default_slug: "video-factory",
    children: ["videos", "video-shots"],
  },
  base: {
    slug: "videos",
    name: "Videos",
    // field order matches creation order; "title" is the PRIMARY field (record display name).
    fields: [
      { slug: "title", type: "text", required: true },
      { slug: "series", type: "select" },
      { slug: "purpose", type: "longtext" },
      { slug: "hook", type: "longtext" },
      { slug: "pain-point", type: "longtext" },
      { slug: "concept", type: "longtext" },
      {
        slug: "status",
        type: "select",
        choices: ["idea", "needs_review", "approved", "recording", "post_production", "done"],
      },
      { slug: "verified-claims", type: "markdown" },
      { slug: "hyperframe-path", type: "text" },
      { slug: "final-video-url", type: "url" },
      { slug: "owner", type: "select", choices: ["kelly", "ai"] },
      // inverse of video-shots.video — backfilled per-record after shots exist (see propose_video.ts)
      { slug: "shots", type: "relation", target: "video-shots", multiple: true },
    ],
    record_kinds: ["video"],
  },
  related_bases: [
    {
      slug: "video-shots",
      name: "Video Shots",
      fields: [
        { slug: "title", type: "text", required: true },
        { slug: "video", type: "relation", target: "videos", multiple: false },
        { slug: "shot-number", type: "number" },
        { slug: "timecode", type: "text" },
        { slug: "scene", type: "longtext" },
        { slug: "code-reference", type: "text" },
        { slug: "script-line", type: "longtext" },
        { slug: "note", type: "longtext" },
        {
          slug: "recording-status",
          type: "select",
          choices: ["pending", "recorded", "needs_reshoot"],
        },
        { slug: "asset", type: "attachment", maxFiles: 10 },
      ],
      record_kinds: ["shot"],
    },
  ],
} as const;

export type VideoStatus = "idea" | "needs_review" | "approved" | "recording" | "post_production" | "done";

export type ShotRecordingStatus = "pending" | "recorded" | "needs_reshoot";
