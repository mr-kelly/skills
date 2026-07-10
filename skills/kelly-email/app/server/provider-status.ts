import { createProvider } from "../../lib/data-provider/index.ts";
import type { ProviderStatus } from "../../lib/data-provider/provider-interface.ts";

export async function providerStatus(): Promise<ProviderStatus> {
  const provider = createProvider();
  if (provider.providerStatus) return provider.providerStatus();
  return {
    ok: true,
    provider: provider.kind,
    mode: provider.kind,
    message: `Kelly Email is using ${provider.kind} storage.`,
  };
}

export async function rejectIfProviderUnavailable() {
  const status = await providerStatus();
  if (!status.ok) {
    throw new Error(status.message || "Kelly Email data provider is not ready.");
  }
}
