import { LocalFileProvider } from "./local-file-provider.ts";
import { assertProvider } from "./provider-interface.ts";
import type { DataProvider } from "./provider-interface.ts";

// Reserved provider names for future backends. Only "local" is implemented —
// selecting any other name fails loud instead of silently falling back.
const RESERVED = new Set(["postgres", "aitable", "notion", "busabase"]);

let cached: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (cached) return cached;
  const selected = process.env.KELLY_AGENT_BUILDER_DATA_PROVIDER || "local";
  if (selected !== "local" && RESERVED.has(selected)) {
    throw new Error(`data provider "${selected}" is reserved but not yet implemented`);
  }
  cached = assertProvider("local", new LocalFileProvider());
  return cached;
}

export type { DataProvider } from "./provider-interface.ts";
