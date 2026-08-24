import fs from "node:fs/promises";
import path from "node:path";

import { createBusabaseClient } from "busabase-sdk";

import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../../content/kelly-portrait-retouch-app/app/js/config.js";

export function clientFromEnv() {
  const baseUrl = process.env.BUSABASE_BASE_URL;
  const spaceId = process.env.BUSABASE_SPACE_ID;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  if (!spaceId) throw new Error("BUSABASE_SPACE_ID is required");
  return createBusabaseClient({
    baseUrl,
    spaceId,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
  });
}

export async function connect() {
  const client = clientFromEnv();
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Portrait Retouch resources are not ready; initialize them from the AirApp first.");
  }
  return { client, bases: new Map(resources.bases.map((base) => [base.key, base])) };
}

export const normalizeFields = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("-", "_"), value]));

export const encodeFields = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value ?? ""]));

export async function findRecord(client, base, fieldSlug, valueText) {
  try {
    return await client.records.get({ baseId: base.baseId, fieldSlug, valueText });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

export async function upsert(client, base, fieldSlug, valueText, fields, message) {
  const existing = await findRecord(client, base, fieldSlug, valueText);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: base.baseId,
      fields: encodeFields(fields),
      message,
      submittedBy: "kelly-portrait-retouch-agent",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: encodeFields(fields),
    message,
    author: "kelly-portrait-retouch-agent",
    baseCommitId: existing.headCommitId || existing.headCommit?.id,
    autoMerge: true,
  });
}

export async function uploadAsset(client, filePath, mimeType, context) {
  const bytes = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const requested = await client.assets.createUploadUrl({ fileName, mimeType, sizeBytes: bytes.length, context });
  if (requested.assetId) return { assetId: requested.assetId, url: requested.publicUrl };
  const response = await fetch(requested.uploadUrl, {
    method: "PUT",
    headers: { "content-type": mimeType },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Asset upload failed for ${fileName} (${response.status})`);
  const confirmed = await client.assets.confirm({
    storageKey: requested.storageKey,
    fileName,
    mimeType,
    sizeBytes: bytes.length,
    context,
  });
  return { assetId: confirmed.assetId, url: confirmed.publicUrl };
}
