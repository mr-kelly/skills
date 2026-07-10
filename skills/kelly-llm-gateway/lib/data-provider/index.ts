import { localFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

const providers: Record<string, DataProvider> = { local: localFileProvider };
const validated = new Map<string, DataProvider>();

/**
 * Resolve the active data provider from `KELLY_LLM_GATEWAY_DATA_PROVIDER`
 * (default `local`). Reserved future names: `postgres`, `aitable`, `notion`,
 * `busabase`.
 */
export function getProvider(): DataProvider {
  const selected = process.env.KELLY_LLM_GATEWAY_DATA_PROVIDER || "local";
  const cached = validated.get(selected);
  if (cached) return cached;
  const provider = providers[selected];
  if (!provider) throw new Error(`Unknown data provider "${selected}".`);
  const conformed = assertProvider(selected, provider);
  validated.set(selected, conformed);
  return conformed;
}

export type { DataProvider };
