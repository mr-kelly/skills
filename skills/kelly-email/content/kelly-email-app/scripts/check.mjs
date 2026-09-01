import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// ── busabase-sdk/airapp-check: the versioned AirApp runtime contract ────────
// Added on top of this file's own checks, not in place of them: the rules
// above/below this block are specific to this app; the ones here are the
// shared contract every AirApp is held to, versioned with the SDK so a fix
// like busabase-sdk@0.30.1's runtime-detection rule reaches every app that
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
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length) {
    throw new Error(
      `busabase-sdk/airapp-check found ${errors.length} contract violation(s):\n${errors.map((f) => `  [${f.rule}] ${f.message}`).join("\n")}`,
    );
  }
}
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const configText = await readFile(path.join(root, "app", "js", "config.js"), "utf8");
const index = await readFile(path.join(root, "app", "index.html"), "utf8");
const setupText = await readFile(path.join(root, "app", "js", "setup.js"), "utf8");
const localAuthText = await readFile(path.join(root, "server", "local-auth.js"), "utf8");
const providerText = await readFile(path.join(root, "lib", "data-provider", "busabase-client.ts"), "utf8");
const providerModelText = await readFile(path.join(root, "lib", "data-provider", "busabase-provider.ts"), "utf8");
const listText = await readFile(path.join(root, "app", "js", "list-detail.js"), "utf8");
const appText = await readFile(path.join(root, "app", "app.js"), "utf8");
const serverText = await readFile(path.join(root, "server", "hono.ts"), "utf8");

if (packageJson.scripts.start !== "node server.js") throw new Error("AirApp start must be node server.js");
if (packageJson.dependencies["busabase-sdk"] !== "0.30.1") throw new Error("busabase-sdk must be exact-pinned");
if (!configText.includes('deployment: "cloud"')) throw new Error("Kelly Email must be Cloud-only");
if (!configText.includes('resourceKey: "kelly-email-files"')) {
  throw new Error("Drive ownership must match the slug installed by the template");
}
if (!configText.includes('"records.count"')) throw new Error("Kelly Email must allow exact record counts");
if (!providerText.includes("sdk.records.count") || !providerText.includes("nextCursor")) {
  throw new Error("Kelly Email provider must return one cursor page plus an exact count");
}
if (!providerText.includes("record?.headCommit?.payload")) {
  throw new Error("Kelly Email provider must read the current SDK record payload shape");
}
if (!providerModelText.includes("batchFromEmailRecords(page.rows")) {
  throw new Error("Every review page must use the shared record normalizer");
}
if (!listText.includes("export async function loadMore()") || !listText.includes("appendStatePage")) {
  throw new Error("Kelly Email list/detail UI must append one page per Load more action");
}
if (!appText.includes("store.pagesLoaded === 1")) {
  throw new Error("Automatic refresh must not discard pages appended by the user");
}
if (!serverText.includes("describeBusabaseAirAppRuntime")) {
  throw new Error("AirApp runtime reporting must use busabase-sdk/airapp-node");
}
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
