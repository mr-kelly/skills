import fs from "node:fs/promises";
import path from "node:path";
import { readJson } from "../common.ts";
import { skillDir } from "../paths.ts";
import type { Config, ProviderMeta } from "../types.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

function configCandidates(): string[] {
  return [
    process.env.KELLY_INVOICE_SHEET_CONFIG,
    path.join(skillDir, "config.local.json"),
    path.join(process.env.HOME || "", ".config", "kelly-invoice-sheet", "config.json"),
    path.join(skillDir, "config.example.json"),
  ].filter(Boolean) as string[];
}

async function loadConfig(): Promise<ProviderMeta> {
  for (const candidate of configCandidates()) {
    try {
      const config = JSON.parse(await fs.readFile(candidate, "utf8")) as Config;
      return { config, source: candidate, is_example: candidate.endsWith("config.example.json") };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { config: await readJson(path.join(skillDir, "config.example.json"), {}), source: null, is_example: true };
}

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_INVOICE_SHEET_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<DataProvider> {
  const meta = await loadConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider(kind, createLocalFileProvider(meta));
  throw new Error(`Unknown KELLY_INVOICE_SHEET_DATA_PROVIDER: "${kind}" (expected "local")`);
}
