import { createProvider } from "../../lib/data-provider/index.ts";
import { rejectIfProviderUnavailable } from "./provider-status.ts";
import type { DecisionRequestBody } from "./types.ts";

let writeQueue: Promise<unknown> = Promise.resolve();

function withWriteQueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => {});
  return next;
}

export async function updateItems(body: DecisionRequestBody) {
  return withWriteQueue(async () => {
    await rejectIfProviderUnavailable();
    return createProvider().updateItems(body);
  });
}

export async function updateDetail(body: DecisionRequestBody) {
  return withWriteQueue(async () => {
    await rejectIfProviderUnavailable();
    return createProvider().updateDetail(body);
  });
}
