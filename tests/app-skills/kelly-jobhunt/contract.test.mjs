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

test("transport pagination is owned by the provider, not declared per Base", async () => {
  // A per-Base readLimit is how a desk ends up silently showing only the first
  // page: research routinely produces more than 100 contact addresses, and
  // neither demo mode nor a unit test would ever notice the truncation.
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const resourceMap = await readJson(join(appRoot, "resource-map.json"));
  for (const declaration of [...appConfig.bases, ...resourceMap.resources]) {
    assert.ok(!Object.hasOwn(declaration, "readLimit"), `${declaration.slug} still declares readLimit`);
  }

  const provider = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(provider, /const BUSABASE_RECORD_PAGE_SIZE = 100;/);
  assert.match(provider, /readAllPages/);
  // A server that keeps handing back the same cursor must not spin forever.
  assert.match(provider, /PAGINATION_LOOP/);
});

test("reads follow nextCursor past the first page", async () => {
  const { readAllPages } = await import(join(browserRoot, "js", "providers", "busabase-provider.js"));
  const total = 250;
  const rows = Array.from({ length: total }, (_, index) => ({ id: `rec_${index}`, fields: { name: `第${index}家` } }));
  const client = {
    records: {
      list: async ({ cursor }) => {
        const start = cursor ? Number(cursor) : 0;
        const slice = rows.slice(start, start + 100);
        const next = start + 100;
        return { records: slice, nextCursor: next < total ? String(next) : null };
      },
    },
  };
  const page = await readAllPages(client, { key: "companies", baseId: "bse_x" });
  assert.equal(page.records.length, total);
  assert.equal(page.pageCount, 3);
  assert.equal(page.records.at(-1).fields.name, "第249家");
});

test("a repeating cursor is reported instead of looping forever", async () => {
  const { readAllPages } = await import(join(browserRoot, "js", "providers", "busabase-provider.js"));
  const client = { records: { list: async () => ({ records: [], nextCursor: "same" }) } };
  await assert.rejects(() => readAllPages(client, { key: "leads", baseId: "bse_y" }), /PAGINATION_LOOP/);
});

test("does not persist secrets or domain state in browser storage", async () => {
  const source = await browserSource();
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.match(source, /createBusabaseClient/);
});

test("no mail transport can ever run in browser code", async () => {
  // The Vault key names legitimately appear in the profile screen, which shows
  // whether credentials are configured. A transport or a value does not.
  const source = await browserSource();
  assert.doesNotMatch(source, /\bnodemailer\b|createTransport|sendMail|process\.env\.SMTP/i);
});

test("browser code never touches the Vault", async () => {
  // vault.get returns plaintext values, so reaching it from the browser would
  // put an app password one console.log away from the screen.
  const source = await browserSource();
  assert.doesNotMatch(source, /vault\.(get|update|clear)/);
});

test("the Vault is written by a trusted script that merges rather than replaces", async () => {
  const lib = await readFile(join(skillRoot, "scripts", "lib.mjs"), "utf8");
  const configure = await readFile(join(skillRoot, "scripts", "configure_smtp.mjs"), "utf8");
  const send = await readFile(join(skillRoot, "scripts", "send_emails.mjs"), "utf8");

  // busabase-sdk strips the Vault from its cloud client on purpose, so the
  // script talks to /api/v1/vault directly and treats a Vault-less instance as
  // a normal answer rather than a crash.
  assert.match(lib, /\/api\/v1\/vault/);
  assert.match(lib, /vaultUnavailableHint/);
  // PUT /vault replaces the whole document; writing only our own keys would
  // delete every other item on the instance.
  assert.match(lib, /upsertVaultItems/);
  assert.match(configure, /upsertVaultItems/);
  assert.doesNotMatch(configure, /client\.vault\.update/);
  // The sender resolves credentials from the Vault, not from its environment.
  assert.match(send, /readVaultValues/);
  assert.doesNotMatch(send, /process\.env\.SMTP_PASS/);
});

test("the resume builder never invents a claim and degrades without Chrome", async () => {
  const builder = await readFile(join(skillRoot, "scripts", "build_resume.mjs"), "utf8");
  // Everything printed comes from stored profile fields.
  assert.match(builder, /resume_source/);
  // Chrome prints from the command line; driving CDP would need a WebSocket
  // global that older Node builds do not have.
  assert.match(builder, /--print-to-pdf=/);
  assert.doesNotMatch(builder, /new WebSocket|webSocketDebuggerUrl/);
  // No Chrome must leave the HTML behind rather than failing with nothing.
  assert.match(builder, /HTML 预览/);
  assert.match(builder, /CHROME_PATH/);
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
