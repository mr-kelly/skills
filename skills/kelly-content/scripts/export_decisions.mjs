#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { currentBatchPath, decisionsPath, exportReportPath, exportsDir } from "../lib/paths.mjs";
import { ensureDirs, readJson, slugify, withLock, writeJson } from "../lib/common.mjs";

const batch = await readJson(currentBatchPath);
if (!batch) {
  console.error("No current batch found. Generate a batch first.");
  process.exit(1);
}

const decisions = await readJson(decisionsPath, { decisions: {} });
const decisionMap = decisions.decisions || decisions || {};
const outDir = path.join(exportsDir, slugify(batch.batch_id));
const exported = [];
const skipped = [];

await withLock("Exporting approved content", async () => {
  await ensureDirs(outDir);
  for (const item of batch.items) {
    const decision = decisionMap[item.id] || item.decision || {};
    const action = decision.action || (item.status === "approved" ? "approve" : "");
    if (action !== "approve" && item.status !== "approved") {
      skipped.push({ id: item.id, reason: "not approved" });
      continue;
    }

    const title = decision.title || item.title;
    const body = decision.body || item.body;
    const filename = item.export_filename || `${slugify(item.channel)}-${slugify(title)}.md`;
    const target = path.join(outDir, filename);
    const markdown = [
      `# ${title}`,
      "",
      `Channel: ${item.channel}`,
      `Format: ${item.format || "post"}`,
      decision.comment ? `Review note: ${decision.comment}` : "",
      "",
      body,
      "",
      item.cta ? `CTA: ${item.cta}` : "",
      Array.isArray(item.hashtags) && item.hashtags.length ? `Hashtags: ${item.hashtags.join(" ")}` : "",
      item.media_brief ? `Media brief: ${item.media_brief}` : ""
    ].filter(Boolean).join("\n");
    await fs.writeFile(target, `${markdown}\n`);
    exported.push({ id: item.id, file: target });
  }

  await writeJson(path.join(outDir, "batch.json"), batch);
  await writeJson(path.join(outDir, "decisions.json"), decisions);
  await writeJson(exportReportPath, {
    batch_id: batch.batch_id,
    exported_at: new Date().toISOString(),
    output_dir: outDir,
    exported,
    skipped
  });
});

console.log(`Exported ${exported.length} item(s) to ${outDir}`);
