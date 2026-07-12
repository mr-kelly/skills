import { localFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

const providers: Record<string, DataProvider> = {
  local: localFileProvider,
};

const validated = new Map<string, DataProvider>();

export function getProvider(): DataProvider {
  const requested = process.env.KELLY_HOMEWORK_COACH_DATA_PROVIDER || "local";
  const selected = requested in providers ? requested : "local";
  const cached = validated.get(selected);
  if (cached) return cached;
  const provider = assertProvider(selected, providers[selected]);
  validated.set(selected, provider);
  return provider;
}
