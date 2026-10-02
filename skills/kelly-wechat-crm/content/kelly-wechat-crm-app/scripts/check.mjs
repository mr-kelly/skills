import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const runtime = "node";
const serverFile = "server.js";

const required = [
  "package.json",
  "server.js",
  "wechat-status.mjs",
  "_node.json",
  ".busabaseignore",
  "app/vendor/busabase-sdk.js",
  "app/vendor/busabase-airapp.js",
  "app/vendor/busabase-airapp-gate.js",
  "airapp-blueprint.json",
  "app/index.html",
  "app/styles.css",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/messages.js",
  "app/js/busabase-client.js",
  "app/js/runtime.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
];

const contents = {};
for (const relative of required) contents[relative] = await readFile(path.join(root, relative), "utf8");

if (await readFile(path.join(root, "server.py"), "utf8").catch(() => null))
  throw new Error("Node AirApp must not ship a second Python server.");
if (await readFile(path.join(root, "airapp.json"), "utf8").catch(() => null))
  throw new Error("Node AirApp must not ship a conflicting airapp.json runtime manifest.");

const packageJson = JSON.parse(contents["package.json"]);
const blueprint = JSON.parse(contents["airapp-blueprint.json"]);
const { appConfig } = await import(path.join(root, "app/js/config.js"));
// Everything from here to the end of this block is about an npm project, so it
// runs only for one.
const sdkVersion = packageJson.dependencies?.["busabase-sdk"] || "";
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sdkVersion)) throw new Error("busabase-sdk must use an exact version.");
// Scan BOTH dependency maps: a bundler declared under devDependencies is just as unable to
// boot under Nodepod as one under dependencies, and only `dependencies` was being checked.
const declaredDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
const unsupportedDep = ["react", "vite", "webpack", "next", "parcel", "react-scripts"].find(
  (name) => declaredDeps[name],
);
if (unsupportedDep) throw new Error(`Unsupported frontend dependency: ${unsupportedDep}.`);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.devDependencies?.["esbuild-wasm"] || "")) {
  throw new Error("esbuild-wasm must use an exact version.");
}
// `dev` is the script that matters: BOTH AirApp engines run `npm run dev` (nodepod-runner.ts
// and local-runtime.ts). This check only ever asserted `start`, so a project that dropped
// `dev` — the exact shape a Vite scaffold produces — passed here and then died at run time on
// `npm error Missing script: "dev"`. `start` is still checked because deployment uses it.
if (packageJson.scripts?.dev !== "node server.js")
  throw new Error('dev must be exactly "node server.js" — it is what Busabase runs.');
if (packageJson.scripts?.start !== "node server.js") throw new Error("start must not build or spawn subprocesses.");
if (contents["app/vendor/busabase-sdk.js"].length < 10_000 || contents["app/vendor/busabase-airapp.js"].length < 5_000)
  throw new Error("Browser SDK bundle is missing or incomplete.");
if (!["cloud", "desktop"].includes(appConfig.deployment)) throw new Error("Invalid deployment mode.");
if (!Array.isArray(appConfig.bases) || !appConfig.bases.length) throw new Error("Configured Bases are missing.");
if (!appConfig.folder?.slug || !appConfig.airApp?.resourceKey)
  throw new Error("Portable Folder/AirApp declaration missing.");
if (appConfig.bases.some((base) => "nodeId" in base || "baseId" in base))
  throw new Error("Template config must not pin resource ids from another Space.");
if (appConfig.bases.some((base) => base.slug !== `${appConfig.appId}-${base.key}`))
  throw new Error("Every Base slug must use the portable <app-id>-<resource-key> form.");
if (appConfig.bases.some((base) => !Number.isInteger(base.readLimit) || base.readLimit < 1 || base.readLimit > 50)) {
  throw new Error("Every configured Base requires an integer readLimit from 1 to 50.");
}
for (const [index, base] of appConfig.bases.entries()) {
  const expected = blueprint.workspace?.bases?.[index]?.read_limit ?? 50;
  if (base.readLimit !== expected)
    throw new Error(`Configured Base ${base.key || index} readLimit does not match blueprint.`);
}
const demoRecordCount = appConfig.bases.reduce((count, base) => count + (base.sampleRecords || []).length, 0);
if (demoRecordCount < 3 || demoRecordCount > 50) {
  throw new Error("Demo provider requires 3-50 deliberately scoped records.");
}
if (blueprint.app?.slug !== appConfig.appId) throw new Error("Blueprint/config app slug mismatch.");
if (!Number.isInteger(appConfig.onboarding?.version) || appConfig.onboarding.version < 1)
  throw new Error("Onboarding requires a positive version.");
