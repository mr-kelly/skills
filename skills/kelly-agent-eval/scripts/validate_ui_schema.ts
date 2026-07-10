#!/usr/bin/env node
import type { EvalRun } from "../app/server/types.ts";
// Validates an eval_run.json file against the shape the UI and executor
// expect. Usage: node scripts/validate_ui_schema.ts [path]
import { readJson } from "../lib/common.ts";
import { EVAL_RUN_PATH } from "../lib/paths.ts";

const RUBRIC_KEYS = ["helpfulness", "correctness", "safety", "tone"];

function fail(message: string): never {
  console.error(`Invalid: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function checkRun(run: unknown, file: string): void {
  if (!run || typeof run !== "object") fail(`${file} is not an object`);
  const value = run as Partial<EvalRun>;
  for (const field of ["run_id", "generated_at", "baseline_version", "candidate_version", "metrics", "cases"]) {
    if (!(field in value)) fail(`${file} is missing "${field}"`);
  }
  if (!Array.isArray(value.cases) || value.cases.length === 0) fail(`${file} has no cases`);
  for (const item of value.cases as EvalRun["cases"]) {
    if (!item.id || !item.title) fail(`case missing id/title: ${JSON.stringify(item).slice(0, 80)}`);
    for (const side of ["baseline", "candidate"] as const) {
      const run2 = item[side];
      if (!run2 || typeof run2.overall !== "number") fail(`case ${item.id} missing ${side}.overall`);
      for (const key of RUBRIC_KEYS) {
        if (typeof (run2.scores as Record<string, number>)[key] !== "number") {
          fail(`case ${item.id} missing ${side}.scores.${key}`);
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const file = process.argv[2] || EVAL_RUN_PATH;
  const run =
    file === EVAL_RUN_PATH
      ? await readJson(EVAL_RUN_PATH, null)
      : JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));
  checkRun(run, file);
  console.log(`OK: ${file} is a valid eval run (${(run as EvalRun).cases.length} cases).`);
}

await main();
