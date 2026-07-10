import { LocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

// Env selector: KELLY_LEAD_FUNNEL_DATA_PROVIDER=local (default). Reserve
// "postgres" | "aitable" | "notion" | "busabase" for future providers — the
// app and scripts only ever depend on the DataProvider interface above.
let cached: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (cached) return cached;
  const name = process.env.KELLY_LEAD_FUNNEL_DATA_PROVIDER || "local";
  const provider = name === "local" ? new LocalFileProvider() : new LocalFileProvider();
  assertProvider(provider.name, provider);
  cached = provider;
  return provider;
}

export type { DataProvider };
