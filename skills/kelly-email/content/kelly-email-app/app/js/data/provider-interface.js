export const CORE_METHODS = [
  "loadDotenv",
  "loadConfigWithMeta",
  "loadConfig",
  "onboardingStatus",
  "getBatch",
  "saveBatch",
  "getDecisions",
  "writeDecisions",
  "updateItems",
  "updateDetail",
  "getLock",
  "rejectIfLocked",
  "writeLock",
  "clearLock",
];

export const OPTIONAL_METHODS = [
  "writeExecutionReport",
  "getBatchPage",
  "writeScanState",
  "persistAttachments",
  "clearBatchAttachments",
  "getFile",
  "putFile",
  "getSecret",
  "init",
  "checkSchema",
  "ensureSchema",
  "verifyConnection",
  "providerStatus",
];

export function assertProvider(kind, provider) {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${kind}" is not an object.`);
  }
  const candidate = provider;
  const problems = [];
  if (typeof candidate.kind !== "string" || !candidate.kind) problems.push("kind (string)");
  for (const method of CORE_METHODS) {
    if (typeof candidate[method] !== "function") problems.push(`${method}()`);
  }
  for (const method of OPTIONAL_METHODS) {
    if (method in candidate && typeof candidate[method] !== "function") {
      problems.push(`${method}() [optional, must be a function if present]`);
    }
  }
  if (problems.length) {
    throw new Error(
      `Data provider "${kind}" does not satisfy EmailDataProvider - missing/invalid: ${problems.join(", ")}.`,
    );
  }
  return provider;
}
