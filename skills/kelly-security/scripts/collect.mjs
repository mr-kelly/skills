#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { executeRun, planRun } from "../lib/runner.mjs";
import { connectStore } from "../lib/store.mjs";

const { values } = parseArgs({
  options: {
    run: { type: "string" },
    "allow-host": { type: "string", multiple: true },
    scope: { type: "string" },
    since: { type: "string" },
    until: { type: "string" },
    directory: { type: "string" },
    apply: { type: "boolean" },
    resume: { type: "boolean" },
  },
});
try {
  if (!values.run || !values["allow-host"]?.length || !values.scope || !values.since || !values.until)
    throw new Error(
      "Required: --run ID --allow-host ALIAS --scope REFERENCE --since ISO --until ISO [--directory PATH] [--apply] [--resume]",
    );
  if (values.apply && !values.directory)
    throw new Error("An explicit owner-only --directory outside the repository is required for raw evidence");
  const store = await connectStore();
  const options = {
    runId: values.run,
    aliases: values["allow-host"],
    scope: values.scope,
    start: values.since,
    end: values.until,
    directory: values.directory ? path.resolve(values.directory) : "",
    resume: values.resume,
    onProgress: (progress) => console.log(JSON.stringify(progress)),
  };
  if (!values.apply) {
    const plan = await planRun(store, options);
    console.log(
      JSON.stringify(
        {
          mode: "plan-only",
          alias: plan.alias,
          window: plan.window,
          checks: plan.checks.map((check) => ({ id: check.id, name: check.name })),
          next: "Execute the authorized scope with --apply; no SSH connection was made.",
        },
        null,
        2,
      ),
    );
  } else console.log(JSON.stringify(await executeRun(store, options), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "COLLECTION_FAILED");
  process.exitCode = 1;
}
