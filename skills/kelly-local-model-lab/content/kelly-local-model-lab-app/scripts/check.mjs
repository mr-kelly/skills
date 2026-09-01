import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { runtimeDetectionAssertions } from "./runtime-detection-rules.mjs";

const root = path.resolve(import.meta.dirname, "..");

// Keep the shared AirApp runtime contract versioned with busabase-sdk while
// retaining this app's domain-specific checks below.
{
  const { checkAirApp } = await import("busabase-sdk/airapp-check");
  const readIfExists = (file) => readFile(file, "utf8").catch(() => undefined);
  const walkForAirAppCheck = async (directory) => {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await walkForAirAppCheck(target)));
      else files.push(target);
    }
    return files;
  };
  const appFiles = (await walkForAirAppCheck(path.join(root, "app"))).filter(
    (file) => !file.split(path.sep).includes("vendor"),
  );
  const logicBasenames = new Set(["app.js", "config.js", "busabase-client.js", "runtime.js"]);
  const isLogic = (file) =>
    logicBasenames.has(path.basename(file)) || file.endsWith(path.join("providers", "busabase-provider.js"));
  const isDownload = (file) => /\.(?:js|html)$/.test(file);
  const joinFiles = async (files) => (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const serverCandidates = [path.join(root, "server.js"), ...(await walkForAirAppCheck(path.join(root, "server")))];
  const serverParts = (await Promise.all(serverCandidates.map((file) => readIfExists(file)))).filter(
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
  const errors = findings.filter((finding) => finding.severity === "error");
  if (errors.length) {
    throw new Error(
      `busabase-sdk/airapp-check found ${errors.length} contract violation(s):\n${errors.map((finding) => `  [${finding.rule}] ${finding.message}`).join("\n")}`,
    );
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const configText = await readFile(path.join(root, "app", "js", "config.js"), "utf8");
const index = await readFile(path.join(root, "app", "index.html"), "utf8");
const runtimeSource = await readFile(path.join(root, "app", "js", "runtime.js"), "utf8");
const serverSource = await readFile(path.join(root, "server.js"), "utf8");

if (packageJson.scripts.start !== "node server.js") throw new Error("AirApp start must be node server.js");
if (packageJson.dependencies["busabase-sdk"] !== "0.30.1") throw new Error("busabase-sdk must be exact-pinned");
if (!configText.includes('deployment: "cloud"')) throw new Error("Local Model Lab must be Cloud-only");
if (/local-file-provider|config\.local\.json|app\/\.data/.test(configText)) {
  throw new Error("Retired provider/runtime contract remains in app config");
}
if (/\b(?:href|src)="\/(?!api\/v1)/.test(index)) throw new Error("AirApp assets must use relative URLs");
for (const assertion of runtimeDetectionAssertions(runtimeSource, serverSource)) {
  if (!assertion.ok) throw new Error(assertion.message);
}

const forbidden = ["local-file-provider.ts", "launcher.ts", "start.sh", "setup-gate.js"];
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

console.log(`Local Model Lab AirApp checks OK (${files.length} files)`);
