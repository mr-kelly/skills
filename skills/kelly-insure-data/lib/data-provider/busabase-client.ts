import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Config } from "../types.ts";

export interface BusabaseClientOptions {
  envPrefix: string;
  config?: Config;
}

export interface BusabaseClientMeta {
  baseUrl: string;
  spaceId: string;
  driveNodeId: string;
  driveNodeSlug: string;
  featuredBaseId: string;
  featuredBaseSlug: string;
  noticesBaseId: string;
  noticesBaseSlug: string;
  /** Legacy aliases for the notices Base. */
  newsBaseId: string;
  newsBaseSlug: string;
  qaBaseId: string;
  qaBaseSlug: string;
  feedbackBaseId: string;
  feedbackBaseSlug: string;
  recordLimit: number;
  apiKey: string;
}

type AnyRecord = Record<string, any>;

function cleanUrl(value: unknown) {
  return String(value || "").replace(/\/$/, "");
}

function configValue(config: Config | undefined, key: string) {
  const busa = config?.busabase || {};
  return busa[key];
}

function envValue(envPrefix: string, name: string) {
  return process.env[`${envPrefix}_${name}`] || "";
}

function parseLimit(value: unknown) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 200;
}

function sha256(buffer: Buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export function busabaseMeta({ envPrefix, config = {} }: BusabaseClientOptions): BusabaseClientMeta {
  const env = (name: string) => envValue(envPrefix, name);
  const apiKeyEnv = String(configValue(config, "api_key_env") || `${envPrefix}_BUSABASE_API_KEY`);
  const noticesBaseId = String(
    env("BUSABASE_NOTICES_BASE_ID") ||
      configValue(config, "notices_base_id") ||
      env("BUSABASE_NEWS_BASE_ID") ||
      configValue(config, "news_base_id") ||
      "",
  );
  const noticesBaseSlug = String(
    configValue(config, "notices_base_slug") || configValue(config, "news_base_slug") || "insurance-news",
  );
  return {
    baseUrl: cleanUrl(env("BUSABASE_URL") || configValue(config, "base_url") || process.env.BUSABASE_BASE_URL || ""),
    spaceId: String(env("BUSABASE_SPACE_ID") || configValue(config, "space_id") || process.env.BUSABASE_SPACE_ID || ""),
    driveNodeId: String(env("BUSABASE_DRIVE_NODE_ID") || configValue(config, "drive_node_id") || ""),
    driveNodeSlug: String(configValue(config, "drive_node_slug") || "hk-insurance-drive"),
    featuredBaseId: String(env("BUSABASE_FEATURED_BASE_ID") || configValue(config, "featured_base_id") || ""),
    featuredBaseSlug: String(configValue(config, "featured_base_slug") || "featured-information"),
    noticesBaseId,
    noticesBaseSlug,
    newsBaseId: noticesBaseId,
    newsBaseSlug: noticesBaseSlug,
    qaBaseId: String(env("BUSABASE_QA_BASE_ID") || configValue(config, "qa_base_id") || ""),
    qaBaseSlug: String(configValue(config, "qa_base_slug") || "insurance-qa"),
    feedbackBaseId: String(env("BUSABASE_FEEDBACK_BASE_ID") || configValue(config, "feedback_base_id") || ""),
    feedbackBaseSlug: String(configValue(config, "feedback_base_slug") || "user-feedback"),
    recordLimit: parseLimit(env("BUSABASE_RECORD_LIMIT") || configValue(config, "record_limit")),
    apiKey: process.env[apiKeyEnv] || env("BUSABASE_API_KEY") || process.env.BUSABASE_API_KEY || "",
  };
}

export function createBusabaseClient(options: BusabaseClientOptions) {
  const meta = busabaseMeta(options);

  function requireConfig() {
    if (!meta.baseUrl) throw new Error("Kelly Insure Data Busabase provider needs base_url.");
  }

  async function api(method: string, pathname: string, body?: unknown): Promise<any> {
    requireConfig();
    const res = await fetch(`${meta.baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(meta.apiKey ? { authorization: `Bearer ${meta.apiKey}` } : {}),
        ...(meta.spaceId ? { "x-busabase-space": meta.spaceId } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function listBases(): Promise<AnyRecord[]> {
    const bases = await api("GET", "/api/v1/bases");
    return Array.isArray(bases) ? bases : [];
  }

  async function listNodes(): Promise<AnyRecord[]> {
    const nodes = await api("GET", "/api/v1/nodes");
    return Array.isArray(nodes) ? nodes : [];
  }

  async function resolveBase(id = "", slug = "") {
    if (!id && !slug) return null;
    const bases = await listBases();
    return bases.find((base) => base.id === id || base.slug === slug) || null;
  }

  async function resolveDrive(id = "", slug = "") {
    if (id) {
      try {
        return await api("GET", `/api/v1/drives/${encodeURIComponent(id)}`);
      } catch {
        // Fall through to node-tree resolution for renamed or older Drive nodes.
      }
    }
    const nodes = await api("GET", "/api/v1/nodes");
    const stack = Array.isArray(nodes) ? [...nodes] : [];
    while (stack.length) {
      const node = stack.shift();
      if (node?.type === "drive" && (!slug || node.slug === slug || node.name === slug)) {
        return api("GET", `/api/v1/drives/${encodeURIComponent(node.id)}`).catch(() => ({ node, files: [] }));
      }
      if (Array.isArray(node?.children)) stack.push(...node.children);
    }
    return null;
  }

  async function listDriveFiles(nodeId: string): Promise<AnyRecord[]> {
    const files = await api("GET", `/api/v1/drives/${encodeURIComponent(nodeId)}/files`);
    return Array.isArray(files) ? files : [];
  }

  async function getDrive(nodeId: string) {
    return api("GET", `/api/v1/drives/${encodeURIComponent(nodeId)}`);
  }

  async function getAsset(assetId: string) {
    return api("GET", `/api/v1/assets/${encodeURIComponent(assetId)}`);
  }

  async function getAssetTextLines(assetId: string) {
    return api("GET", `/api/v1/assets/${encodeURIComponent(assetId)}/text/lines`);
  }

  async function updateAssetText(assetId: string, text: string) {
    return api("PUT", `/api/v1/assets/${encodeURIComponent(assetId)}/text`, { text });
  }

  async function updateAssetMetadata(assetId: string, metadata: AnyRecord, mode: "merge" | "replace" = "merge") {
    return api("PATCH", `/api/v1/assets/${encodeURIComponent(assetId)}/metadata`, { metadata, mode });
  }

  async function listRecords(baseId: string, limit = meta.recordLimit): Promise<AnyRecord[]> {
    const records: AnyRecord[] = [];
    let cursor = "";
    while (records.length < limit) {
      const pageLimit = Math.min(100, limit - records.length);
      const query = new URLSearchParams({ baseId, limit: String(pageLimit) });
      if (cursor) query.set("cursor", cursor);
      const page = await api("GET", `/api/v1/records/paged?${query.toString()}`);
      const pageRecords = Array.isArray(page) ? page : Array.isArray(page?.records) ? page.records : [];
      records.push(...pageRecords.filter((record: AnyRecord) => record.baseId === baseId));
      cursor = String(page?.nextCursor || "");
      if (!cursor || pageRecords.length === 0) break;
    }
    return records.slice(0, limit);
  }

  async function createNodeChangeRequest(operations: AnyRecord[], message: string) {
    return api("POST", "/api/v1/nodes/change-requests", {
      operations,
      message,
      submittedBy: "kelly-insure-data",
      autoMerge: true,
    });
  }

  async function createBase(payload: AnyRecord) {
    return api("POST", "/api/v1/bases", payload);
  }

  async function createDriveChangeRequest(nodeId: string, operations: AnyRecord[], message: string) {
    return api("POST", `/api/v1/drives/${encodeURIComponent(nodeId)}/change-requests`, {
      operations,
      message,
      submittedBy: "kelly-insure-data",
    });
  }

  async function bulkRecordChangeRequest(baseId: string, records: AnyRecord[], message: string) {
    return api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/records/bulk-change-request`, {
      records,
      message,
      submittedBy: "kelly-insure-data",
    });
  }

  async function approveAndMerge(changeRequestId: string) {
    await api("POST", `/api/v1/change-requests/${encodeURIComponent(changeRequestId)}/reviews`, {
      verdict: "approved",
      reason: "Kelly Insure Data Busabase operation requested with --apply.",
    });
    return api("POST", `/api/v1/change-requests/${encodeURIComponent(changeRequestId)}/merge`);
  }

  async function uploadAsset(localFile: string, mimeType: string, metadata: AnyRecord = {}) {
    const bytes = await fs.readFile(localFile);
    const fileName = path.basename(localFile);
    const sizeBytes = bytes.length;
    const contentHash = sha256(bytes);
    const upload = await api("POST", "/api/v1/assets/upload-urls", {
      fileName,
      mimeType,
      sizeBytes,
      spaceId: meta.spaceId || undefined,
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
    const confirmation = await api("POST", "/api/v1/assets/confirmations", {
      storageKey: upload.storageKey,
      fileName,
      mimeType,
      sizeBytes,
      spaceId: meta.spaceId || undefined,
      context: "kelly-insure-data/restore",
      metadata,
      contentHash,
    });
    return { assetId: confirmation.assetId, contentHash };
  }

  return {
    meta,
    api,
    listNodes,
    listBases,
    resolveBase,
    resolveDrive,
    listDriveFiles,
    getDrive,
    getAsset,
    getAssetTextLines,
    updateAssetText,
    updateAssetMetadata,
    listRecords,
    createNodeChangeRequest,
    createBase,
    createDriveChangeRequest,
    bulkRecordChangeRequest,
    approveAndMerge,
    uploadAsset,
    async verifyConnection() {
      const auth = await api("GET", "/api/v1/auth").catch(() => null);
      return {
        ok: true,
        base_url: meta.baseUrl,
        space_id: meta.spaceId || auth?.space?.id || "",
        drive_node_id: meta.driveNodeId,
        drive_node_slug: meta.driveNodeSlug,
        featured_base_id: meta.featuredBaseId,
        featured_base_slug: meta.featuredBaseSlug,
        notices_base_id: meta.noticesBaseId,
        notices_base_slug: meta.noticesBaseSlug,
        news_base_id: meta.noticesBaseId,
        news_base_slug: meta.noticesBaseSlug,
        qa_base_id: meta.qaBaseId,
        qa_base_slug: meta.qaBaseSlug,
        feedback_base_id: meta.feedbackBaseId,
        feedback_base_slug: meta.feedbackBaseSlug,
        api_key: meta.apiKey ? "configured" : "none",
      };
    },
  };
}
