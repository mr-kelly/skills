#!/usr/bin/env node
// Propose a video + its storyboard shots from a JSON outline.
//
// Usage:
//   node scripts/propose_video.mjs path/to/outline.json           # propose only (stays in_review)
//   node scripts/propose_video.mjs path/to/outline.json --merge   # propose AND merge
//
// --merge must only be passed after the human has explicitly approved this exact
// content in the conversation (see SKILL.md "Never auto-merge records"). Without
// it, the video and every shot are left as pending ChangeRequests for review in
// the Busabase UI or via `busabase-cli change-requests review/merge`.
//
// Outline shape — see references/outline-schema.md.
import { readFileSync } from "node:fs";
import {
  SHOTS_BASE_SLUG,
  VIDEOS_BASE_SLUG,
  approveAndMerge,
  findBase,
  loadBusabaseConfig,
  proposeRecord,
  proposeRecordUpdate,
} from "./lib/busabase-client.mjs";

async function main() {
  const [outlinePath, flag] = process.argv.slice(2);
  if (!outlinePath) {
    console.error("Usage: propose_video.mjs <outline.json> [--merge]");
    process.exit(1);
  }
  const shouldMerge = flag === "--merge";
  const outline = JSON.parse(readFileSync(outlinePath, "utf8"));

  const cfg = loadBusabaseConfig();
  const videosBase = await findBase(cfg, VIDEOS_BASE_SLUG);
  const shotsBase = await findBase(cfg, SHOTS_BASE_SLUG);
  if (!videosBase || !shotsBase) {
    throw new Error("Schema missing — run `node scripts/ensure_schema.mjs` first.");
  }

  const videoCr = await proposeRecord(
    cfg,
    videosBase.id,
    {
      title: outline.title,
      series: outline.series,
      purpose: outline.purpose,
      hook: outline.hook,
      "pain-point": outline.pain_point,
      concept: outline.concept,
      status: "needs_review",
      "verified-claims": outline.verified_claims ?? "",
      owner: outline.owner ?? "kelly",
    },
    `Add video — ${outline.title}`,
  );
  console.log("video CR", videoCr.id, videoCr.status);

  let videoRecordId;
  if (shouldMerge) {
    const merged = await approveAndMerge(cfg, videoCr.id, "Kelly approved via chat");
    videoRecordId = merged.results[0].record.id;
    console.log("video record", videoRecordId);
  }

  const shotRecordIds = [];
  for (const [i, shot] of outline.shots.entries()) {
    const shotFields = {
      title: `${outline.title} · 镜头${i + 1}`,
      "shot-number": i + 1,
      timecode: shot.timecode,
      scene: shot.scene,
      "code-reference": shot.code_reference ?? "—",
      "script-line": shot.script_line,
      note: shot.note ?? "",
      "recording-status": "pending",
    };
    if (videoRecordId) shotFields.video = videoRecordId;

    const shotCr = await proposeRecord(cfg, shotsBase.id, shotFields, `Add shot — ${shotFields.title}`);
    console.log("  shot CR", shotCr.id, shotCr.status);

    if (shouldMerge) {
      const merged = await approveAndMerge(cfg, shotCr.id, "Kelly approved via chat");
      const recId = merged.results[0].record.id;
      shotRecordIds.push(recId);
    }
  }

  // Backfill the inverse `shots` field on the video record so it's visible from
  // the Videos side in the Busabase UI (the inverse field only displays what was
  // written on the video record itself; it is not computed live from the shots'
  // `video` field — see busabase-schema.md's manifest comment, ported into
  // content/kelly-demo-video-factory-app/app/js/config.js). The AirApp's own read path never depends on this
  // (busabase-provider.js joins shots to their video client-side by filtering on
  // shot.video === video id), but this keeps the Busabase web UI usable too.
  if (shouldMerge && videoRecordId && shotRecordIds.length > 0) {
    const current = await proposeRecordUpdate(
      cfg,
      videoRecordId,
      {
        title: outline.title,
        series: outline.series,
        purpose: outline.purpose,
        hook: outline.hook,
        "pain-point": outline.pain_point,
        concept: outline.concept,
        status: "needs_review",
        "verified-claims": outline.verified_claims ?? "",
        owner: outline.owner ?? "kelly",
        shots: shotRecordIds,
      },
      "Backfill inverse Shots relation for browsing",
    );
    await approveAndMerge(cfg, current.id, "Kelly approved via chat");
    console.log("Backfilled inverse relation:", shotRecordIds.length, "shots");
  }

  if (!shouldMerge) {
    console.log(
      `\n${1 + outline.shots.length} ChangeRequests proposed, all pending review.\nReview in the Busabase UI, or re-run with --merge once the human has approved this content.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
