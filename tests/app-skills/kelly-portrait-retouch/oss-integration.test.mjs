import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { appConfig } from "../../../skills/kelly-portrait-retouch/content/kelly-portrait-retouch-app/app/js/config.js";
import {
  inspectProvisionedResources,
  provisionDeclaredResources,
} from "../../../skills/kelly-portrait-retouch/content/kelly-portrait-retouch-app/app/js/resource-provisioning.js";
import { createBusabaseClient } from "../../../skills/kelly-portrait-retouch/content/kelly-portrait-retouch-app/node_modules/busabase-sdk/dist/index.js";
import { getFreePort, startProcess } from "../harness/process.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-portrait-retouch", "content", "kelly-portrait-retouch-app");
let dataDir;
let busabasePort;
let busabaseUrl;
let busabase;
let appRuntime;
let client;

async function startBusabase() {
  busabase = await startProcess({
    command: "npx",
    args: [
      "--yes",
      "busabase@0.16.2",
      "server",
      "--host",
      "127.0.0.1",
      "--port",
      String(busabasePort),
      "--data",
      dataDir,
    ],
    cwd: repoRoot,
    readyUrl: `${busabaseUrl}/api/v1/auth`,
    timeoutMs: 60_000,
  });
  client = createBusabaseClient({ baseUrl: busabaseUrl, spaceId: "local" });
}

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "kelly-portrait-retouch-oss-"));
  busabasePort = await getFreePort();
  busabaseUrl = `http://127.0.0.1:${busabasePort}`;
  await startBusabase();
});

test.after(async () => {
  await appRuntime?.stop();
  await busabase?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test("lazy provisioning is exact, idempotent, and collision-free", async () => {
  const [first, concurrent] = await Promise.all([
    provisionDeclaredResources(client, appConfig),
    provisionDeclaredResources(client, appConfig),
  ]);
  assert.equal(first.folder.slug, appConfig.folder.slug);
  assert.deepEqual(
    first.bases.map((base) => base.key),
    ["jobs", "candidates", "settings"],
  );
  assert.deepEqual(
    concurrent.bases.map((base) => base.baseId),
    first.bases.map((base) => base.baseId),
  );

  const folder = await client.nodes.get({ nodeId: first.folder.nodeId, type: "folder" });
  assert.equal(folder.children.length, 3);
  assert.deepEqual(folder.children.map((node) => node.slug).sort(), appConfig.bases.map((base) => base.slug).sort());
  for (const declared of first.bases) {
    const actual = await client.bases.get({ baseId: declared.baseId });
    assert.deepEqual(
      actual.fields.map(({ slug, type, required }) => ({ slug, type, required })),
      appConfig.bases
        .find((base) => base.key === declared.key)
        .fields.map(({ slug, type, required }) => ({ slug, type, required })),
    );
  }
});

test("onboarding and one representative candidate persist through ChangeRequests", async () => {
  const resources = await inspectProvisionedResources(client, appConfig);
  const bases = new Map(resources.bases.map((base) => [base.key, base]));
  const now = "2026-08-11T12:00:00.000Z";
  await client.bases.createChangeRequest({
    baseId: bases.get("settings").baseId,
    fields: {
      "record-id": "config",
      "onboarding-version": 1,
      "completed-at": now,
      "default-preset": "natural",
      "default-strength": 35,
      "metadata-policy": "strip",
      "external-upload-policy": "explicit-only",
      "overwrite-policy": "explicit-only",
      "updated-at": now,
    },
    message: "OSS test onboarding",
    submittedBy: appConfig.appId,
    autoMerge: true,
  });
  await client.bases.createChangeRequest({
    baseId: bases.get("candidates").baseId,
    fields: {
      "candidate-id": "candidate-oss-1",
      "job-id": "job-oss-1",
      ref: 1,
      title: "OSS portrait",
      status: "needs_review",
      preset: "natural",
      strength: 35,
      "face-count": 1,
      "source-label": "source.jpg",
      "output-label": "candidate.jpg",
      checks: JSON.stringify({ texture: "pass", identity: "pass", tone: "pass" }),
      "review-version": 1,
    },
    message: "OSS test candidate",
    submittedBy: "kelly-portrait-retouch-agent",
    autoMerge: true,
  });
  const config = await client.records.get({
    baseId: bases.get("settings").baseId,
    fieldSlug: "record-id",
    valueText: "config",
  });
  assert.equal((config.headCommit.payload || config.headCommit.fields)["onboarding-version"], 1);
});

test("resources and records survive Busabase restart and the app proxy", async () => {
  await busabase.stop();
  await startBusabase();
  const resources = await inspectProvisionedResources(client, appConfig);
  assert.equal(resources.missing.length, 0);
  const candidateBase = resources.bases.find((base) => base.key === "candidates");
  const candidate = await client.records.get({
    baseId: candidateBase.baseId,
    fieldSlug: "candidate-id",
    valueText: "candidate-oss-1",
  });
  assert.equal((candidate.headCommit.payload || candidate.headCommit.fields).title, "OSS portrait");

  const appPort = await getFreePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  appRuntime = await startProcess({
    command: process.execPath,
    args: ["server.js"],
    cwd: appRoot,
    env: { PORT: String(appPort), BUSABASE_BASE_URL: busabaseUrl, BUSABASE_SPACE_ID: "local" },
    readyUrl: `${appUrl}/health`,
  });
  const status = await fetch(`${appUrl}/auth/status`).then((response) => response.json());
  assert.equal(status.connected, true);
  assert.equal(status.space.id, "local");
  const proxied = createBusabaseClient({ baseUrl: appUrl, spaceId: "local" });
  const roots = await proxied.nodes.list({ parentId: null, depth: 2 });
  const visible = roots.flatMap((node) => [node, ...(node.children || [])]);
  assert.equal(visible.filter((node) => node.slug === appConfig.folder.slug).length, 1);
});
