import fs from "node:fs/promises";
import path from "node:path";
import { makeDemoBatch } from "./demo.ts";
import {
  appDir,
  batchPath,
  configExamplePath,
  configLocalPath,
  dataDir,
  decisionsPath,
  lockPath,
  onboardingPath,
} from "./paths.ts";

export async function ensureDirs() {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function exists(file: string) {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(file: string, value: unknown) {
  await ensureDirs();
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readBatch(demo = false) {
  if (demo) return makeDemoBatch();
  const fallback = makeDemoBatch();
  if (!(await exists(batchPath))) await writeJson(batchPath, fallback);
  return readJson(batchPath, fallback);
}

export async function readDecisions() {
  return readJson(decisionsPath, { schema_version: "1", updated_at: new Date().toISOString(), decisions: {} });
}

export async function saveDecision(id: string, body: Record<string, unknown>) {
  if (await exists(lockPath)) {
    return { ok: false, error: "Agent is writing. Try again after the lock clears." };
  }
  const decisions = (await readDecisions()) as Record<string, unknown> & { decisions: Record<string, unknown> };
  decisions.updated_at = new Date().toISOString();
  decisions.decisions[id] = {
    action: body.action,
    note: body.note || "",
    edited_body: body.edited_body || "",
    decided_at: new Date().toISOString(),
  };
  await writeJson(decisionsPath, decisions);
  return { ok: true };
}

export async function readState(demo = false) {
  await ensureDirs();
  const onboarding = await readJson(onboardingPath, { completed: false });
  const configSource = (await exists(configLocalPath)) ? "config.local.json" : "config.example.json";
  const config = await readJson(configSource === "config.local.json" ? configLocalPath : configExamplePath, {});
  return {
    app: path.basename(path.resolve(appDir, "..")),
    demo,
    onboarding,
    locked: await exists(lockPath),
    files: {
      batch: batchPath,
      decisions: decisionsPath,
      onboarding: onboardingPath,
      config: configSource,
    },
    config_summary: {
      source: configSource,
      brand: (config as any).brand?.name || "not configured",
      provider: (config as any).provider?.type || "local",
      channels: (config as any).channels || [],
    },
  };
}
