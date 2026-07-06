// Data-provider selector for kelly-seo.
//
// kelly-seo is an App-in-Skill that pairs a read-only Google Search Console
// analytics snapshot with an SEO-opportunity approval queue. The queue maps onto
// Busabase's review model (record + change_request + operation + review + merge),
// so the same UI and scripts run against either backend:
//
//   KELLY_SEO_DATA_PROVIDER=local     (default) JSON files in app/.data/
//   KELLY_SEO_DATA_PROVIDER=busabase  HTTP client to a Busabase base
//
// Both implement the same SeoDataProvider interface (see provider-interface.ts).

import { readConfig, resolveProviderKind } from "../common.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type SeoDataProvider, assertProvider } from "./provider-interface.ts";

// Opportunity workflow statuses shared across providers. Busabase maps its
// change-request status onto these so the UI renders identically in either mode.
export const WORKFLOW_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

export const DECISION_ACTIONS = ["approve", "request_changes", "revise", "block"];

export async function createProvider(): Promise<SeoDataProvider> {
  const meta = await readConfig();
  const kind = resolveProviderKind(meta.config);
  if (kind === "local") return assertProvider("local", createLocalFileProvider(meta));
  if (kind === "busabase") return assertProvider("busabase", createBusabaseProvider(meta));
  throw new Error(`Unknown KELLY_SEO_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
}
