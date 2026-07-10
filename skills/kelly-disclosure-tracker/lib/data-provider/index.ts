import { LocalFileProvider } from "./local-file-provider.ts";
import { assertProvider } from "./provider-interface.ts";
import type { DataProvider } from "./provider-interface.ts";

// Provider selector. Reserve "postgres" | "aitable" | "notion" | "busabase" for
// future cloud-backed implementations; only "local" exists today.
export function getProvider(
  name: string = process.env.KELLY_DISCLOSURE_TRACKER_DATA_PROVIDER || "local",
): DataProvider {
  const provider: DataProvider = name === "local" ? new LocalFileProvider() : new LocalFileProvider();
  assertProvider(provider.name, provider);
  return provider;
}

export type { DataProvider };
