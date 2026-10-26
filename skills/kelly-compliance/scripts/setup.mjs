#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inspectProvisionedResources, provisionDeclaredResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-compliance-app/app/js/config.js";
import { ensureScenarioPrompts } from "../lib/prompts.mjs";
import { publish } from "../lib/publish.mjs";
import { localClient } from "../lib/store.mjs";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const client = localClient();
  let resources = await inspectProvisionedResources(client, appConfig);
  if (!process.argv.includes("--apply")) {
    console.log(
      JSON.stringify(
        {
          mode: "inspect-only",
          folderExists: !!resources.folder,
          missing: resources.missing.map((base) => base.key),
          airAppExists: !!resources.airApp,
          action: "--apply installs the complete package into the selected workspace; no AWS request is performed",
        },
        null,
        2,
      ),
    );
  } else if (!resources.folder) {
    // The official installer also creates the manual, guide, Drive, Views and prompts.
    // Explicit origin/Space and an empty external config prevent a different active profile
    // from selecting the write target. Credentials, when used, stay in environment only.
    await exec(
      "npx",
      [
        "--yes",
        "busabase-cli@0.99.1",
        "install",
        root,
        "--base-url",
        process.env.BUSABASE_BASE_URL,
        "--space-id",
        process.env.BUSABASE_SPACE_ID || "local",
        "--config",
        "/dev/null",
        "--output",
        "json",
      ],
      { cwd: root, env: process.env, timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
    );
    resources = await inspectProvisionedResources(client, appConfig);
    if (!resources.folder || resources.missing.length || !resources.airApp)
      throw new Error("INSTALL_READBACK_INCOMPLETE");
    console.log(
      JSON.stringify({
        status: "installed",
        folderNodeId: resources.folder.nodeId,
        airAppNodeId: resources.airApp.nodeId,
        resourceCount: resources.bases.length,
      }),
    );
  } else {
    // The SDK only appends the declared fields to an owned Base; incompatible
    // renames, type changes and unrelated resources remain a conflict.
    resources = await provisionDeclaredResources(client, appConfig);
    if (resources.missing.length || resources.repairs.length)
      throw new Error("SCHEMA_INCOMPLETE_AFTER_DECLARED_UPGRADE");
    if (!resources.airApp || process.argv.includes("--publish")) {
      const result = await publish(client);
      console.log(
        JSON.stringify(
          result.merged === true
            ? { status: "published", nodeId: "nodeId" in result ? result.nodeId : resources.airApp?.nodeId }
            : { status: "waiting-for-review", changeRequestId: result.changeRequestId },
        ),
      );
    } else
      console.log(
        JSON.stringify({
          status: "ready",
          folderNodeId: resources.folder.nodeId,
          airAppNodeId: resources.airApp.nodeId,
        }),
      );
  }
  if (process.argv.includes("--apply")) await ensureScenarioPrompts(client, resources);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SETUP_FAILED");
  process.exitCode = 1;
}
