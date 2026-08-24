// Trusted-process Busabase REST client for Kelly Insure Data's skill-root
// scripts (export/restore/backfill). Ported verbatim (types stripped) from
// the retired lib/data-provider/busabase-client.ts. busabase-sdk does not
// cover the Drive/Asset REST surface these operator scripts need
// (/api/v1/drives/*, /api/v1/assets/*, node/base/drive/record
// ChangeRequests), so this stays raw fetch — consistent with the
// already-correct original design — using the trusted operator's own
// BUSABASE_BASE_URL / BUSABASE_API_KEY / BUSABASE_SPACE_ID (optionally
// KELLY_INSURE_DATA_BUSABASE_*-prefixed), never the AirApp's ambient OAuth
// session.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function cleanUrl(value) {
  return String(value || "").replace(/\/$/, "");
}

function env(envPrefix, name) {
  return process.env[`${envPrefix}_${name}`] || "";
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export function busabaseMeta({ envPrefix = "KELLY_INSURE_DATA" } = {}) {
  const apiKeyEnv = `${envPrefix}_BUSABASE_API_KEY`;
  const noticesBaseId = String(
    env(envPrefix, "BUSABASE_NOTICES_BASE_ID") || env(envPrefix, "BUSABASE_NEWS_BASE_ID") || "",
  );
  const noticesBaseSlug = "kelly-insure-data-notices";
  return {
    baseUrl: cleanUrl(env(envPrefix, "BUSABASE_URL") || process.env.BUSABASE_BASE_URL || ""),
    spaceId: String(env(envPrefix, "BUSABASE_SPACE_ID") || process.env.BUSABASE_SPACE_ID || ""),
    driveNodeId: String(env(envPrefix, "BUSABASE_DRIVE_NODE_ID") || ""),
    driveNodeSlug: "kelly-insure-data-files",
    featuredBaseId: String(env(envPrefix, "BUSABASE_FEATURED_BASE_ID") || ""),
    featuredBaseSlug: "kelly-insure-data-featured",
    noticesBaseId,
    noticesBaseSlug,
    newsBaseId: noticesBaseId,
    newsBaseSlug: noticesBaseSlug,
    qaBaseId: String(env(envPrefix, "BUSABASE_QA_BASE_ID") || ""),
    qaBaseSlug: "kelly-insure-data-qa",
    feedbackBaseId: String(env(envPrefix, "BUSABASE_FEEDBACK_BASE_ID") || ""),
    feedbackBaseSlug: "kelly-insure-data-feedback",
    apiKey: process.env[apiKeyEnv] || process.env.BUSABASE_API_KEY || "",
  };
}

export function createBusabaseClient(options = {}) {
  const meta = busabaseMeta(options);

  function requireConfig() {
    if (!meta.baseUrl) throw new Error("Kelly Insure Data Busabase client needs BUSABASE_BASE_URL.");
  }

  async function api(method, pathname, body) {
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

  async function listBases() {
    const bases = await api("GET", "/api/v1/bases");
    return Array.isArray(bases) ? bases : [];
  }

  async function listNodes() {
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
        return await api("GET", `/api/v1/nodes/${encodeURIComponent(id)}`);
      } catch {
        // Fall through to node-tree resolution for renamed or older Drive nodes.
      }
    }
    const nodes = await api("GET", "/api/v1/nodes");
    const stack = Array.isArray(nodes) ? [...nodes] : [];
    while (stack.length) {
      const node = stack.shift();
      if (node?.type === "drive" && (!slug || node.slug === slug || node.name === slug)) {
        return api("GET", `/api/v1/nodes/${encodeURIComponent(node.id)}`).catch(() => ({ node, files: [] }));
      }
      if (Array.isArray(node?.children)) stack.push(...node.children);
    }
    return null;
  }

  // Verified live against a busabase@0.11.0 server: a Drive node's file
  // listing and its node metadata are both returned by GET /nodes/{id}
  // (`{ node, files, entryFile, visibility, version }`) — there is no
  // separate /drives/{id} or /drives/{id}/files endpoint, unlike what the
  // retired lib/data-provider/busabase-client.ts assumed.
  async function listDriveFiles(nodeId) {
    const detail = await api("GET", `/api/v1/nodes/${encodeURIComponent(nodeId)}`);
    return Array.isArray(detail?.files) ? detail.files : [];
  }

  async function getDrive(nodeId) {
    return api("GET", `/api/v1/nodes/${encodeURIComponent(nodeId)}`);
  }

  async function getAsset(assetId) {
    return api("GET", `/api/v1/assets/${encodeURIComponent(assetId)}`);
  }

  async function getAssetTextLines(assetId) {
    return api("GET", `/api/v1/assets/${encodeURIComponent(assetId)}/text/lines`);
  }

  async function updateAssetText(assetId, text) {
    return api("PUT", `/api/v1/assets/${encodeURIComponent(assetId)}/text`, { text });
  }

  async function updateAssetMetadata(assetId, metadata, mode = "merge") {
    return api("PATCH", `/api/v1/assets/${encodeURIComponent(assetId)}/metadata`, { metadata, mode });
  }

  // Verified against busabase-sdk's own recordContract.list route
  // definition (GET /records, keyset-paginated via baseId/limit/cursor) —
  // the retired lib/data-provider/busabase-client.ts called the
  // non-existent GET /records/paged.
  //
  // Page size is fixed at the API's own maximum and owned here, not by a
  // caller-supplied `limit`. The previous version used that `limit` as a
  // ceiling on total records collected (export_busabase_snapshot.mjs called
  // this with no limit, defaulting to 200), so any Base past the ceiling was
  // exported incomplete with no error. Follows `nextCursor` until the server
  // reports none left, with a guard against a repeating cursor.
  const RECORD_PAGE_SIZE = 100;

  async function listRecords(baseId) {
    const records = [];
    const seenCursors = new Set();
    let cursor = "";
    while (true) {
      const query = new URLSearchParams({ baseId, limit: String(RECORD_PAGE_SIZE) });
      if (cursor) query.set("cursor", cursor);
      const page = await api("GET", `/api/v1/records?${query.toString()}`);
      const pageRecords = Array.isArray(page) ? page : Array.isArray(page?.records) ? page.records : [];
      records.push(...pageRecords.filter((record) => record.baseId === baseId));
      cursor = String(page?.nextCursor || "");
      if (!cursor || pageRecords.length === 0) return records;
      if (seenCursors.has(cursor)) throw new Error(`PAGINATION_LOOP: ${baseId}`);
      seenCursors.add(cursor);
    }
  }

  async function createNodeChangeRequest(operations, message) {
    return api("POST", "/api/v1/nodes/change-requests", {
      operations,
      message,
      submittedBy: "kelly-insure-data",
      autoMerge: true,
    });
  }

  async function createBase(payload) {
    return api("POST", "/api/v1/bases", payload);
  }

  // Ported from lib/data-provider/busabase-client.ts as-is. Unlike the
  // Drive/record READ paths above, this write path could not be verified
  // live against a busabase@0.11.0 server within reasonable effort — both
  // /drives/{nodeId}/change-requests and /nodes/{nodeId}/change-requests
  // 404, and /nodes/change-requests's own "kind" is limited to
  // create/rename/delete/restore/move (no file-attach kind). Only
  // restore_busabase_snapshot.mjs's `--apply` file-restore step calls this;
  // always run it with `--dry-run` first and verify the printed plan against
  // the real target server's actual REST contract before trusting `--apply`
  // to re-upload missing Drive files.
  async function createDriveChangeRequest(nodeId, operations, message) {
    return api("POST", `/api/v1/drives/${encodeURIComponent(nodeId)}/change-requests`, {
      operations,
      message,
      submittedBy: "kelly-insure-data",
    });
  }

  async function bulkRecordChangeRequest(baseId, records, message) {
    return api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/records/bulk-change-request`, {
      records,
      message,
      submittedBy: "kelly-insure-data",
    });
  }

  // Verified against busabase-sdk's own changeRequests.review/merge route
  // definitions: both are batch endpoints keyed by `changeRequestIds`, not
  // per-id `/change-requests/{id}/reviews` or `/change-requests/{id}/merge`
  // as the retired lib/data-provider/busabase-client.ts assumed.
  async function approveAndMerge(changeRequestId) {
    await api("POST", "/api/v1/change-requests/reviews", {
      changeRequestIds: [changeRequestId],
      verdict: "approved",
      reason: "Kelly Insure Data Busabase operation requested with --apply.",
    });
    return api("POST", "/api/v1/change-requests/merge", { changeRequestIds: [changeRequestId] });
  }

  async function uploadAsset(localFile, mimeType, metadata = {}) {
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
        drive_node_slug: meta.driveNodeSlug,
        featured_base_slug: meta.featuredBaseSlug,
        notices_base_slug: meta.noticesBaseSlug,
        qa_base_slug: meta.qaBaseSlug,
        feedback_base_slug: meta.feedbackBaseSlug,
        api_key: meta.apiKey ? "configured" : "none",
      };
    },
  };
}
