import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface BusabaseEnv {
  baseUrl: string;
  apiKey: string;
  spaceId: string;
}

export type JsonRecord = Record<string, any>;

export function readBusabaseEnv(): BusabaseEnv {
  const baseUrl = String(process.env.KELLY_INSURE_DATA_BUSABASE_URL || process.env.BUSABASE_BASE_URL || "").replace(
    /\/$/,
    "",
  );
  const apiKey = String(
    process.env.KELLY_INSURE_DATA_BUSABASE_API_KEY ||
      process.env.BUSABASE_API_KEY ||
      process.env.KELLY_INSURE_DATA_API_KEY ||
      "",
  );
  const spaceId = String(process.env.KELLY_INSURE_DATA_BUSABASE_SPACE_ID || process.env.BUSABASE_SPACE_ID || "");
  if (!baseUrl) throw new Error("Missing KELLY_INSURE_DATA_BUSABASE_URL or BUSABASE_BASE_URL.");
  if (!apiKey) throw new Error("Missing KELLY_INSURE_DATA_BUSABASE_API_KEY or BUSABASE_API_KEY.");
  return { baseUrl, apiKey, spaceId };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const flags: JsonRecord = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}

export async function readJson<T = JsonRecord>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

export async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    return String(record["zh-CN"] || record["zh-TW"] || record.zh || record.en || "");
  }
  return "";
}

export function fieldsOf(record: JsonRecord): JsonRecord {
  return record?.headCommit?.fields || record?.fields || record?.commit?.fields || {};
}

export function sha256(buffer: Buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export class BusabaseRestoreClient {
  readonly env: BusabaseEnv;

  constructor(env = readBusabaseEnv()) {
    this.env = env;
  }

  async api(method: string, pathname: string, body?: unknown): Promise<any> {
    const response = await fetch(`${this.env.baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.env.apiKey}`,
        ...(this.env.spaceId ? { "x-busabase-space": this.env.spaceId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${response.status} ${detail}`.trim());
    }
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }

  async listNodes() {
    return this.api("GET", "/api/v1/nodes");
  }

  async listBases() {
    const bases = await this.api("GET", "/api/v1/bases");
    return Array.isArray(bases) ? bases : [];
  }

  async listDriveFiles(nodeId: string) {
    const files = await this.api("GET", `/api/v1/drives/${encodeURIComponent(nodeId)}/files`);
    return Array.isArray(files) ? files : [];
  }

  async getDrive(nodeId: string) {
    return this.api("GET", `/api/v1/drives/${encodeURIComponent(nodeId)}`);
  }

  async getAsset(assetId: string) {
    return this.api("GET", `/api/v1/assets/${encodeURIComponent(assetId)}`);
  }

  async recordsForBase(baseId: string, limit = 1000) {
    const records: JsonRecord[] = [];
    let cursor = "";
    while (records.length < limit) {
      const query = new URLSearchParams({ baseId, limit: String(Math.min(100, limit - records.length)) });
      if (cursor) query.set("cursor", cursor);
      const page = await this.api("GET", `/api/v1/records/paged?${query.toString()}`);
      const pageRecords = Array.isArray(page) ? page : Array.isArray(page?.records) ? page.records : [];
      records.push(...pageRecords.filter((record: JsonRecord) => record.baseId === baseId));
      cursor = String(page?.nextCursor || "");
      if (!cursor || pageRecords.length === 0) break;
    }
    return records;
  }

  async createNodeChangeRequest(operations: JsonRecord[], message: string) {
    return this.api("POST", "/api/v1/nodes/change-requests", {
      operations,
      message,
      submittedBy: "kelly-insure-data",
      autoMerge: true,
    });
  }

  async createBase(payload: JsonRecord) {
    return this.api("POST", "/api/v1/bases", payload);
  }

  async createDriveChangeRequest(nodeId: string, operations: JsonRecord[], message: string) {
    return this.api("POST", `/api/v1/drives/${encodeURIComponent(nodeId)}/change-requests`, {
      operations,
      message,
      submittedBy: "kelly-insure-data",
    });
  }

  async bulkRecordChangeRequest(baseId: string, records: JsonRecord[], message: string) {
    return this.api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/records/bulk-change-request`, {
      records,
      message,
      submittedBy: "kelly-insure-data",
    });
  }

  async approveAndMerge(changeRequestId: string) {
    await this.api("POST", `/api/v1/change-requests/${encodeURIComponent(changeRequestId)}/reviews`, {
      verdict: "approved",
      reason: "Kelly Insure Data restore requested with --apply.",
    });
    return this.api("POST", `/api/v1/change-requests/${encodeURIComponent(changeRequestId)}/merge`);
  }

  async uploadAsset(localFile: string, mimeType: string, metadata: JsonRecord = {}) {
    const bytes = await fs.readFile(localFile);
    const fileName = path.basename(localFile);
    const sizeBytes = bytes.length;
    const contentHash = sha256(bytes);
    const upload = await this.api("POST", "/api/v1/assets/upload-urls", {
      fileName,
      mimeType,
      sizeBytes,
      spaceId: this.env.spaceId || undefined,
      context: "kelly-insure-data/restore",
      contentHash,
    });
    if (upload.assetId) return { assetId: upload.assetId, contentHash };
    const put = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "content-type": mimeType },
      body: bytes,
    });
    if (!put.ok) throw new Error(`asset upload PUT -> ${put.status} ${await put.text().catch(() => "")}`.trim());
    const confirmation = await this.api("POST", "/api/v1/assets/confirmations", {
      storageKey: upload.storageKey,
      fileName,
      mimeType,
      sizeBytes,
      spaceId: this.env.spaceId || undefined,
      context: "kelly-insure-data/restore",
      metadata,
      contentHash,
    });
    return { assetId: confirmation.assetId, contentHash };
  }
}
