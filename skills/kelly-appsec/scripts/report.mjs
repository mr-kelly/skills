#!/usr/bin/env node
import { open } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { exportRun, reportMarkdown } from "../lib/report.mjs";
import { connectStore } from "../lib/store.mjs";
try {
  const { values } = parseArgs({
    options: { run: { type: "string" }, output: { type: "string" }, "max-rows": { type: "string", default: "2000" } },
  });
  if (!values.run || !values.output) throw new Error("Required: --run ID --output report.md [--max-rows 2000]");
  const result = await exportRun(await connectStore(), values.run, {
    maxRows: Number(values["max-rows"]),
    onProgress: (value) => console.log(JSON.stringify(value)),
  });
  const file = await open(path.resolve(values.output), "wx", 0o600);
  try {
    await file.writeFile(reportMarkdown(result));
  } finally {
    await file.close();
  }
  console.log(
    JSON.stringify({
      complete: result.complete,
      checks: result.checks.length,
      evidence: result.evidence.length,
      findings: result.findings.length,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "EXPORT_FAILED");
  process.exitCode = 1;
}
