import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "package.json",
  "resource-map.json",
  "server.js",
  "app/index.html",
  "app/styles.css",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/jobhunt-model.js",
  "app/js/resource-provisioning.js",
  "app/js/busabase-client.js",
  "app/js/runtime.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
  "app/vendor/busabase-sdk.js",
];

for (const relative of required) {
  await access(path.join(root, relative));
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const resourceMap = JSON.parse(await readFile(path.join(root, "resource-map.json"), "utf8"));
const serverSource = await readFile(path.join(root, "server.js"), "utf8");
const configSource = await readFile(path.join(root, "app/js/config.js"), "utf8");
const provisioningSource = await readFile(path.join(root, "app/js/resource-provisioning.js"), "utf8");
const appSource = await readFile(path.join(root, "app/js/app.js"), "utf8");
const providerSource = await readFile(path.join(root, "app/js/providers/busabase-provider.js"), "utf8");

const exactVersion = /^\d+\.\d+\.\d+$/;
for (const name of ["@hono/node-server", "busabase-sdk", "hono"]) {
  if (!exactVersion.test(packageJson.dependencies?.[name] || "")) {
    throw new Error(`${name} must use an exact version`);
  }
}
if (packageJson.scripts?.start !== "node server.js") {
  throw new Error("AirApp start must only run server.js");
}
if (resourceMap.resources?.length !== 3) {
  throw new Error("Resource map must declare three Busabase Bases");
}
if (!resourceMap.vaultRequirements?.every((requirement) => requirement.browserVisible === false)) {
  throw new Error("Vault requirements must stay invisible to browser code");
}
if (
  resourceMap.provisioning?.mode !== "lazy" ||
  !configSource.includes('setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"]') ||
  !provisioningSource.includes("client.nodes.createChangeRequest") ||
  !provisioningSource.includes("client.nodes.updateMetadata")
) {
  throw new Error("Lazy Busabase resource provisioning is incomplete");
}
// Transport pagination belongs to the provider. A per-Base readLimit is how a
// desk ends up silently showing only the first page.
if (/readLimit/.test(configSource) || /readLimit/.test(JSON.stringify(resourceMap))) {
  throw new Error("Busabase transport pagination must not be configured per Base");
}
if (!providerSource.includes("BUSABASE_RECORD_PAGE_SIZE") || !providerSource.includes("readAllPages")) {
  throw new Error("Provider must own the page size and follow nextCursor to exhaustion");
}
if (!providerSource.includes("PAGINATION_LOOP")) {
  throw new Error("Pagination must guard against a repeating cursor");
}
if (/创建并审批|写入部署配置/.test(appSource)) {
  throw new Error("Setup UI must not delegate resource creation to the user");
}
if ((await stat(path.join(root, "app/vendor/busabase-sdk.js"))).size < 10_000) {
  throw new Error("Busabase browser SDK bundle is incomplete");
}
const browserFiles = [
  "app/index.html",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/jobhunt-model.js",
  "app/js/resource-provisioning.js",
  "app/js/busabase-client.js",
  "app/js/runtime.js",
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
    // The Vault key NAMES legitimately appear in browser code (the profile shows
    // which references are configured). A transport or a credential value does not.
    ok: !/\bnodemailer\b|createTransport|sendMail|process\.env\.SMTP/i.test(source),
    message: "Email sending must never run in browser code",
  },
  {
    // vault.get returns plaintext values, so the browser must never call it.
    ok: !/vault\.(get|update|clear)/.test(source),
    message: "Browser code must never read or write the Busabase Vault",
  },
  { ok: !/\b(?:react|vite|jsx)\b/i.test(source), message: "Frontend build frameworks are forbidden" },
  {
    // The runtime comes from BUSABASE_AIRAPP_RUNTIME, which Busabase injects
    // into the process it spawns — never from the URL. Hostname, iframe
    // nesting, and preview-path tests all misfire in both directions: a hosted
    // AirApp is served from localhost on Desktop/OSS, and a standalone run is
    // routinely reached over a LAN IP or a signed dev tunnel.
    ok:
      source.includes("shouldUseLocalGateway(await initRuntime())") &&
      source.includes("if (!demo && standaloneLocalRuntime)"),
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
    // A deployed AirApp sits inside the Busabase review boundary; only a local
    // loopback preview may merge its own writes.
    ok:
      providerSource.includes("autoMerge: isStandaloneLocalRuntime()") ||
      providerSource.includes("const autoMerge = isStandaloneLocalRuntime()"),
    message: "Record writes must only auto-merge on a standalone local runtime",
  },
  {
    ok: providerSource.includes("bases.createChangeRequest") && providerSource.includes("records.changeRequest"),
    message: "Outreach writes must go through Busabase ChangeRequests",
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

console.log("Kelly JobHunt checks OK");
