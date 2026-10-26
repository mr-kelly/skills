#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { normalizeReport } from "../lib/imports.mjs";
import { importReport } from "../lib/service.mjs";
import { connectStore } from "../lib/store.mjs";
try {
  const { values } = parseArgs({
    options: {
      program: { type: "string" },
      file: { type: "string" },
      format: { type: "string", default: "normalized" },
      assessment: { type: "string" },
      apply: { type: "boolean", default: false },
      resume: { type: "boolean", default: false },
    },
  });
  if (!values.program || !values.file)
    throw new Error(
      "USAGE: --program ID --file PATH --format normalized|prowler|securityhub|github [--assessment ID] [--apply]",
    );
  if ((await stat(values.file)).size > 2 * 1024 * 1024) throw new Error("IMPORT_FILE_EXCEEDS_2_MB");
  const raw = await readFile(values.file, "utf8");
  const input = JSON.parse(raw);
  const store = await connectStore();
  const program = await store.get("programs", values.program);
  const normalized = normalizeReport(input, {
    format: values.format,
    frameworkVersion: String(program.fields["framework-version"]),
    scopeVersion: Number(program.fields["scope-version"]),
  });
  if (!values.apply)
    console.log(
      JSON.stringify(
        {
          mode: "inspect-only",
          program: program.id,
          format: values.format,
          rows: normalized.rows.length,
          producer: normalized.producer,
          action: "Add --apply to persist scoped sanitized findings and pending mappings; no cloud calls.",
        },
        null,
        2,
      ),
    );
  else {
    const result = await importReport(store, program.id, input, {
      format: values.format,
      assessmentId: values.assessment,
      resume: values.resume,
      sourceDigest: createHash("sha256").update(raw).digest("hex"),
    });
    console.log(
      JSON.stringify({
        status: result.assessment.fields.status,
        assessmentId: result.assessment.id,
        imported: result.imported,
        reused: result.reused,
      }),
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "IMPORT_FAILED");
  process.exitCode = 1;
}
