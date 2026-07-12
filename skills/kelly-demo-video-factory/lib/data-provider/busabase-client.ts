// Thin Busabase REST client for kelly-demo-video-factory.
// Encodes call sequences validated against a live local Busabase instance:
//   - structure ops (folder/base/field) use POST .../nodes/change-requests or
//     POST/PATCH .../bases/{baseId}/fields/change-requests, with autoMerge only
//     when the human has already approved the exact structure in conversation.
//   - node-create ops nest under an EARLIER op's `ref` via parentNodeRef, or under
//     an EXISTING node via parentNodeId (these are mutually exclusive; forward refs error).
//   - field slugs must match /^[a-z0-9-]+$/ (kebab-case, no underscores).
//   - records are never autoMerged: POST .../bases/{baseId}/change-requests to
//     propose, then POST .../change-requests/{id}/reviews + POST .../merge only
//     after a human (or an explicit "go ahead") approves.
//   - full-record updates go through PUT /records/{recordId}/change-requests and
//     require the complete field set (it is a replace, not a partial patch) —
//     always fetch current fields first and spread them before adding new ones.

export interface BusabaseConfig {
  baseUrl: string;
  apiKey?: string;
  spaceId?: string;
}

export function loadBusabaseConfig(): BusabaseConfig {
  const baseUrl =
    process.env.KELLY_VIDEO_FACTORY_BUSABASE_URL ?? process.env.BUSABASE_BASE_URL ?? "http://127.0.0.1:15419";
  return {
    baseUrl,
    apiKey: process.env.KELLY_VIDEO_FACTORY_BUSABASE_API_KEY ?? process.env.BUSABASE_API_KEY,
    spaceId: process.env.KELLY_VIDEO_FACTORY_BUSABASE_SPACE_ID ?? process.env.BUSABASE_SPACE_ID,
  };
}

async function call(cfg: BusabaseConfig, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
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

export async function listBases(cfg: BusabaseConfig) {
  return call(cfg, "GET", "/api/v1/bases");
}

export async function findBase(cfg: BusabaseConfig, slug: string) {
  const bases = (await listBases(cfg)) as Array<{ slug: string }>;
  return bases.find((b) => b.slug === slug) as
    | { id: string; slug: string; fields: Array<{ id: string; slug: string }> }
    | undefined;
}

/** Approve + merge a change request in one step. Only call after human go-ahead. */
export async function approveAndMerge(cfg: BusabaseConfig, changeRequestId: string, reason: string) {
  await call(cfg, "POST", `/api/v1/change-requests/${changeRequestId}/reviews`, {
    verdict: "approved",
    reason,
  });
  return call(cfg, "POST", `/api/v1/change-requests/${changeRequestId}/merge`);
}

/** Propose a new record. Leaves it in_review — caller decides whether to merge. */
export async function proposeRecord(
  cfg: BusabaseConfig,
  baseId: string,
  fields: Record<string, unknown>,
  message: string,
) {
  return call(cfg, "POST", `/api/v1/bases/${baseId}/change-requests`, {
    message,
    submittedBy: "agent",
    fields,
  });
}

export async function listRecords(cfg: BusabaseConfig, baseId: string, limit = 100) {
  return call(cfg, "GET", `/api/v1/records/paged?baseId=${baseId}&limit=${limit}`);
}

export async function getRecord(cfg: BusabaseConfig, recordId: string) {
  return call(cfg, "GET", `/api/v1/records/${recordId}`);
}

/** Full-record replace (not a partial patch) — spread existing fields before adding new ones. */
export async function proposeRecordUpdate(
  cfg: BusabaseConfig,
  recordId: string,
  fields: Record<string, unknown>,
  message: string,
) {
  return call(cfg, "PUT", `/api/v1/records/${recordId}/change-requests`, {
    message,
    author: "agent",
    fields,
  });
}
