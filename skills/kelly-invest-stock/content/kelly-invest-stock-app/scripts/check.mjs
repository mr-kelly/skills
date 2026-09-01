import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

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
  // This market-data workflow intentionally assembles a complete dataset before
  // analysis. Keep that one known exception visible while enforcing every other
  // SDK contract rule, including eager interactive pagination.
  const DEFERRED_COMPLETE_DATASET_READ = new Set(["airapp/unbounded-read"]);
  const errors = findings.filter((f) => f.severity === "error" && !DEFERRED_COMPLETE_DATASET_READ.has(f.rule));
  const deferred = findings.filter((f) => f.severity === "error" && DEFERRED_COMPLETE_DATASET_READ.has(f.rule));
  for (const f of deferred) console.warn(`busabase-sdk/airapp-check: [${f.rule}] ${f.message}`);
  if (errors.length) {
    throw new Error(
      `busabase-sdk/airapp-check found ${errors.length} contract violation(s):\n${errors.map((f) => `  [${f.rule}] ${f.message}`).join("\n")}`,
    );
  }
}
const required = [
  "package.json",
  "server.js",
  "app/index.html",
  "app/styles.css",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/connect-gate.js",
  "app/js/strategy-model.js",
  "app/js/busabase-client.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
  "app/vendor/busabase-sdk.js",
  "app/vendor/busabase-airapp-gate.js",
  "app/vendor/busabase-airapp.js",
];

for (const relative of required) {
  await access(path.join(root, relative));
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const templateRoot = path.resolve(root, "../..");
const manifest = JSON.parse(await readFile(path.join(templateRoot, "busabase.json"), "utf8"));
const { appConfig } = await import(path.join(root, "app/js/config.js"));
const serverSource = await readFile(path.join(root, "server.js"), "utf8");
const configSource = await readFile(path.join(root, "app/js/config.js"), "utf8");
// Provisioning is busabase-sdk/airapp now, vendored for the browser. The
// assertion still matters: it proves the bundle in this app really is the
// provisioning module and still goes through the approval-first procedures.
const provisioningSource = await readFile(path.join(root, "app/vendor/busabase-airapp.js"), "utf8");
const appSource = await readFile(path.join(root, "app/js/app.js"), "utf8");
const exactVersion = /^\d+\.\d+\.\d+$/;
for (const name of ["@hono/node-server", "busabase-sdk", "hono", "stock-sdk"]) {
  if (!exactVersion.test(packageJson.dependencies?.[name] || "")) {
    throw new Error(`${name} must use an exact version`);
  }
}
if (packageJson.dependencies["stock-sdk"] !== "2.4.0") {
  throw new Error("stock-sdk must remain pinned to 2.4.0");
}
if (packageJson.scripts?.start !== "node server.js") {
  throw new Error("AirApp start must only run server.js");
}
if (appConfig.bases.length !== 5 || (manifest.template.secrets ?? []).length !== 0) {
  throw new Error("Template must declare five non-secret Busabase resources");
}
if (/\breadLimit\b/.test(configSource) || /\breadLimit\b/.test(JSON.stringify(manifest))) {
  throw new Error("Busabase transport pagination must not be configured per Base");
}
if (
  !configSource.includes('"bases.fieldChangeRequest"') ||
  !provisioningSource.includes("client.nodes.createChangeRequest") ||
  !provisioningSource.includes("client.nodes.updateMetadata") ||
  !provisioningSource.includes("client.bases.fieldChangeRequest")
) {
  throw new Error("Lazy Busabase resource provisioning is incomplete");
}
if (/创建并审批六个 Base|写入部署配置/.test(appSource)) {
  throw new Error("Setup UI must not delegate resource creation to the user");
}
const connectGateSource = await readFile(path.join(root, "app/js/connect-gate.js"), "utf8");
if (
  !serverSource.includes('app.post("/auth/space"') ||
  !serverSource.includes("createBusabaseAirAppLocalGateway") ||
  // The connect/space/initialize screens are busabase-sdk/airapp-gate's now;
  // this app only wires shouldGate/onProvision through connect-gate.js.
  !connectGateSource.includes("createAirAppConnectGate") ||
  !appSource.includes("passConnectGate") ||
  configSource.includes("orglnl02ONE36pXGXTs")
) {
  throw new Error("OAuth must select a runtime Space before resource initialization");
}
if ((await stat(path.join(root, "app/vendor/busabase-sdk.js"))).size < 10_000) {
  throw new Error("Busabase browser SDK bundle is incomplete");
}
const browserFiles = [
  "app/index.html",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/connect-gate.js",
  "app/js/strategy-model.js",
  "app/js/busabase-client.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
];
const source = (await Promise.all(browserFiles.map((file) => readFile(path.join(root, file), "utf8")))).join("\n");

const assertions = [
  { ok: source.includes("createBusabaseClient"), message: "Browser Busabase SDK client is missing" },
  { ok: source.includes("window.location.origin"), message: "Busabase client must target its own origin" },
  { ok: !source.includes("/__busabase_api__/"), message: "Obsolete Busabase bridge prefix found" },
  { ok: !/BUSABASE_API_KEY/i.test(source), message: "Browser source must not reference API keys" },
  { ok: !/\bBearer\b/i.test(source), message: "Browser source must not reference Bearer credentials" },
  { ok: !/\blocalStorage\b/.test(source), message: "Persistent browser storage is forbidden" },
  {
    ok: !/(?:from\s*["']stock-sdk["']|import\s*\(\s*["']stock-sdk["']\s*\))/.test(source),
    message: "stock-sdk must not run in browser code",
  },
  { ok: !/\b(?:react|vite|jsx)\b/i.test(source), message: "Frontend build frameworks are forbidden" },
  {
    // The runtime comes from BUSABASE_AIRAPP_RUNTIME, which Busabase injects
    // into the process it spawns — never from the URL. Hostname, iframe
    // nesting, and preview-path tests all misfire in both directions: a hosted
    // AirApp is served from localhost on Desktop/OSS, and a standalone run is
    // routinely reached over a LAN IP or a signed dev tunnel.
    ok: source.includes("shouldUseLocalGateway()") && source.includes("!isDemo() && shouldUseLocalGateway()"),
    message: "OAuth connection UI must be gated on the injected runtime, not the URL",
  },
  {
    ok: !/location\s*\.\s*hostname|window\.self\s*!==\s*window\.top/.test(source),
    message: "Runtime must not be inferred from the hostname or from iframe nesting",
  },
  {
    ok: serverSource.includes("process.env.BUSABASE_AIRAPP_RUNTIME") && serverSource.includes('"/__airapp/runtime"'),
    message: "Server must expose the injected runtime at /__airapp/runtime",
  },
  {
    ok: serverSource.includes('from "busabase-sdk/airapp-node"'),
    message: "Local OAuth compatibility preflight is owned by the canonical gateway",
  },
  {
    ok: serverSource.includes('from "busabase-sdk/airapp-node"'),
    message: "Local OAuth must use the canonical busabase-sdk/airapp-node gateway, not hand-rolled PKCE",
  },
  {
    ok: !/VaultSession|vault-session|OAuthVault|oauth-vault/i.test(serverSource),
    message: "Local OAuth must not depend on a remote Vault session",
  },
];
for (const { ok, message } of assertions) {
  if (!ok) throw new Error(message);
}

console.log("Kelly Invest Stock checks OK");