if (!Array.isArray(appConfig.onboarding?.requiredFields))
  throw new Error("Onboarding requiredFields must be an array.");
if (!appConfig.onboarding.requiredFields.length && !appConfig.onboarding.rationale)
  throw new Error("Empty onboarding requires an explicit rationale.");
if (appConfig.onboarding.requiredFields.some((field) => !appConfig.bases.some((base) => base.key === field.resource)))
  throw new Error("Every onboarding field must belong to a declared Base.");
if (
  !appConfig.onboarding?.completionResource ||
  !appConfig.bases.some((base) => base.key === appConfig.onboarding.completionResource)
)
  throw new Error("Onboarding completion resource must be a declared Base.");

// Everything the browser downloads. `server.js` is deliberately NOT here: it is
// the only file allowed to know about credentials, because its dev proxy reads
// them from the environment and attaches them server-side.
const browserSource = [
  contents["app/js/app.js"],
  contents["app/js/config.js"],
  contents["app/js/busabase-client.js"],
  contents["app/js/runtime.js"],
  contents["app/js/providers/busabase-provider.js"],
].join("\n");

if (!browserSource.includes("createBusabaseClient")) throw new Error("SDK client missing.");
// One relative path, every environment: same-origin inside Busabase, this app's
// own dev proxy when run standalone. A hard-coded absolute Busabase URL or a
// leftover bridge prefix would work in exactly one of them.
if (!browserSource.includes("window.location.origin")) throw new Error("Runtime client must target its own origin.");
if (browserSource.includes("__busabase_api__")) throw new Error("Obsolete /__busabase_api__ bridge prefix found.");
if (/baseUrl\s*:\s*["'`]https?:\/\//.test(browserSource))
  throw new Error("Hard-coded Busabase URL found in browser source.");
const providerSource = contents["app/js/providers/busabase-provider.js"];
if (!/limit:\s*base\.readLimit/.test(providerSource))
  throw new Error("Busabase provider must consume each configured Base readLimit.");
if (/while\s*\(\s*cursor\s*\)|client\.bases\.list\s*\(/.test(browserSource))
  throw new Error("Unbounded loading or runtime Base discovery found.");
// Asset references must be RELATIVE. Under the Local Node engine the app is
// reverse-proxied onto a sub-path of busabase's origin, so `src="/js/app.js"`
// resolves against the origin root (busabase itself) and 404s — the app renders
// under Nodepod but not under Local Node. `/api/v1/...` is deliberately absolute
// and unaffected: it is an API call, not an asset.
const absoluteAssetRef = /(?:src|href)="\/(?!\/)|from\s+["']\/(?!\/)/;
if (absoluteAssetRef.test(browserSource) || absoluteAssetRef.test(contents["app/index.html"]))
  throw new Error("Absolute asset path found; use relative paths so the Local Node sub-path proxy works.");
// --- Runtime detection -----------------------------------------------------
// The app must learn where it runs from `BUSABASE_AIRAPP_RUNTIME`, which
// Busabase injects into the process it spawns and `server.js` re-exposes at
// `__airapp/runtime`. Hostname tests are wrong in BOTH directions: a
// Busabase-hosted AirApp is served from `localhost` on Desktop/OSS, and a
// standalone `npm run dev` is reached over LAN IPs and signed dev tunnels
// (`https://3111-….dev.budaapps.com`). The "not localhost ⇒ hosted" direction
// is the damaging one — the app hides its own connection gate, calls
// `/api/v1` unauthenticated, and reports an error the user cannot act on.
// Comments are stripped first so the reasoning may name `localhost` in prose.
const withoutComments = browserSource.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1 ");
if (/location\s*\.\s*(?:hostname|host)\b/.test(withoutComments))
  throw new Error("Hostname-based runtime detection found; read the runtime from __airapp/runtime instead.");
if (
  /(?:===|!==|==|!=)\s*["'`][^"'`]*(?:localhost|127\.0\.0\.1)|(?:includes|startsWith|endsWith|indexOf|search|match|test)\s*\(\s*\/?["'`]?[^"'`)]*(?:localhost|127\.0\.0\.1)/.test(
    withoutComments,
  )
) {
  throw new Error("Loopback host comparison found; runtime detection must not depend on the URL.");
}
if (!/getRuntime\s*\(/.test(contents["app/js/app.js"]))
  throw new Error("app.js must resolve the runtime via runtime.js's getRuntime().");
if (!browserSource.includes("__airapp/runtime"))
  throw new Error("Browser source must probe the __airapp/runtime endpoint.");
// Relative on purpose — for a hosted app, a leading slash can resolve against
// Busabase's origin root instead of the app's preview sub-path.
if (/["'`]\/__airapp\/runtime/.test(browserSource))
  throw new Error("Runtime probe must use the relative path __airapp/runtime, without a slash.");
// The host must use the SDK's canonical runtime report and re-expose it.
const serverSource = contents[serverFile];
// Comments are stripped first, and that is load-bearing rather than tidiness:
// prose about the helper must never satisfy the rule. (Same technique the
// browser-source rules below already use.)
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1 ");
const serverCode = stripComments(serverSource);

const usesRuntimeHelper = /\bdescribeBusabaseAirAppRuntime\s*\(\s*\)/.test(serverCode);
if (!usesRuntimeHelper) throw new Error(`${serverFile} must expose the SDK's describeBusabaseAirAppRuntime() report.`);
// The one shape that must never come back: deciding hosting from a hardcoded
// list of engine names. That is what broke 66 apps when `local-node` became
// `local`, and moving the list into an app would reintroduce it wholesale.
if (/AIRAPP_HOSTED_RUNTIMES\s*=\s*new Set|hosted:\s*\w*RUNTIMES?\w*\.has\s*\(/.test(serverCode))
  throw new Error(
    `${serverFile} decides hosting from a hardcoded engine list; use describeBusabaseAirAppRuntime() instead.`,
  );
if (!/["'`]\/__airapp\/runtime["'`]/.test(serverSource))
  throw new Error(`${serverFile} must serve the /__airapp/runtime endpoint.`);

// Credentials are scanned across EVERY file the browser downloads, not just the
// five that carry logic. `browserSource` above deliberately excludes
// `messages.js` and `demo-provider.js` because the structural rules (asset
// paths, hostname detection) would false-positive on UI copy — but a key
// pasted into a string table ships to the browser exactly like one pasted into
// app.js, and used to pass this gate.
const browserDownloads = [
  contents["app/js/app.js"],
  contents["app/js/config.js"],
  contents["app/js/busabase-client.js"],
  contents["app/js/runtime.js"],
  contents["app/js/messages.js"],
  contents["app/js/providers/busabase-provider.js"],
  contents["app/js/providers/demo-provider.js"],
  contents["app/index.html"],
].join("\n");
if (/BUSABASE_API_KEY/i.test(browserDownloads)) throw new Error("API key reference found in browser source.");
if (/Bearer/i.test(browserDownloads)) throw new Error("Bearer header found in browser source.");
// The dev proxy may reference the env var; it may never carry a literal token.
if (/Bearer\s+(?!\$\{)[A-Za-z0-9_-]{8,}/.test(serverSource))
  throw new Error(`Literal Bearer token found in ${serverFile}.`);
// The OAuth gateway is what lets a STANDALONE app obtain a credential of its
// own. It lives in busabase-sdk and is not reimplemented per language — porting
// an auth flow into a second language is how two implementations drift, and the
// one that drifts is a security boundary. So a Node app must use it, and a
// non-Node app must be honest that it has none rather than 404ing at /auth/*
// and leaving the operator guessing.
if (!serverSource.includes("createBusabaseAirAppLocalGateway"))
  throw new Error("Server must use the SDK local AirApp OAuth/Space gateway.");
for (const route of ["/auth/status", "/auth/start", "/auth/callback", "/auth/space", "/auth/logout"]) {
  if (!serverSource.includes(route)) throw new Error(`Server is missing ${route}.`);
}
// Space selection now lives in busabase-sdk/airapp-gate's createAirAppConnectGate(),
// not hand-rolled per app — see runtime-and-sdk.md. Assert adoption, not the retired
// literal route string (that now lives only in the vendored SDK bundle).
// The connect gate is the standalone half too: it exists to walk a user through
// obtaining a credential, which a hosted-only runtime never needs.
if (!contents["app/js/app.js"].includes("createAirAppConnectGate"))
  throw new Error("Browser setup must use busabase-sdk/airapp-gate's createAirAppConnectGate().");
if (!contents["app/js/app.js"].includes('window.location.hash = "#/help-settings"'))
  throw new Error("Help & Settings must use a route distinct from the settings Base.");
if (!contents["app/js/app.js"].includes('fetch("__wechat/status"'))
  throw new Error("Browser setup must check the local WeChat connector after the Busabase gate.");
if (!serverSource.includes('"/__wechat/status"'))
  throw new Error("Server must expose a sanitized WeChat connector status endpoint.");
if (!serverSource.includes('"/__wechat/contacts"'))
  throw new Error("Server must expose explicit-query local contact discovery.");
if (appConfig.readOnly && appConfig.permissions.writeProcedures.length) {
  throw new Error("Read-only app declares write procedures.");
}

console.log(
  `AirApp checks OK (${runtime}). ${demoRecordCount} demo records; busabase-sdk ${sdkVersion}; ${appConfig.deployment} deployment.`,
);
