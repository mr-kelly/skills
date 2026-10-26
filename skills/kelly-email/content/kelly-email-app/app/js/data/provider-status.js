import { createProvider } from "./index.js";

export async function providerStatus() {
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
