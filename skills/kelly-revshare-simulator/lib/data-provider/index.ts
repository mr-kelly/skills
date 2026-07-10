import { ENV_PREFIX } from "../paths.ts";
import { LocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

// Reserved names for future providers along the Data Provider Spectrum:
// postgres, aitable, notion, busabase. Only `local` is implemented today.
let cached: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (cached) return cached;
  const name = process.env[`${ENV_PREFIX}_DATA_PROVIDER`] || "local";
  let provider: DataProvider;
  switch (name) {
    case "local":
      provider = new LocalFileProvider();
      break;
    default:
      // Fall back to local but surface the intent clearly; unimplemented
      // providers must not fail silently.
      console.warn(`Unknown data provider "${name}", falling back to local`);
      provider = new LocalFileProvider();
  }
  assertProvider(provider.name, provider);
  cached = provider;
  return provider;
}

export type { DataProvider } from "./provider-interface.ts";
