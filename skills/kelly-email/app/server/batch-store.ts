import { createProvider } from "../../lib/data-provider/index.ts";
export { findItem, normalizeItem } from "../../lib/data-provider/provider-utils.ts";
import type { Batch } from "./types.ts";

export async function ensureDirs() {
  // Local mode creates directories lazily; Busabase mode has no local handoff dirs
  // to create. Kept for server bootstrap compatibility.
}

export async function loadBatch(): Promise<Batch> {
  return createProvider().getBatch();
}

export async function saveBatch(batch: Batch) {
  return createProvider().saveBatch(batch);
}

export async function writeDecisions(batch: Batch) {
  return createProvider().writeDecisions(batch);
}
