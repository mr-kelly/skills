import { createProvider } from "./index.js";
export { findItem, normalizeItem } from "./provider-utils.js";

export async function ensureDirs() {
  // Busabase owns all durable state; no handoff directories are created.
}

export async function loadBatch() {
  return createProvider().getBatch();
}

export async function loadBatchPage(options = {}) {
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

export async function saveBatch(batch) {
  return createProvider().saveBatch(batch);
}

export async function writeDecisions(batch) {
  return createProvider().writeDecisions(batch);
}
