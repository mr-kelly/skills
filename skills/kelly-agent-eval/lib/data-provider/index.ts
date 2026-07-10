import { localFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

const providers: Record<string, DataProvider> = {
  local: localFileProvider,
  // Reserved for future backends: postgres, aitable, notion, busabase.
};

const validated = new Map<string, DataProvider>();

export function getProvider(): DataProvider {
  const selected = process.env.KELLY_AGENT_EVAL_DATA_PROVIDER || "local";
  const cached = validated.get(selected);
  if (cached) return cached;
  const provider = providers[selected];
  if (!provider) throw new Error(`Unknown data provider "${selected}".`);
  const conformed = assertProvider(selected, provider);
  validated.set(selected, conformed);
  return conformed;
}

export type { DataProvider, ReleaseInput, ReviewInput } from "./provider-interface.ts";
