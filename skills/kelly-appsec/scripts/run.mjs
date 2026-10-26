#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { executeRun, planRun } from "../lib/runner.mjs";
import { connectStore } from "../lib/store.mjs";
try {
  const { values } = parseArgs({
    options: {
      run: { type: "string" },
      project: { type: "string" },
      origin: { type: "string" },
      environment: { type: "string" },
      revision: { type: "string" },
      scope: { type: "string" },
      "allow-method": { type: "string", multiple: true },
      "allow-path": { type: "string", multiple: true },
      "allow-object": { type: "string", multiple: true },
      directory: { type: "string" },
      "request-limit": { type: "string", default: "100" },
      "allow-mutations": { type: "boolean" },
      apply: { type: "boolean" },
      resume: { type: "boolean" },
    },
  });
  if (![values.run, values.project, values.origin, values.environment, values.revision, values.scope].every(Boolean))
    throw new Error(
      "Required: --run ID --project ID --origin ORIGIN --environment ENV --revision REV --scope REF --allow-method METHOD --allow-path PATH [--allow-object FIXTURE_ID] [--directory PRIVATE_PATH --apply] [--resume]",
    );
  const credentials = Object.fromEntries(
    Object.entries(process.env)
      .filter(([name]) => name.startsWith("APPSEC_TOKEN_"))
      .map(([name, value]) => [name.slice(13).toLowerCase().replaceAll("_", "-"), value]),
  );
  const authorization = {
    runId: values.run,
    projectId: values.project,
    origin: values.origin,
    environment: values.environment,
    revision: values.revision,
    scope: values.scope,
    allowedMethods: values["allow-method"] || [],
    allowedPaths: values["allow-path"] || [],
    allowedObjectIds: values["allow-object"] || [],
    credentials,
    allowMutations: values["allow-mutations"] === true,
    directory: values.directory ? path.resolve(values.directory) : "",
    requestLimit: Number(values["request-limit"]),
    resume: values.resume,
  };
  const store = await connectStore();
  if (!values.apply) {
    const plan = await planRun(store, authorization);
    console.log(
      JSON.stringify(
        {
          mode: "plan-only",
          project: plan.project.fields.title,
          origin: plan.origin,
          revision: values.revision,
          cases: plan.cases.map((item) => ({
            identity: item.rule.identity,
            method: item.method,
            path: item.path,
            expectation: item.rule.expectation,
          })),
        },
        null,
        2,
      ),
    );
  } else console.log(JSON.stringify(await executeRun(store, authorization), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "RUN_FAILED");
  process.exitCode = 1;
}
