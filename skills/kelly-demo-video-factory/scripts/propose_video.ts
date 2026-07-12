#!/usr/bin/env node
// Propose a video + its storyboard shots from a JSON outline.
//
// Usage:
//   node scripts/propose_video.ts path/to/outline.json           # propose only (stays in_review)
//   node scripts/propose_video.ts path/to/outline.json --merge   # propose AND merge
//
// --merge must only be passed after the human has explicitly approved this exact
// content in the conversation (see SKILL.md "Never auto-merge records"). Without
// it, the video and every shot are left as pending ChangeRequests for review in
// the Busabase UI or via `busabase-cli change-requests review/merge`.
//
// Outline shape — see references/outline-schema.md.

import { readFileSync } from "node:fs";
import {
  approveAndMerge,
  findBase,
  loadBusabaseConfig,
  proposeRecord,
  proposeRecordUpdate,
} from "../lib/data-provider/busabase-client.ts";

interface ShotOutline {
  timecode: string;
  scene: string;
  code_reference?: string;
  script_line: string;
  note?: string;
}

interface VideoOutline {
  title: string;
  series?: string;
  purpose: string;
  hook: string;
  pain_point: string;
  concept: string;
  verified_claims?: string; // markdown table, see reference: research-verify workflow
  owner?: "kelly" | "ai";
  shots: ShotOutline[];
}

async function main() {
  const [outlinePath, flag] = process.argv.slice(2);
  if (!outlinePath) {
    console.error("Usage: propose_video.ts <outline.json> [--merge]");
    process.exit(1);
  }
  const shouldMerge = flag === "--merge";
  const outline: VideoOutline = JSON.parse(readFileSync(outlinePath, "utf8"));

  const cfg = loadBusabaseConfig();
  const videosBase = await findBase(cfg, "videos");
  const shotsBase = await findBase(cfg, "video-shots");
  if (!videosBase || !shotsBase) {
    throw new Error("Schema missing — run `npm run ensure-schema` first.");
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

  let videoRecordId: string | undefined;
  if (shouldMerge) {
    const merged = await approveAndMerge(cfg, videoCr.id, "Kelly approved via chat");
    videoRecordId = merged.changeRequest.mergeSummary.recordIds[0];
    console.log("video record", videoRecordId);
  }

  const shotRecordIds: string[] = [];
  for (const [i, shot] of outline.shots.entries()) {
    const shotFields: Record<string, unknown> = {
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
      const recId = merged.changeRequest.mergeSummary.recordIds[0];
      shotRecordIds.push(recId);
    }
  }

  // Backfill the inverse `shots` field on the video record so it's visible from
  // the Videos side in the Busabase UI (see references/busabase-schema.md — the
  // inverse field only displays what was written on the video record itself;
  // it is not computed live from the shots' `video` field).
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
