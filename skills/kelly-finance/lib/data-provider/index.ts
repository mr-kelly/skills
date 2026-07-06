import { localFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

const providers: Record<string, DataProvider> = {
  local: localFileProvider,
};

export async function createProvider(): Promise<DataProvider> {
  const selected = process.env.KELLY_FINANCE_DATA_PROVIDER || "local";
  const provider = providers[selected];
  if (!provider) throw new Error(`Unknown Kelly Finance data provider "${selected}".`);
  await provider.ensureReady();
  return assertProvider(selected, provider);
}
