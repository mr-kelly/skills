#!/usr/bin/env node
// Pipeline overview: every video's status plus its shots' recording progress.

import { findBase, listRecords, loadBusabaseConfig } from "../lib/data-provider/busabase-client.ts";

async function main() {
  const cfg = loadBusabaseConfig();
  const videosBase = await findBase(cfg, "videos");
  const shotsBase = await findBase(cfg, "video-shots");
  if (!videosBase || !shotsBase) {
    throw new Error("Schema missing — run `npm run ensure-schema` first.");
  }

  const videos = (await listRecords(cfg, videosBase.id, 100)).records as Array<{
    id: string;
    headCommit: { fields: Record<string, unknown> };
  }>;
  const shots = (await listRecords(cfg, shotsBase.id, 100)).records as Array<{
    id: string;
    headCommit: { fields: Record<string, unknown> };
  }>;

  for (const v of videos) {
    const f = v.headCommit.fields;
    const mine = shots.filter((s) => s.headCommit.fields.video === v.id);
    const byStatus = mine.reduce<Record<string, number>>((acc, s) => {
      const st = String(s.headCommit.fields["recording-status"] ?? "pending");
      acc[st] = (acc[st] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`\n${f.title}`);
    console.log(`  status: ${f.status}   owner: ${f.owner}   hyperframe: ${f["hyperframe-path"] || "(not started)"}`);
    console.log(
      `  shots: ${mine.length} total — ${
        Object.entries(byStatus)
          .map(([k, n]) => `${k}:${n}`)
          .join(", ") || "none"
      }`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
