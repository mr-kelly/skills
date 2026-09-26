#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources, provisionDeclaredResources, publishAirApp } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-wechat-crm-app/app/js/config.js";

const skillRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(skillRoot, "content", "kelly-wechat-crm-app");
const apply = process.argv.includes("--apply");
const baseUrl = process.env.BUSABASE_BASE_URL || "http://localhost:15419";
const client = createBusabaseClient({
  baseUrl,
  ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
  ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
});

const skip = new Set([
  "node_modules",
  ".git",
  ".gitignore",
  ".busabaseignore",
  "_node.json",
  "test",
  "scripts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package-lock.json",
]);

async function readAirAppFiles(directory = appRoot, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await readAirAppFiles(absolute, relative)));
    else files.push({ path: relative, content: await readFile(absolute, "utf8") });
  }
  return files;
}

let resources = await inspectProvisionedResources(client, appConfig);
console.log(`${apply ? "Apply" : "Dry run"}: ${appConfig.folder.slug}`);
console.log(`Folder: ${resources.folder ? "ready" : "missing"}`);
for (const base of appConfig.bases) {
  console.log(`${base.key}: ${resources.bases.some((item) => item.key === base.key) ? "ready" : "missing"}`);
}
console.log(`AirApp: ${resources.airApp ? "ready" : "missing"}`);

if (!apply) process.exit(0);
if (!resources.folder || resources.missing.length || resources.repairs.length) {
  resources = await provisionDeclaredResources(client, appConfig);
  if (!resources.folder || resources.missing.length)
    throw new Error("Resource provisioning did not materialize fully.");
}
if (!resources.airApp) {
  const result = await publishAirApp(client, appConfig, await readAirAppFiles());
  console.log(
    result.merged === true
      ? `AirApp ${result.status}; merged`
      : `AirApp ${result.status}; pending ChangeRequest ${result.changeRequestId}`,
  );
} else {
  console.log("AirApp already exists; use scripts/publish_airapp.mjs to propose a source update.");
}
