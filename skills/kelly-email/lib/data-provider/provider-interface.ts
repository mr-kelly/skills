import type { Batch, Config, ConfigWithMeta, DecisionsPayload, Onboarding } from "../types.ts";

export interface DetailInput {
  id?: string;
  draft?: string;
  suggested_reply?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface DecisionInput {
  ids?: string[];
  id?: string;
  action?: string;
  comment?: string;
  draft?: string;
  suggested_reply?: string;
  [key: string]: unknown;
}

export interface AttachmentInput {
  filename?: string;
  contentType?: string;
  content_type?: string;
  contentId?: string;
  content_id?: string;
  size?: number;
  content?: Buffer;
  [key: string]: unknown;
}

export interface AttachmentResult {
  html: string;
  attachments: AttachmentInput[];
}

export interface LockPayload {
  locked?: boolean;
  owner?: string;
  message?: string;
  started_at?: string;
  path?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface EmailDataProvider {
  readonly kind: string;

  loadDotenv(): Promise<string[]>;
  loadConfigWithMeta(): Promise<ConfigWithMeta>;
  loadConfig(): Promise<Config>;
  onboardingStatus(config: Config, meta?: ConfigWithMeta): Onboarding;

  getBatch(): Promise<Batch>;
  saveBatch(batch: Batch): Promise<Batch>;
  getDecisions(): Promise<DecisionsPayload>;
  writeDecisions(batch: Batch): Promise<DecisionsPayload>;
  updateItems(input: DecisionInput): Promise<Record<string, unknown>>;
  updateDetail(input: DetailInput): Promise<Record<string, unknown>>;

  getLock(): Promise<LockPayload>;
  rejectIfLocked(): Promise<void>;
  writeLock(message: string): Promise<void>;
  clearLock(): Promise<void>;

  writeExecutionReport?(batch: Batch, report: Record<string, unknown>, stamp?: string): Promise<Record<string, unknown>>;
  persistAttachments?(
    batchId: string,
    itemId: string,
    htmlBody: string,
    attachments: AttachmentInput[],
  ): Promise<AttachmentResult>;
  clearBatchAttachments?(batchId: string): Promise<void>;
  getFile?(pathname: string): Promise<Record<string, unknown> | null>;
  checkSchema?(): Promise<Record<string, unknown>>;
  ensureSchema?(options?: { apply?: boolean }): Promise<Record<string, unknown>>;
  verifyConnection?(): Promise<Record<string, unknown>>;
}

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
] as const satisfies readonly (keyof EmailDataProvider)[];

export const OPTIONAL_METHODS = [
  "writeExecutionReport",
  "persistAttachments",
  "clearBatchAttachments",
  "getFile",
  "checkSchema",
  "ensureSchema",
  "verifyConnection",
] as const satisfies readonly (keyof EmailDataProvider)[];

export function assertProvider(kind: string, provider: unknown): EmailDataProvider {
  if (!provider || (typeof provider !== "object" && typeof provider !== "function")) {
    throw new Error(`Data provider "${kind}" is not an object.`);
  }
  const candidate = provider as Record<string, unknown>;
  const problems: string[] = [];
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
    throw new Error(`Data provider "${kind}" does not satisfy EmailDataProvider - missing/invalid: ${problems.join(", ")}.`);
  }
  return provider as EmailDataProvider;
}
