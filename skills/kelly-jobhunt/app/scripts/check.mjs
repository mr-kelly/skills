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
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
  "app/vendor/busabase-oauth.js",
  "app/vendor/busabase-oauth-node.js",
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
for (const [, limit] of configSource.matchAll(/readLimit:\s*(\d+)/g)) {
  if (Number(limit) > 100) throw new Error(`readLimit ${limit} exceeds the Busabase server maximum of 100`);
}
if (/创建并审批|写入部署配置/.test(appSource)) {
  throw new Error("Setup UI must not delegate resource creation to the user");
}
if ((await stat(path.join(root, "app/vendor/busabase-sdk.js"))).size < 10_000) {
  throw new Error("Busabase browser SDK bundle is incomplete");
}
if ((await stat(path.join(root, "app/vendor/busabase-oauth.js"))).size < 1_000) {
  throw new Error("Busabase OAuth bundle is incomplete");
}
if ((await stat(path.join(root, "app/vendor/busabase-oauth-node.js"))).size < 1_000) {
  throw new Error("Busabase Node OAuth bundle is incomplete");
}

const browserFiles = [
  "app/index.html",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/jobhunt-model.js",
  "app/js/resource-provisioning.js",
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
    // The word "SMTP" is allowed in help copy; a mail transport is not.
    ok: !/\bnodemailer\b|createTransport|sendMail|SMTP_PASS/i.test(source),
    message: "Email sending must never run in browser code",
  },
  { ok: !/\b(?:react|vite|jsx)\b/i.test(source), message: "Frontend build frameworks are forbidden" },
  {
    ok:
      source.includes("window.self !== window.top") &&
      source.includes('window.location.pathname.startsWith("/api/airapp-preview/")') &&
      source.includes("if (!demo && standaloneLocalRuntime)"),
    message: "OAuth connection UI must be limited to standalone loopback development",
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
    ok: serverSource.includes("assertOAuthSupported") && serverSource.includes('redirect: "manual"'),
    message: "Local OAuth must preflight server compatibility before browser navigation",
  },
  {
    ok:
      serverSource.includes('const AIRAPP_CLIENT_ID = "busabase-airapp"') &&
      serverSource.includes("storeBusabaseAirAppOAuthCredential") &&
      serverSource.includes('from "./app/vendor/busabase-oauth-node.js"'),
    message: "Local OAuth must use the dedicated AirApp client and local credential registry",
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
