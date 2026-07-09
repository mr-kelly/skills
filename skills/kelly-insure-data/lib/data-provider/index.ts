import { readConfig } from "../config.ts";
import type { Config } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { assertProvider } from "./provider-interface.ts";

export type { DataProvider } from "./provider-interface.ts";

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_INSURE_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider() {
  const configResult = await readConfig();
  const kind = resolveProviderKind(configResult.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(configResult));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(configResult));
  throw new Error(`Unknown KELLY_INSURE_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
