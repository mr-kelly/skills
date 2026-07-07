#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { readSnapshot, writeExecutionReport } from "../lib/common.ts";
import { APP_ID, APP_TITLE, EXPORT_OPERATION, type ExecutionReport } from "../lib/types.ts";

const outIndex = process.argv.indexOf("--out");
const outDir = outIndex >= 0 ? process.argv[outIndex + 1] : "exports";
await fs.mkdir(outDir, { recursive: true });

const snapshot = await readSnapshot();
const items = snapshot.items.filter((item) => item.status === "approved" || item.status === "done");
const now = new Date().toISOString();
const mdPath = path.join(outDir, "approved-items.md");
const jsonPath = path.join(outDir, "approved-items.json");
const csvPath = path.join(outDir, "approved-items.csv");

const md = [
  `# ${APP_TITLE} Approved Items`,
  "",
  `Generated: ${now}`,
  "",
  ...items.flatMap((item) => [
    `## ${item.ref} — ${item.title}`,
    "",
    item.summary || "",
    "",
    item.recommendation ? `Recommendation: ${item.recommendation}` : "",
    "",
    item.draft || "",
    "",
  ]),
].join("\n");

await fs.writeFile(mdPath, md);
await fs.writeFile(jsonPath, `${JSON.stringify(items, null, 2)}\n`);
await fs.writeFile(
  csvPath,
  [
    "id,ref,title,status,category,owner",
    ...items.map((item) =>
      [item.id, item.ref, item.title, item.status, item.category || "", item.owner || ""].map(csv).join(","),
    ),
  ].join("\n"),
);

const report: ExecutionReport = {
  schema_version: "1",
  executed_at: now,
  dry_run: false,
  source: APP_ID,
  results: [
    { operation: EXPORT_OPERATION, path: mdPath, format: "markdown", count: items.length },
    { operation: EXPORT_OPERATION, path: jsonPath, format: "json", count: items.length },
    { operation: EXPORT_OPERATION, path: csvPath, format: "csv", count: items.length },
  ],
};
await writeExecutionReport(report);
console.log(`Exported ${items.length} approved items to ${outDir}`);

function csv(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
