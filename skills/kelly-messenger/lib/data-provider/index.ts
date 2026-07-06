// Data-provider selector for kelly-messenger.
//
// kelly-messenger is an App-in-Skill whose unit of work — a unified message
// inbox plus an approval-gated outbox — maps onto Busabase's review model
// (record + change_request + operation + review + merge). This module lets the
// same Hono server and the same scripts run against either backend:
//
//   KELLY_MESSENGER_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_MESSENGER_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same MessengerProvider interface (see provider-interface.ts).

import type { Config } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { readConfig } from "./common.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type MessengerProvider, assertProvider } from "./provider-interface.ts";

export function resolveProviderKind(config: Config = {}): string {
  return String(process.env.KELLY_MESSENGER_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export async function createProvider(): Promise<MessengerProvider> {
  const { config, path, is_example } = await readConfig();
  const meta = { config, source: path || null, is_example };
  const kind = resolveProviderKind(config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_MESSENGER_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}

export type { MessengerProvider } from "./provider-interface.ts";
