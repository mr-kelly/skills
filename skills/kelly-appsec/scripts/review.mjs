#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { importReview } from "../lib/offline.mjs";
import { connectStore } from "../lib/store.mjs";
try {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      run: { type: "string" },
      file: { type: "string" },
      apply: { type: "boolean" },
    },
  });
  if (!values.project || !values.run || !values.file)
    throw new Error("Required: --project ID --run ID --file review.json --apply");
  const raw = await readFile(values.file, "utf8");
  if (raw.length > 1048576) throw new Error("REVIEW_TOO_LARGE");
  if (!values.apply) console.log(JSON.stringify({ mode: "preview", document: JSON.parse(raw).schemaVersion }));
  else
    console.log(
      JSON.stringify(
        await importReview(await connectStore(), {
          projectId: values.project,
          runId: values.run,
          document: JSON.parse(raw),
        }),
      ),
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : "REVIEW_IMPORT_FAILED");
  process.exitCode = 1;
}
