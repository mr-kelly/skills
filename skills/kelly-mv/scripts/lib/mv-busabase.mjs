// Trusted-process Busabase helper shared by every kelly-mv skill-root
// script. Uses the real `busabase-sdk` npm package directly (Node import,
// not the browser vendor bundle) with the trusted operator's own credentials
// (BUSABASE_BASE_URL / BUSABASE_API_KEY / BUSABASE_SPACE_ID) — never the
// AirApp's ambient session. Mirrors kelly-crm's scripts/execute_decisions.mjs
// pattern: import appConfig + inspectProvisionedResources straight from
// app/app/js/ (pure ESM, no `window` global, safe in Node), construct the
// client via busabase-sdk's own createBusabaseClient.
//
// Unlike kelly-insure-data's trusted scripts (whose vendored SDK snapshot
// predated a usable `assets` client and so hand-rolled raw fetch), this
// module uses `client.assets.{createUploadUrl,confirm,download}` directly —
// see app/app/js/config.js's header comment for how that was verified.
import fs from "node:fs/promises";
import path from "node:path";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../../app/app/js/config.js";

export function clientFromEnv() {
  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  return createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
}

export async function connect() {
  const client = clientFromEnv();
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error(
      "Kelly MV Busabase resources are not provisioned yet; open the AirApp once (or run its setup) first.",
    );
  }
  const basesByKey = new Map(resources.bases.map((base) => [base.key, base]));
  return { client, basesByKey };
}

export const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
export const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

export async function readAllRecords(client, declaredBase, { maxPages = 20 } = {}) {
  const rows = [];
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await client.records.list({
      baseId: declaredBase.baseId,
      limit: declaredBase.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      // Mutate the normalized object rather than spreading it into a new
      // literal: TypeScript's checkJs collapses `{...normalizeFields(x),
      // extra}` to just `{ extra }` (the index-signature type Object.
      // fromEntries() infers doesn't survive an object-spread literal),
      // which then makes every `row.<field>` access downstream a false
      // "property does not exist" error. Assigning onto the object instead
      // keeps the index signature intact.
      const fields = normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields);
      fields.__recordId = record.id;
      fields.__headCommitId = record.headCommitId || record.headCommit?.id;
      rows.push(fields);
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

export async function findRecord(client, declaredBase, idFieldSlug, idValue) {
  try {
    return await client.records.get({ baseId: declaredBase.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

// Trusted-operator writes always auto-merge — there is no AirApp boundary to
// respect when the caller already holds the operator's own credentials.
export async function upsert(client, declaredBase, idFieldSlug, idValue, fields, message) {
  const existing = await findRecord(client, declaredBase, idFieldSlug, idValue);
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: declaredBase.baseId,
      fields: normalized,
      message,
      submittedBy: "kelly-mv-script",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: normalized,
    message,
    author: "kelly-mv-script",
    baseCommitId: existing.headCommitId,
    autoMerge: true,
  });
}

export async function uploadAssetFromBytes(client, bytes, fileName, mimeType, context = "kelly-mv/script") {
  const requested = await client.assets.createUploadUrl({ fileName, mimeType, sizeBytes: bytes.length, context });
  if (requested.assetId) return { assetId: requested.assetId, url: requested.publicUrl };
  const put = await fetch(requested.uploadUrl, { method: "PUT", headers: { "content-type": mimeType }, body: bytes });
  if (!put.ok) throw new Error(`Asset upload failed (${put.status}).`);
  const confirmed = await client.assets.confirm({
    storageKey: requested.storageKey,
    fileName,
    mimeType,
    sizeBytes: bytes.length,
    context,
  });
  return { assetId: confirmed.assetId, url: confirmed.publicUrl };
}

export async function uploadAssetFromFile(client, absPath, mimeType, context) {
  const bytes = await fs.readFile(absPath);
  return uploadAssetFromBytes(client, bytes, path.basename(absPath), mimeType, context);
}

export async function downloadAssetToFile(client, assetId, absPath) {
  const { downloadUrl } = await client.assets.download({ assetId });
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Asset download failed (${res.status}).`);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, Buffer.from(await res.arrayBuffer()));
  return absPath;
}

export function parseJsonArray(text) {
  try {
    const value = JSON.parse(text || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
export function parseJsonObject(text) {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
