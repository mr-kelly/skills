import { createProvider } from "../lib/data-provider/index.ts";
export { findItem, normalizeItem } from "../lib/data-provider/provider-utils.ts";
import type { BatchPage } from "../lib/data-provider/provider-interface.ts";
import type { Batch } from "./types.ts";

export async function ensureDirs() {
  // Busabase owns all durable state; no handoff directories are created.
}

export async function loadBatch(): Promise<Batch> {
  return createProvider().getBatch();
}

export async function loadBatchPage(options: { cursor?: string; batchId?: string } = {}): Promise<BatchPage> {
  const provider = createProvider();
  if (provider.getBatchPage) return provider.getBatchPage(options);
  const batch = await provider.getBatch();
  return {
    batch,
    batchId: String(batch.batch_id || ""),
    nextCursor: null,
    total: batch.items?.length || 0,
  };
}

export async function saveBatch(batch: Batch) {
  return createProvider().saveBatch(batch);
}

export async function writeDecisions(batch: Batch) {
  return createProvider().writeDecisions(batch);
}
