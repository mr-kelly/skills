#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { exportPreparation } from "../lib/report.mjs";
import { connectStore } from "../lib/store.mjs";
try {
  const { values } = parseArgs({
    options: {
      program: { type: "string" },
      output: { type: "string" },
      "max-rows": { type: "string", default: "500" },
    },
  });
  if (!values.program || !values.output)
    throw new Error("USAGE: --program ID --output private-preparation.md [--max-rows 500]");
  const result = await exportPreparation(await connectStore(), values.program, { maxRows: Number(values["max-rows"]) });
  await writeFile(values.output, result.markdown, { flag: "wx", mode: 0o600 });
  console.log(
    JSON.stringify({
      status: "exported",
      records: result.total,
      complete: result.complete,
      truncated: result.truncated,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "REPORT_FAILED");
  process.exitCode = 1;
}
