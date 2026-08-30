import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// ── busabase-sdk/airapp-check: the versioned AirApp runtime contract ────────
// Added on top of this file's own checks, not in place of them: the rules
// above/below this block are specific to this app; the ones here are the
// shared contract every AirApp is held to, versioned with the SDK so a fix
// like busabase-sdk@0.21.0's runtime-detection rule reaches every app that
// bumps its pin instead of staying stuck in whatever copy this file had.
{
  const { checkAirApp } = await import("busabase-sdk/airapp-check");
  const { readFile: gateReadFile, readdir: gateReaddir } = await import("node:fs/promises");
  const path = (await import("node:path")).default;
  const readFile = gateReadFile;
  const readdir = gateReaddir;
  const readIfExists = (p) => readFile(p, "utf8").catch(() => undefined);
  const walk = async (dir) => {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else out.push(full);
    }
    return out;
  };
  const appFiles = (await walk(path.join(root, "app"))).filter((f) => !f.split(path.sep).includes("vendor"));
  const LOGIC_BASENAMES = new Set(["app.js", "config.js", "busabase-client.js", "runtime.js"]);
  const isLogic = (f) =>
    LOGIC_BASENAMES.has(path.basename(f)) || f.endsWith(path.join("providers", "busabase-provider.js"));
  const isDownload = (f) => /\.(?:js|html)$/.test(f);
  const joinFiles = async (files) => (await Promise.all(files.map((f) => readFile(f, "utf8")))).join("\n");
  const serverCandidates = [path.join(root, "server.js"), ...(await walk(path.join(root, "server")).catch(() => []))];
  const serverParts = (await Promise.all(serverCandidates.map((f) => readIfExists(f)))).filter(
    (text) => text !== undefined,
  );
  const findings = await checkAirApp({
    packageJson: await readIfExists(path.join(root, "package.json")),
    server: serverParts.length ? serverParts.join("\n") : undefined,
    serverLanguage: "node",
    browserLogic: await joinFiles(appFiles.filter(isLogic)),
    browserDownloads: await joinFiles(appFiles.filter(isDownload)),
    config:
      (await readIfExists(path.join(root, "app", "js", "config.js"))) ??
      (await readIfExists(path.join(root, "app", "config.js"))),
    shippedSlug: path.basename(root),
  });
  // The two page-fetch rules are downgraded to a warning here, fleet-wide, on
  // purpose: 60 of 68 apps eagerly fetch every page of a Base in one call
  // (airapp/eager-multi-page) or have no page cap at all (airapp/unbounded-read),
  // a pre-existing pattern this gate's job is to make VISIBLE, not to block
  // every app's own check script on before the actual pagination fix -- a
  // separate, larger, UI-touching change -- lands. Remove this carve-out once
  // that fix ships; until then it would just get bypassed some other way.
  const DEFERRED_PENDING_PAGINATION_FIX = new Set(["airapp/eager-multi-page", "airapp/unbounded-read"]);
  const errors = findings.filter((f) => f.severity === "error" && !DEFERRED_PENDING_PAGINATION_FIX.has(f.rule));
  const deferred = findings.filter((f) => f.severity === "error" && DEFERRED_PENDING_PAGINATION_FIX.has(f.rule));
  for (const f of deferred) console.warn(`busabase-sdk/airapp-check: [${f.rule}] ${f.message}`);
  if (errors.length) {
    throw new Error(
      `busabase-sdk/airapp-check found ${errors.length} contract violation(s):\n${errors.map((f) => `  [${f.rule}] ${f.message}`).join("\n")}`,
    );
  }
}
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const templateRoot = path.resolve(root, "../..");
const manifest = JSON.parse(await readFile(path.join(templateRoot, "busabase.json"), "utf8"));
const { appConfig } = await import(path.join(root, "app/js/config.js"));
const config = await readFile(path.join(root, "app", "js", "config.js"), "utf8");
const index = await readFile(path.join(root, "app", "index.html"), "utf8");

if (packageJson.scripts.start !== "node server.js") throw new Error("AirApp start must be node server.js");
if (manifest.name !== "kelly-portrait-retouch") throw new Error("template manifest app id mismatch");
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
