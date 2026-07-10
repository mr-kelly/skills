import { LocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

// Provider selector. Env: KELLY_BEHAVIOR_PREDICT_DATA_PROVIDER=local (default).
// Reserve "postgres", "aitable", "notion", "busabase" for later providers —
// this dashboard only ships "local" today.

let cached: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (cached) return cached;
  const name = process.env.KELLY_BEHAVIOR_PREDICT_DATA_PROVIDER || "local";
  const provider: DataProvider =
    name === "local"
      ? new LocalFileProvider()
      : (() => {
          throw new Error(`Unknown data provider "${name}". Only "local" is implemented.`);
        })();
  assertProvider(provider.name, provider);
  cached = provider;
  return provider;
}

export type { DataProvider } from "./provider-interface.ts";
