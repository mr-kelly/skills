import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const resourceMap = JSON.parse(await readFile(path.join(root, "resource-map.json"), "utf8"));
const config = await readFile(path.join(root, "app", "js", "config.js"), "utf8");
const index = await readFile(path.join(root, "app", "index.html"), "utf8");

if (packageJson.scripts.start !== "node server.js") throw new Error("AirApp start must be node server.js");
if (packageJson.dependencies["busabase-sdk"] !== "0.17.2") throw new Error("busabase-sdk must be exact-pinned");
if (resourceMap.appId !== "kelly-portrait-retouch") throw new Error("resource map app id mismatch");
if (!config.includes('deployment: "cloud"')) throw new Error("deployment must be cloud");
if (/\b(?:href|src)="\/(?!api\/v1)/.test(index)) throw new Error("AirApp assets must use relative URLs");

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else files.push(target);
  }
  return files;
}

const files = await walk(root);
const browserSource = (
  await Promise.all(
    files
      .filter(
        (file) =>
          file.startsWith(`${path.join(root, "app")}${path.sep}`) &&
          !file.includes(`${path.sep}vendor${path.sep}`) &&
          file.endsWith(".js"),
      )
      .map((file) => readFile(file, "utf8")),
  )
).join("\n");
if (/BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i.test(browserSource))
  throw new Error("browser source exposes credentials");
if (/child_process|node:fs|sharp\(/.test(browserSource))
  throw new Error("browser source crosses trusted image boundary");
console.log(`Kelly Portrait Retouch AirApp checks OK (${files.length} files)`);
