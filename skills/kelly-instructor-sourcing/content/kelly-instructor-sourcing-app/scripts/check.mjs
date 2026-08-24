import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "package.json",
  "server.js",
  "app/index.html",
  "app/styles.css",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/connect-gate.js",
  "app/js/instructor-sourcing-model.js",
  "app/js/busabase-client.js",
  "app/js/runtime.js",
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
if (appConfig.bases.length !== 2) {
  throw new Error("Template manifest Base count does not match the app declaration");
}
if ((manifest.template.secrets ?? []).length !== 0) {
  throw new Error("v1 must not declare messaging credentials");
}
if (
  !configSource.includes('setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"]') ||
  !provisioningSource.includes("client.nodes.createChangeRequest") ||
  !provisioningSource.includes("client.nodes.updateMetadata")
) {
  throw new Error("Lazy Busabase resource provisioning is incomplete");
}
// Transport pagination belongs to the provider. A per-Base readLimit is how a
// desk ends up silently showing only the first page.
if (/readLimit/.test(configSource) || /readLimit/.test(JSON.stringify(manifest))) {
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
  "app/js/connect-gate.js",
  "app/js/instructor-sourcing-model.js",
  "app/js/busabase-client.js",
  "app/js/runtime.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
];
const source = (await Promise.all(browserFiles.map((file) => readFile(path.join(root, file), "utf8")))).join("\n");

/**
 * Runtime-detection rules — copied from
 * kelly-app-skill-creator/assets/runtime-detection/check-rules.mjs. Sixty-five
 * generated Apps had independently reinvented the same loopback-hostname test,
 * and one App's check script had gone as far as REQUIRING it. A rule that is
 * only written down gets re-derived; a rule that fails the build does not.
 */
const runtimeDetectionAssertions = (checkedSource, checkedServerSource) => [
  {
    ok: !/location\s*\.\s*hostname|window\.self\s*!==\s*window\.top/.test(checkedSource),
    message: "Runtime must not be inferred from the hostname or from iframe nesting",
  },
  {
    ok: checkedSource.includes("__airapp/runtime"),
    message: "Browser code must probe the injected runtime at __airapp/runtime",
  },
  {
    // Relative on purpose: under the Local Node engine the App is served from a
    // sub-path of busabase's origin, where a leading slash resolves against the
    // origin root instead and 404s.
    ok: !/["'`]\/__airapp\/runtime/.test(checkedSource),
    message: "Runtime probe must be relative (__airapp/runtime), without a leading slash",
  },
  {
    ok:
      checkedServerSource.includes("process.env.BUSABASE_AIRAPP_RUNTIME") &&
      checkedServerSource.includes('"/__airapp/runtime"'),
    message: "Server must expose the injected runtime at /__airapp/runtime",
  },
];

const assertions = [
  { ok: source.includes("createBusabaseClient"), message: "Browser Busabase SDK client is missing" },
  { ok: source.includes("window.location.origin"), message: "Busabase client must target its own origin" },
  { ok: !source.includes("/__busabase_api__/"), message: "Obsolete Busabase bridge prefix found" },
  { ok: !/BUSABASE_API_KEY/i.test(source), message: "Browser source must not reference API keys" },
  { ok: !/\bBearer\b/i.test(source), message: "Browser source must not reference Bearer credentials" },
  { ok: !/\blocalStorage\b/.test(source), message: "Persistent browser storage is forbidden" },
  {
    // v1 never sends anything from this skill; a messaging transport call
    // appearing anywhere in browser code would mean a boundary got crossed.
    ok: !/nodemailer|createTransport|sendMail\(|wechat.{0,20}send|process\.env\.SMTP/i.test(source),
    message: "This skill must never send a message from browser or app code",
  },
  {
    // vault.get returns plaintext values, so the browser must never call it.
    ok: !/vault\.(get|update|clear)/.test(source),
    message: "Browser code must never read or write the Busabase Vault",
  },
  { ok: !/\b(?:react|vite|jsx)\b/i.test(source), message: "Frontend build frameworks are forbidden" },
  {
    ok: appSource.includes("shouldUseLocalGateway()") && appSource.includes("if (!demo && standaloneLocalRuntime)"),
    message: "OAuth connection UI must be gated on the injected runtime, not the URL",
  },
  ...runtimeDetectionAssertions(source, serverSource),
  {
    // A deployed AirApp sits inside the Busabase review boundary; only a local
    // loopback preview may merge its own writes.
    ok: providerSource.includes("autoMerge: isStandaloneLocalRuntime()"),
    message: "Record writes must only auto-merge on a standalone local runtime",
  },
  {
    ok: providerSource.includes("bases.createChangeRequest") && providerSource.includes("records.changeRequest"),
    message: "Sourcing writes must go through Busabase ChangeRequests",
  },
  {
    ok: serverSource.includes("createBusabaseAirAppLocalGateway"),
    message: "Local OAuth must use the canonical busabase-sdk/airapp-node gateway, not hand-rolled PKCE",
  },
  {
    // A hand-vendored copy of the Node-only gateway module freezes at
    // whatever busabase-sdk version it was cut from and silently misses
    // every OAuth fix shipped after that — server.js runs in Node and can
    // import node_modules directly, so it must never vendor this module.
    ok: serverSource.includes('from "busabase-sdk/airapp-node"'),
    message: "Server must import the OAuth gateway from node_modules (busabase-sdk/airapp-node), not a vendored copy",
  },
  {
    ok: !/VaultSession|vault-session|OAuthVault|oauth-vault/i.test(serverSource),
    message: "Local OAuth must not depend on a remote Vault session",
  },
];
for (const { ok, message } of assertions) {
  if (!ok) throw new Error(message);
}

console.log("Kelly Instructor Sourcing checks OK");
