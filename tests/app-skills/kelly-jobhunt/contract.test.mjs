import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-jobhunt");
const appRoot = join(skillRoot, "app");
const browserRoot = join(appRoot, "app");
const requiredFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
  "resource-map.json",
  "scripts/check.mjs",
  "app/index.html",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/jobhunt-model.js",
];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const browserSource = async () => {
  const files = [
    join(browserRoot, "js", "app.js"),
    join(browserRoot, "js", "busabase-client.js"),
    join(browserRoot, "js", "jobhunt-model.js"),
    join(browserRoot, "js", "providers", "busabase-provider.js"),
    join(browserRoot, "js", "providers", "demo-provider.js"),
    join(browserRoot, "js", "resource-provisioning.js"),
  ];
  return (await Promise.all(files.map((path) => readFile(path, "utf8")))).join("\n");
};

test("has the canonical app project and deterministic commands", async () => {
  await Promise.all(requiredFiles.map((path) => readFile(join(appRoot, path))));
  const pkg = await readJson(join(appRoot, "package.json"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.scripts.dev, "node server.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.match(pkg.scripts.check, /node --test/);
});

test("keeps resource-map and runtime declarations aligned", async () => {
  const resourceMap = await readJson(join(appRoot, "resource-map.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(resourceMap.schemaVersion, appConfig.schemaVersion);
  assert.equal(resourceMap.appRoot.slug, appConfig.folder.slug);
  assert.equal(resourceMap.provisioning.mode, "lazy");
  assert.deepEqual(resourceMap.provisioning.mutations, appConfig.permissions.setupProcedures);
  assert.deepEqual(
    resourceMap.resources.map(({ key, slug, schemaVersion }) => ({ key, slug, schemaVersion })),
    appConfig.bases.map(({ key, slug }) => ({ key, slug, schemaVersion: appConfig.schemaVersion })),
  );
});

test("every readLimit stays within the Busabase server maximum", async () => {
  // The server rejects records.list({limit}) above 100 with "Input validation
  // failed — limit: Too big". Demo mode never calls Busabase, so nothing else
  // in this suite would catch a regression here.
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  for (const base of appConfig.bases) {
    assert.ok(base.readLimit <= 100, `${base.slug} readLimit=${base.readLimit}`);
  }
});

test("does not persist secrets or domain state in browser storage", async () => {
  const source = await browserSource();
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.match(source, /createBusabaseClient/);
});

test("no mail transport can ever run in browser code", async () => {
  // The word "SMTP" is allowed in help copy; a transport, a credential, or a
  // send call is not. Sending stays in scripts/send_emails.mjs.
  const source = await browserSource();
  assert.doesNotMatch(source, /\bnodemailer\b|createTransport|sendMail|SMTP_PASS|SMTP_USER/i);
});

test("browser writes only auto-merge on a standalone local runtime", async () => {
  const provider = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(provider, /isStandaloneLocalRuntime\(\)/);
  assert.doesNotMatch(provider, /autoMerge:\s*true/);
  assert.match(provider, /bases\.createChangeRequest/);
  assert.match(provider, /records\.changeRequest/);
});

test("the demo provider never reaches Busabase", async () => {
  const demo = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.doesNotMatch(demo, /createRuntimeClient|records\.list|changeRequest/);
});

test("trusted scripts carry their own credentials and default to a dry run", async () => {
  const lib = await readFile(join(skillRoot, "scripts", "lib.mjs"), "utf8");
  const send = await readFile(join(skillRoot, "scripts", "send_emails.mjs"), "utf8");
  const importLeads = await readFile(join(skillRoot, "scripts", "import_leads.mjs"), "utf8");

  assert.match(lib, /BUSABASE_API_KEY/);
  assert.doesNotMatch(lib, /window\./);
  for (const source of [send, importLeads]) {
    assert.match(source, /parseFlags\(process\.argv\.slice\(2\)\)/);
    assert.match(source, /if \(!apply/);
  }
  // A bulk import has no autoMerge flag on the server, so it must be reviewed
  // and merged explicitly rather than left pending forever.
  assert.match(importLeads, /mergeChangeRequest/);
  assert.match(lib, /changeRequests\.review/);
  assert.match(lib, /changeRequests\.merge/);
});

test("a dry run never requires the resume attachment to exist", async () => {
  // The point of a dry run is to print the plan; crashing on a missing PDF
  // hides the very list the operator asked for.
  const send = await readFile(join(skillRoot, "scripts", "send_emails.mjs"), "utf8");
  assert.match(send, /if \(!resumeReady\)/);
  assert.match(send, /if \(apply\) fail\(/);
});

test("the resume directory ships empty and stays untracked", async () => {
  const gitignore = await readFile(join(skillRoot, ".gitignore"), "utf8");
  assert.match(gitignore, /^resume\/\*$/m);
  assert.match(gitignore, /^!resume\/\.gitkeep$/m);
});
