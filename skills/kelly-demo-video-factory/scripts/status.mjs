#!/usr/bin/env node
// Pipeline overview: every video's status plus its shots' recording progress.
import { findBase, listRecords, loadBusabaseConfig } from "./lib/busabase-client.mjs";

async function main() {
  const cfg = loadBusabaseConfig();
  const videosBase = await findBase(cfg, "videos");
  const shotsBase = await findBase(cfg, "video-shots");
  if (!videosBase || !shotsBase) {
    throw new Error("Schema missing — run `node scripts/ensure_schema.mjs` first.");
  }

  const videos = (await listRecords(cfg, videosBase.id, 100)).records;
  const shots = (await listRecords(cfg, shotsBase.id, 100)).records;

  // Cloud renamed `commits.fields` to `commits.payload` (2026-08-17); read the
  // new key first and fall back for a server still on the old shape.
  const fieldsOf = (record) => record.headCommit.payload || record.headCommit.fields;

  for (const v of videos) {
    const f = fieldsOf(v);
    const mine = shots.filter((s) => fieldsOf(s).video === v.id);
    const byStatus = mine.reduce((acc, s) => {
      const st = String(fieldsOf(s)["recording-status"] ?? "pending");
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
