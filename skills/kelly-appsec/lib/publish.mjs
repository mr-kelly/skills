import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishAirApp } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-appsec-app/app/js/config.js";

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../content/kelly-appsec-app");
const skip = new Set([
  "node_modules",
  ".git",
  "test",
  "scripts",
  "coverage",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "_node.json",
  ".busabaseignore",
]);
export const appFiles = async (directory = appRoot, prefix = "") => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.startsWith(".") || entry.name.endsWith(".log")) continue;
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...(await appFiles(path.join(directory, entry.name), `${relative}/`)));
    else if (entry.isFile())
      files.push({ path: relative, content: await readFile(path.join(directory, entry.name), "utf8") });
  }
  return files;
};
export const publish = async (client) => publishAirApp(client, appConfig, await appFiles());
