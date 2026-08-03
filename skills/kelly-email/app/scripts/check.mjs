import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const configText = await readFile(path.join(root, "app", "js", "config.js"), "utf8");
const index = await readFile(path.join(root, "app", "index.html"), "utf8");
const setupText = await readFile(path.join(root, "app", "js", "setup.js"), "utf8");
const localAuthText = await readFile(path.join(root, "server", "local-auth.js"), "utf8");

if (packageJson.scripts.start !== "node server.js") throw new Error("AirApp start must be node server.js");
if (packageJson.dependencies["busabase-sdk"] !== "0.11.0") throw new Error("busabase-sdk must be exact-pinned");
if (!configText.includes('deployment: "cloud"')) throw new Error("Kelly Email must be Cloud-only");
if (/KELLY_EMAIL_DATA_PROVIDER|local-file-provider|folders\.get/.test(configText)) {
  throw new Error("Retired provider/runtime contract remains in app config");
}
if (/\b(?:href|src)="\/(?!api\/v1)/.test(index)) throw new Error("AirApp assets must use relative URLs");
if (
  configText.includes("orglnl02ONE36pXGXTs") ||
  !setupText.includes('name="space_id"') ||
  !setupText.includes("status.requiresSpace") ||
  !localAuthText.includes('app.post("/auth/space"') ||
  !localAuthText.includes('new URL("/api/v1/auth"')
) {
  throw new Error("Local OAuth must select a runtime Space before resource initialization");
}

const forbidden = ["local-file-provider.ts", "local-reply-store.ts", "launcher.ts", "start.sh"];
const walk = async (directory) => {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".data") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(target)));
    else paths.push(target);
  }
  return paths;
};
const files = await walk(root);
for (const name of forbidden) {
  if (files.some((file) => path.basename(file) === name)) throw new Error(`Retired local file remains: ${name}`);
}

console.log(`Kelly Email AirApp checks OK (${files.length} files)`);
