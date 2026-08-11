import { createBusabaseClient } from "busabase-sdk";

import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

export { appConfig };

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Trusted scripts need their own Busabase credentials.`);
  return value;
};

// Trusted scripts carry their own credentials. They never borrow the AirApp's
// ambient browser session, and nothing they read ends up in browser code.
export function createTrustedClient() {
  return createBusabaseClient({
    baseUrl: required("BUSABASE_BASE_URL"),
    apiKey: required("BUSABASE_API_KEY"),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
}

export async function resolveBases(client) {
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    const names = resources.missing.map((base) => base.name).join("、");
    throw new Error(`Busabase workspace is not ready: ${names || appConfig.folder.name}`);
  }
  return new Map(resources.bases.map((base) => [base.key, base]));
}

const snakeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

export async function readAll(client, base) {
  const rows = [];
  let cursor = null;
  do {
    const page = await client.records.list({
      baseId: base.baseId,
      limit: base.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    for (const record of page.records || []) {
      rows.push({ id: record.id, fields: snakeFields(record.headCommit?.fields || record.fields) });
    }
    cursor = page.nextCursor || null;
  } while (cursor);
  return rows;
}

// `bases.createBulkChangeRequest` has no autoMerge flag — a bulk import is
// always proposed for review. Running this script with --apply IS the operator's
// approval, so approve and merge it explicitly instead of leaving it pending.
export async function mergeChangeRequest(client, changeRequest) {
  if (!changeRequest?.id || changeRequest.status === "merged") return changeRequest;
  await client.changeRequests.review({ changeRequestId: changeRequest.id, verdict: "approved" });
  const merged = await client.changeRequests.merge({ changeRequestId: changeRequest.id });
  return merged?.changeRequest || merged;
}

export const parseFlags = (argv) => ({
  apply: argv.includes("--apply"),
  positional: argv.filter((value) => !value.startsWith("--")),
});

export const dryRunBanner = (apply) => (apply ? "" : "预演模式（未写入任何数据）。确认无误后加 --apply 真正执行。\n");
