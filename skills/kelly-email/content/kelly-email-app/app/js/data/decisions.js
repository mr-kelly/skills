import { createProvider } from "./index.js";
import { rejectIfProviderUnavailable } from "./provider-status.js";

/** @type {Promise<unknown>} */
let writeQueue = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
function withWriteQueue(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => {});
  return next;
}

export async function updateItems(body) {
  return withWriteQueue(async () => {
    await rejectIfProviderUnavailable();
    return createProvider().updateItems(body);
  });
}

export async function updateDetail(body) {
  return withWriteQueue(async () => {
    await rejectIfProviderUnavailable();
    return createProvider().updateDetail(body);
  });
}
