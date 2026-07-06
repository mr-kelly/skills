// Data-provider selector for kelly-pr-review.
//
// kelly-pr-review is an App-in-Skill whose unit of work — a GitHub pull request
// moving through a local review queue plus a merged-PR test verification — maps
// onto Busabase's review model. This module lets the same Hono app and batch
// scripts run against either backend:
//
//   KELLY_PR_REVIEW_DATA_PROVIDER=local     (default) JSON files in app/.cache/
//   KELLY_PR_REVIEW_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same ReviewProvider interface (see provider-interface.ts).
// The provider kind is echoed into /api/state via config_summary.reader, so the
// UI shows which backend is live.
//
// KELLY_PR_REVIEW_DATA_READER is accepted as a back-compat alias for the env
// name, and config.data_provider (falling back to the legacy config.data_reader)
// is honored when the env var is unset.

import { loadConfigWithMeta } from "../data-reader/index.ts";
import type { ProviderMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type ReviewProvider, assertProvider } from "./provider-interface.ts";

export function resolveProviderKind(config: Record<string, unknown> = {}) {
  return String(
    process.env.KELLY_PR_REVIEW_DATA_PROVIDER ||
      process.env.KELLY_PR_REVIEW_DATA_READER ||
      config.data_provider ||
      config.data_reader ||
      "local",
  ).toLowerCase();
}

export async function createProvider(): Promise<ReviewProvider> {
  const meta = (await loadConfigWithMeta()) as ProviderMeta;
  const kind = resolveProviderKind(meta.config || {});
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_PR_REVIEW_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
