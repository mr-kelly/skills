// Thin trusted-process Busabase REST client for kelly-demo-video-factory's
// skill-root scripts (ensure_schema/propose_video/set_shot_status/status).
// Ported from the retired lib/data-provider/busabase-client.ts (types
// stripped, call sequence and structure-ops gotchas preserved verbatim):
//   - structure ops (folder/base/field) use POST .../nodes/change-requests or
//     POST .../bases/{baseId}/fields/change-requests, with autoMerge only
//     when the human has already approved the exact structure in conversation.
//   - node-create ops nest under an EARLIER op's `ref` via parentNodeRef, or under
//     an EXISTING node via parentNodeId (these are mutually exclusive; forward refs error).
//   - field slugs must match /^[a-z0-9-]+$/ (kebab-case, no underscores).
//   - records are never autoMerged from the schema-setup path: POST
//     .../bases/{baseId}/change-requests to propose, then approveAndMerge()
//     only after a human (or an explicit "go ahead") approves.
//   - full-record updates are a REPLACE, not a partial patch — always fetch
//     current fields first and spread them before adding new ones.
//
// Endpoint corrections made while porting (verified against busabase-sdk
// 0.11.0's own oRPC contract source, apps/busabase-sdk/dist/index.js, and
// against a live busabase@0.11.0 OSS server) — the original
// lib/data-provider/busabase-client.ts predates these fixes and used the
// wrong shapes for several calls; kelly-insure-data's scripts/lib/busabase-client.mjs
// hit the same class of bug first and is the precedent for these corrections:
//   - records.list is `GET /records` (NOT `/records/paged`).
//   - records.get-by-id is `GET /records/get?recordId=...` (NOT `GET /records/{id}`).
//   - record change requests (create/update) are `POST /records/{recordId}/change-requests`
//     (NOT `PUT`), body `{operation:"update", fields, message, author, baseCommitId, autoMerge}`.
//   - change-request review/merge are BATCH endpoints keyed by `changeRequestIds`
//     (`POST /change-requests/reviews`, `POST /change-requests/merge`), NOT
//     per-id `/change-requests/{id}/reviews` or `/change-requests/{id}/merge`.
//   - field change requests require an explicit `operation: "create" | "update"`
//     in the body (a discriminated union) — the original script omitted it.
//   - `attachment` field options nest under `options.attachment.maxFiles`, NOT
//     a top-level `options.maxFiles`.
import { createHash } from "node:crypto";

function cleanUrl(value) {
  return String(value || "").replace(/\/$/, "");
}

export function loadBusabaseConfig(envPrefix = "KELLY_VIDEO_FACTORY") {
  return {
    baseUrl: cleanUrl(
      process.env[`${envPrefix}_BUSABASE_URL`] || process.env.BUSABASE_BASE_URL || "http://127.0.0.1:15419",
    ),
    apiKey: process.env[`${envPrefix}_BUSABASE_API_KEY`] || process.env.BUSABASE_API_KEY || "",
    spaceId: process.env[`${envPrefix}_BUSABASE_SPACE_ID`] || process.env.BUSABASE_SPACE_ID || "",
  };
}

async function call(cfg, method, path, body) {
  const headers = { "content-type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.spaceId) headers["x-busabase-space"] = cfg.spaceId;
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`Busabase ${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

export async function listBases(cfg) {
  return call(cfg, "GET", "/api/v1/bases");
}

export async function findBase(cfg, slug) {
  const bases = await listBases(cfg);
  return bases.find((b) => b.slug === slug);
}

/** Approve + merge a change request in one step. Only call after human go-ahead. */
export async function approveAndMerge(cfg, changeRequestId, reason) {
  await call(cfg, "POST", "/api/v1/change-requests/reviews", {
    changeRequestIds: [changeRequestId],
    verdict: "approved",
    reason,
  });
  return call(cfg, "POST", "/api/v1/change-requests/merge", { changeRequestIds: [changeRequestId] });
}

/**
 * Propose a new record. Always explicit `autoMerge: false` unless overridden —
 * the server's own default is permission-aware (merges immediately if the
 * caller's credentials have write access), which would silently defeat this
 * skill's "never merge a records ChangeRequest without an explicit human
 * go-ahead" rule (see SKILL.md Boundary). Every merge in this skill goes
 * through the separate, explicit approveAndMerge() call.
 */
export async function proposeRecord(cfg, baseId, fields, message, { autoMerge = false } = {}) {
  return call(cfg, "POST", `/api/v1/bases/${baseId}/change-requests`, {
    message,
    submittedBy: "agent",
    fields,
    autoMerge,
  });
}

export async function listRecords(cfg, baseId, limit = 100) {
  const records = [];
  let cursor = "";
  while (records.length < limit) {
    const pageLimit = Math.min(100, limit - records.length);
    const query = new URLSearchParams({ baseId, limit: String(pageLimit) });
    if (cursor) query.set("cursor", cursor);
    const page = await call(cfg, "GET", `/api/v1/records?${query.toString()}`);
    const pageRecords = Array.isArray(page) ? page : page?.records || [];
    records.push(...pageRecords);
    cursor = String(page?.nextCursor || "");
    if (!cursor || pageRecords.length === 0) break;
  }
  return { records: records.slice(0, limit) };
}

export async function getRecord(cfg, recordId) {
  return call(cfg, "GET", `/api/v1/records/get?recordId=${encodeURIComponent(recordId)}`);
}

/** Full-record replace (not a partial patch) — spread existing fields before adding new ones. */
export async function proposeRecordUpdate(cfg, recordId, fields, message, { autoMerge = false } = {}) {
  return call(cfg, "POST", `/api/v1/records/${recordId}/change-requests`, {
    operation: "update",
    message,
    author: "agent",
    fields,
    autoMerge,
  });
}

/**
 * Structure: create a Base field via a field ChangeRequest. Unlike node/record
 * ChangeRequests, the field-change-request endpoint's input schema has no
 * `autoMerge` parameter at all (verified against busabase-sdk 0.11.0's own
 * contract and against a live server: passing `autoMerge: true` here is
 * silently ignored and the field CR stays `in_review`) — so this always
 * comes back pending and the caller must explicitly approveAndMerge() it,
 * same as a record ChangeRequest.
 */
export async function createFieldChangeRequest(cfg, baseId, field, message) {
  return call(cfg, "POST", `/api/v1/bases/${baseId}/fields/change-requests`, {
    operation: "create",
    message,
    submittedBy: "agent",
    name: field.name,
    slug: field.slug,
    type: field.type,
    ...(field.required === undefined ? {} : { required: field.required }),
    ...(field.options === undefined ? {} : { options: field.options }),
  });
}

/** Structure: patch an existing Base field (e.g. to add an inverseFieldId once both sides exist). Also always pending — see createFieldChangeRequest's comment. */
export async function updateFieldChangeRequest(cfg, baseId, fieldId, patch, message) {
  return call(cfg, "POST", `/api/v1/bases/${baseId}/fields/change-requests`, {
    operation: "update",
    message,
    submittedBy: "agent",
    fieldId,
    patch,
  });
}

/** Structure: create nodes (folders/bases) via a node ChangeRequest. */
export async function createNodeChangeRequest(cfg, operations, message, { autoMerge = true } = {}) {
  return call(cfg, "POST", "/api/v1/nodes/change-requests", {
    message,
    submittedBy: "agent",
    autoMerge,
    operations,
  });
}

export async function getNode(cfg, nodeId) {
  return call(cfg, "GET", `/api/v1/nodes/${encodeURIComponent(nodeId)}`);
}

export function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}
