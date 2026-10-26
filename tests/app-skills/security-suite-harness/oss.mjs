import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { getFreePort, startProcess } from "../harness/process.mjs";

const exec = promisify(execFile);
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const command = (file, args, options = {}) =>
  exec(file, args, { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024, timeout: 180000, ...options });
export const eq = (fieldSlug, value) => [{ fieldSlug, operator: "eq", value }];

export const startOss = async (t, skill) => {
  const work = await mkdtemp(path.join(os.tmpdir(), `${skill}-acceptance-`));
  const skillRoot = path.join(repoRoot, "skills", skill);
  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const configFile = path.join(work, "empty-config");
  await writeFile(configFile, "", { mode: 0o600 });
  const env = {
    ...process.env,
    BUSABASE_BASE_URL: origin,
    BUSABASE_SPACE_ID: "local",
    BUSABASE_API_KEY: "",
    BUSABASE_CONFIG: configFile,
  };
  const args = [
    "--yes",
    "busabase@0.99.1",
    "server",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--data",
    path.join(work, "data"),
  ];
  let processInfo;
  const boot = async () => {
    processInfo = await startProcess({
      command: "npx",
      args,
      cwd: work,
      env,
      readyUrl: `${origin}/api/health`,
      timeoutMs: 180000,
    });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${origin}/api/v1/nodes?depth=1`, { signal: AbortSignal.timeout(2000) })).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("OSS data layer unavailable after health readiness");
  };
  t.after(async () => {
    if (processInfo) await processInfo.stop();
    await rm(work, { recursive: true, force: true });
  });
  await boot();
  try {
    await command(process.execPath, ["scripts/setup.mjs", "--apply"], { cwd: skillRoot, env });
  } catch (error) {
    const response = await fetch(`${origin}/api/v1/nodes?depth=1`);
    throw new Error(
      `Initial setup failed; installed local node metadata: ${JSON.stringify(await response.json())}\n${error instanceof Error ? error.message : error}`,
    );
  }
  const resolve = createRequire(path.join(skillRoot, "package.json"));
  const { createBusabaseClient } = await import(pathToFileURL(resolve.resolve("busabase-sdk")).href);
  const { connectStore } = await import(pathToFileURL(path.join(skillRoot, "lib/store.mjs")).href);
  const connect = () => connectStore(createBusabaseClient({ baseUrl: origin, spaceId: "local" }));
  const store = await connect();
  assert.ok(store.resources.folder && store.resources.airApp, "The complete app must be installed");
  const identity = store.resources.bases.map((base) => [base.key, base.nodeId, base.baseId]);
  try {
    await command(process.execPath, ["scripts/setup.mjs", "--apply"], { cwd: skillRoot, env });
  } catch (error) {
    const response = await fetch(`${origin}/api/v1/nodes/${store.resources.folder.nodeId}`);
    const installed = await response.json();
    throw new Error(
      `Second setup failed; installed Folder metadata: ${JSON.stringify(installed.data?.metadata || installed.metadata || installed)}\n${error instanceof Error ? error.message : error}`,
    );
  }
  assert.deepEqual(
    (await connect()).resources.bases.map((base) => [base.key, base.nodeId, base.baseId]),
    identity,
    "A second setup must not create duplicate app resources",
  );
  return {
    work,
    origin,
    skillRoot,
    env,
    store,
    connect,
    restart: async () => {
      await processInfo.stop();
      await boot();
      return connect();
    },
  };
};
