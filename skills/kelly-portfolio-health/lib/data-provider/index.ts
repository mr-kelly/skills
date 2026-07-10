import { LocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

// Provider selector. KELLY_PORTFOLIO_HEALTH_DATA_PROVIDER=local (default).
// Reserve postgres / aitable / notion / busabase for future implementations —
// see app-in-skill-creator's Data Provider Spectrum.
let cached: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (cached) return cached;
  const name = process.env.KELLY_PORTFOLIO_HEALTH_DATA_PROVIDER || "local";
  const provider: Partial<DataProvider> = name === "local" ? new LocalFileProvider() : new LocalFileProvider();
  assertProvider(name, provider);
  cached = provider;
  return provider;
}

export type { DataProvider } from "./provider-interface.ts";
