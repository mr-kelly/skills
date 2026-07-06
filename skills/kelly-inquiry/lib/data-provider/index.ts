// Data-provider selector for kelly-inquiry.
//
// kelly-inquiry is an App-in-Skill sales desk: an inquiry snapshot plus an
// approval queue where a human approves agent-suggested replies and quotes. That
// review model maps onto Busabase (record + change_request + review + merge), so
// the same UI and scripts run against either backend:
//
//   KELLY_INQUIRY_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_INQUIRY_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same InquiryProvider interface; the selected one is
// validated with assertProvider() at registration so a non-conforming provider
// fails loudly here, not deep in a request.

import type { ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type InquiryProvider, assertProvider } from "./provider-interface.ts";
import { readConfig } from "./store-core.ts";

export function resolveProviderKind(config: { data_provider?: string } = {}): string {
  return String(process.env.KELLY_INQUIRY_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<InquiryProvider> {
  const configResult = await readConfig();
  const meta: ProviderMeta = { configResult };
  const kind = resolveProviderKind(configResult.config);
  let provider: InquiryProvider;
  if (kind === "local") provider = createLocalFileProvider(meta);
  else if (kind === "busabase") provider = createBusabaseProvider(meta);
  else throw new Error(`Unknown KELLY_INQUIRY_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
  return assertProvider(kind, provider);
}

export type { InquiryProvider };
