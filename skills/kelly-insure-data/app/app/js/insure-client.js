// Browser-side raw-fetch client for the Busabase Drive and Base-record REST
// surface. busabase-sdk (the vendored package used by every other converted
// skill) only wraps nodes/bases/records; it has no equivalent for
// /api/v1/drives/* or /api/v1/assets/*, which this read-only reader needs
// for the file drive. This module is a browser port of the read paths from
// the retired lib/data-provider/busabase-client.ts (resolveDrive/
// resolveBase/listDriveFiles/listRecords), talking to the same-origin
// `/api/v1/*` proxy in server.js with plain fetch instead of an explicit
// base_url + bearer token (the proxy injects the AirApp's ambient OAuth
// session and Space header).
//
// Two endpoint paths were corrected against the real, currently-shipped
// Busabase REST contract while porting (both verified live against a
// `busabase@0.11.0` server, the same version every other converted skill's
// OSS integration test uses):
//   - Records: the retired client called `GET /records/paged`, which does
//     not exist. The canonical, keyset-paginated listing endpoint —
//     confirmed against busabase-sdk's own `recordContract.list` route
//     definition (`apps/busabase-sdk` contract source, the same
//     cross-reference the migration recipe uses for write calls) — is
//     `GET /records` with `baseId`/`limit`(<=100)/`cursor`. Fixed here and
//     in scripts/lib/busabase-client.mjs.
//   - Drive: the retired client called `GET /drives/{nodeId}` and
//     `GET /drives/{nodeId}/files`, both 404 against a live server. A
//     Drive's node metadata AND its file listing are both returned by the
//     already-used `GET /nodes/{nodeId}` endpoint when the node's `type` is
//     `"drive"` (`{ node, files, entryFile, visibility, version }`). Fixed
//     here and in scripts/lib/busabase-client.mjs for reads. The Drive
//     *write* path used only by the trusted restore script
//     (`POST /drives/{nodeId}/change-requests`, for re-uploading files that
//     don't exist yet) could not be confirmed within reasonable effort — see
//     the comment on `createDriveChangeRequest` in
//     scripts/lib/busabase-client.mjs, which this read-only browser module
//     does not need.
// Write/upload endpoints (assets/upload-urls, change-requests, etc.) are
// intentionally not ported here: this AirApp never writes, only the trusted
// scripts in the skill-root scripts/ directory do, using their own
// scripts/lib/busabase-client.mjs against the operator's own credentials.

async function api(method, pathname) {
  const res = await fetch(pathname, { method, headers: { accept: "application/json" } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function listBases() {
  const bases = await api("GET", "/api/v1/bases");
  return Array.isArray(bases) ? bases : [];
}

export async function listNodes() {
  const nodes = await api("GET", "/api/v1/nodes");
  return Array.isArray(nodes) ? nodes : [];
}

export async function resolveBase(id = "", slug = "") {
  if (!id && !slug) return null;
  const bases = await listBases();
  return bases.find((base) => base.id === id || base.slug === slug) || null;
}

export async function resolveDrive(id = "", slug = "") {
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
      try {
        return await api("GET", `/api/v1/nodes/${encodeURIComponent(node.id)}`);
      } catch {
        return { node, files: [] };
      }
    }
    if (Array.isArray(node?.children)) stack.push(...node.children);
  }
  return null;
}

export async function listDriveFiles(nodeId) {
  const detail = await api("GET", `/api/v1/nodes/${encodeURIComponent(nodeId)}`);
  return Array.isArray(detail?.files) ? detail.files : [];
}

// Transport page size is fixed at the API's own maximum and owned here, not
// by a caller-supplied `limit`. The previous version used that `limit` as a
// ceiling on total records collected, so any Base past the ceiling was read
// incomplete with no error. Follows `nextCursor` until the server reports
// none left, with a guard against a repeating cursor.
const RECORD_PAGE_SIZE = 100;

export async function listRecords(baseId) {
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
