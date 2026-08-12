import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-insure-data");
const appRoot = join(skillRoot, "app");
const browserRoot = join(appRoot, "app");
const requiredFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
  "resource-map.json",
  "scripts/check.mjs",
  "app/index.html",
  "app/app.js",
  "app/js/config.js",
  "app/js/insure-client.js",
  "app/js/insure-model.js",
];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("has the canonical app project and deterministic commands", async () => {
  await Promise.all(requiredFiles.map((path) => readFile(join(appRoot, path))));
  const pkg = await readJson(join(appRoot, "package.json"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.scripts.dev, "node server.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.match(pkg.scripts.check, /node --test/);
  assert.equal(pkg.dependencies["busabase-sdk"], "0.11.0");
});

test("declares an operator-provisioned resource map (not lazy provisioning)", async () => {
  const resourceMap = await readJson(join(appRoot, "resource-map.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(resourceMap.appId, appConfig.appId);
  assert.equal(resourceMap.schemaVersion, 1);
  assert.equal(resourceMap.provisioning.mode, "operator-provisioned");
  assert.deepEqual(resourceMap.provisioning.mutations, []);
  assert.equal(resourceMap.drive.slug, appConfig.drive.slug);
  assert.deepEqual(
    resourceMap.resources.map(({ key, slug }) => ({ key, slug })),
    appConfig.bases.map(({ key, slug }) => ({ key, slug })),
  );
});

test("transport page size is owned by the reader, not declared per Base", async () => {
  // A per-Base `readLimit` used to double as "how many records total" inside
  // listRecords's own loop condition, which silently dropped every row past
  // it instead of reading to exhaustion. Neither the demo provider nor a unit
  // test against a small fixture would ever catch that.
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  for (const base of appConfig.bases) {
    assert.ok(!Object.hasOwn(base, "readLimit"), `${base.key} still declares readLimit`);
  }

  const clientSource = await readFile(join(browserRoot, "js", "insure-client.js"), "utf8");
  assert.match(clientSource, /const RECORD_PAGE_SIZE = 100;/);
  assert.doesNotMatch(clientSource, /while \(records\.length < limit\)/);
  assert.match(clientSource, /PAGINATION_LOOP/);

  const scriptClientSource = await readFile(join(skillRoot, "scripts", "lib", "busabase-client.mjs"), "utf8");
  assert.match(scriptClientSource, /const RECORD_PAGE_SIZE = 100;/);
  assert.doesNotMatch(scriptClientSource, /while \(records\.length < limit\)/);
  assert.match(scriptClientSource, /PAGINATION_LOOP/);
});

test("reads a Base to exhaustion across multiple pages", async () => {
  const { listRecords } = await import(join(browserRoot, "js", "insure-client.js"));
  const total = 250;
  const allRecords = Array.from({ length: total }, (_, index) => ({
    id: `rec_${index}`,
    baseId: "bse_x",
    fields: { name: `第${index}条` },
  }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (pathname) => {
    const url = new URL(pathname, "http://localhost");
    const cursor = url.searchParams.get("cursor");
    const start = cursor ? Number(cursor) : 0;
    const slice = allRecords.slice(start, start + 100);
    const next = start + 100;
    const body = JSON.stringify({ records: slice, nextCursor: next < total ? String(next) : null });
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const records = await listRecords("bse_x");
    assert.equal(records.length, total);
    assert.equal(records.at(-1).fields.name, "第249条");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a repeating cursor is reported instead of silently truncating", async () => {
  const { listRecords } = await import(join(browserRoot, "js", "insure-client.js"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ records: [{ id: "rec_1", baseId: "bse_y" }], nextCursor: "same" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    await assert.rejects(() => listRecords("bse_y"), /PAGINATION_LOOP/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("declares a read-only AirApp", async () => {
  const configText = await readFile(join(browserRoot, "js", "config.js"), "utf8");
  assert.match(configText, /readOnly: true/);
  assert.match(configText, /writeProcedures:\s*\[\]/);
});

test("does not persist secrets or a second data provider in browser storage", async () => {
  const sources = await Promise.all(
    ["app.js", "js/insure-client.js", "js/providers/busabase-provider.js", "js/connect-gate.js"].map((path) =>
      readFile(join(browserRoot, path), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.doesNotMatch(source, /localStorage\.setItem\("busabase|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.doesNotMatch(source, /KELLY_INSURE_DATA_DATA_PROVIDER|local-file-provider/);
});

test("never writes records or nodes from the browser — the workspace is a read-only view", async () => {
  const source = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.doesNotMatch(source, /records\.changeRequest|bases\.createChangeRequest|nodes\.createChangeRequest/);
  const clientSource = await readFile(join(browserRoot, "js", "insure-client.js"), "utf8");
  assert.doesNotMatch(clientSource, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
});

test("does not use resource-provisioning.js's ownership/create-if-missing flow", async () => {
  const providerText = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.doesNotMatch(providerText, /resource-provisioning\.js/);
  await assert.rejects(readFile(join(browserRoot, "js", "resource-provisioning.js")));
});

test("retires the pre-Busabase local-file provider layer", async () => {
  for (const path of [
    "lib",
    "config.example.json",
    "app/setup-gate.js",
    "app/setup-gate.css",
    "app/server",
    "app/start.sh",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
});

test("ports the trusted operator scripts to .mjs with a raw-fetch Busabase client", async () => {
  await Promise.all(
    [
      "scripts/lib/busabase-client.mjs",
      "scripts/export_busabase_snapshot.mjs",
      "scripts/restore_busabase_snapshot.mjs",
      "scripts/backfill_pdf_metadata.mjs",
    ].map((path) => readFile(join(skillRoot, path))),
  );
  for (const path of [
    "scripts/export_busabase_snapshot.ts",
    "scripts/restore_busabase_snapshot.ts",
    "scripts/backfill_pdf_metadata.ts",
  ]) {
    await assert.rejects(readFile(join(skillRoot, path)));
  }
  const rootPkg = await readJson(join(skillRoot, "package.json"));
  assert.match(rootPkg.scripts["busabase:export"], /export_busabase_snapshot\.mjs/);
  assert.match(rootPkg.scripts["busabase:restore"], /restore_busabase_snapshot\.mjs/);
  assert.match(rootPkg.scripts["busabase:backfill-pdf-text"], /backfill_pdf_metadata\.mjs/);
});
