#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { publishAirApp } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-wechat-crm-app/app/js/config.js";

const skillRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(skillRoot, "content", "kelly-wechat-crm-app");
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

async function files(directory = appRoot, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(absolute, relative)));
    else result.push({ path: relative, content: await readFile(absolute, "utf8") });
  }
  return result;
}

const client = createBusabaseClient({
  baseUrl: process.env.BUSABASE_BASE_URL || "http://localhost:15419",
  ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
  ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
});
const result = await publishAirApp(client, appConfig, await files());
console.log(
  result.merged === true
    ? `AirApp ${result.status}; merged`
    : `AirApp ${result.status}; pending ChangeRequest ${result.changeRequestId}`,
);
