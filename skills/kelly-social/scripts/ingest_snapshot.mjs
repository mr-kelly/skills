#!/usr/bin/env node
// Single write path for collected social data. The agent (browser session,
// export parser, or API connector) produces a payload JSON file, and this
// script validates and merges it into Busabase: upserts accounts (metrics,
// follower series, traffic sources, status/notes), upserts posts (create or
// update by post-id), and appends a sync_log row per account. It never
// touches the ECHO publishing-desk Bases (calendar/drafts/shorts/engagement/
// settings) — those are compose/approval state the AirApp itself owns.
//
// Ported from the retired scripts/ingest_snapshot.ts: same payload shape,
// same validation rules, same account/post merge-by-stable-id semantics —
// only the storage target changed, from app/.data/social_snapshot.json to
// Busabase records. Connects with the trusted process's own credentials
// (BUSABASE_BASE_URL, BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the
// AirApp's ambient session. Writes are gated behind --apply (default dry run).
//
// Usage: node scripts/ingest_snapshot.mjs /path/to/payload.json [--apply]
//
// Payload shape:
// {
//   "collected_at": "ISO timestamp (optional, defaults to now)",
//   "source": "collector name (optional)",
//   "accounts": [ { account_id, platform, handle, display_name, collection, metrics, follower_series, traffic_sources, ... } ],
//   "posts": [ { post_id, platform, account_id, posted_at, text, media, metrics, ... } ],
//   "warnings": [ { account_id, message } (optional) ],
//   "sync": { "status": "ok|warning|error", "message": "optional note" }
// }
import fs from "node:fs/promises";
import path from "node:path";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

const PLATFORMS = ["x", "facebook", "instagram", "linkedin", "youtube", "threads", "tiktok", "xiaohongshu", "manual"];
const COLLECTION_METHODS = ["browser_agent", "api", "manual_export"];
const MEDIA_KINDS = ["none", "image", "video", "carousel", "link"];

function help() {
  console.log(`Usage: node scripts/ingest_snapshot.mjs <payload.json> [--apply]

Validates a collected-social payload (see references/social-schema.md) and
merges it into Busabase: upserts accounts by account-id, upserts posts by
post-id, and appends one sync_log row per account. Without --apply this is a
dry run that only validates and prints a summary.`);
}

function fail(message) {
  console.error(`kelly-social ingest: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatePayload(payload) {
  if (!isObject(payload)) fail("payload must be a JSON object");
  if (!Array.isArray(payload.accounts) || payload.accounts.length === 0)
    fail("payload.accounts must be a non-empty array");
  if (!Array.isArray(payload.posts)) fail("payload.posts must be an array");
  const accountIds = new Set();
  payload.accounts.forEach((account, index) => {
    const at = `payload.accounts[${index}]`;
    if (!isObject(account)) fail(`${at} must be an object`);
    for (const key of ["account_id", "platform", "handle", "collection"]) {
      if (typeof account[key] !== "string" || !account[key]) fail(`${at}.${key} must be a non-empty string`);
    }
    if (!PLATFORMS.includes(account.platform)) fail(`${at}.platform must be one of ${PLATFORMS.join("|")}`);
    if (!COLLECTION_METHODS.includes(account.collection))
      fail(`${at}.collection must be one of ${COLLECTION_METHODS.join("|")}`);
    if (accountIds.has(account.account_id)) fail(`${at}.account_id duplicates ${account.account_id}`);
    accountIds.add(account.account_id);
    if (account.metrics !== undefined && !isObject(account.metrics))
      fail(`${at}.metrics must be an object when present`);
    if (account.follower_series !== undefined && !Array.isArray(account.follower_series))
      fail(`${at}.follower_series must be an array when present`);
  });
  payload.posts.forEach((post, index) => {
    const at = `payload.posts[${index}]`;
    if (!isObject(post)) fail(`${at} must be an object`);
    for (const key of ["post_id", "platform", "account_id", "posted_at", "text", "media"]) {
      if (typeof post[key] !== "string" || !post[key]) fail(`${at}.${key} must be a non-empty string`);
    }
    if (!MEDIA_KINDS.includes(post.media)) fail(`${at}.media must be one of ${MEDIA_KINDS.join("|")}`);
    if (!accountIds.has(post.account_id)) fail(`${at}.account_id does not match a payload account: ${post.account_id}`);
    if (!isObject(post.metrics)) fail(`${at}.metrics must be an object`);
    for (const key of ["likes", "replies", "reposts", "views"]) {
      if (typeof post.metrics[key] !== "number" || Number.isNaN(post.metrics[key]))
        fail(`${at}.metrics.${key} must be a number`);
    }
  });
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsertRow(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-social-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-social-ingest",
    autoMerge: true,
  });
  return "created";
}

const METRIC_DEFAULTS = {
  followers: 0,
  following: 0,
  posts: 0,
  impressions_7d: 0,
  impressions_28d: 0,
  engagements_7d: 0,
  engagement_rate_7d: 0,
  profile_visits_7d: 0,
  followers_delta_7d: 0,
  followers_delta_28d: 0,
};

function mergedAccountFields(existing, incoming, collectedAt, warningByAccount) {
  const existingMetrics = existing?.metrics ? JSON.parse(existing.metrics) : {};
  const mergedMetrics = { ...METRIC_DEFAULTS, ...existingMetrics, ...(incoming.metrics || {}) };
  const existingSeries = existing?.follower_series ? JSON.parse(existing.follower_series) : [];
  const seriesByDate = new Map(existingSeries.map((point) => [point.date, point]));
  for (const point of incoming.follower_series || []) seriesByDate.set(point.date, point);
  const followerSeries = [...seriesByDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const warning = warningByAccount.get(incoming.account_id);
  return {
    account_id: incoming.account_id,
    platform: incoming.platform,
    handle: incoming.handle,
    display_name: incoming.display_name || incoming.handle || incoming.account_id,
    profile_url: incoming.profile_url || existing?.profile_url || "",
    collection: incoming.collection,
    status: warning ? "warning" : "ok",
    notes: warning ? warning.message : "",
    metrics: JSON.stringify(mergedMetrics),
    follower_series: JSON.stringify(followerSeries),
    traffic_sources: JSON.stringify(
      incoming.traffic_sources || (existing?.traffic_sources ? JSON.parse(existing.traffic_sources) : []),
    ),
    last_sync_at: collectedAt,
  };
}

function postFields(post) {
  const metrics = { likes: 0, replies: 0, reposts: 0, views: 0, saves: 0, clicks: 0, ...post.metrics };
  const engagements = metrics.likes + metrics.replies + metrics.reposts + metrics.saves;
  const engagementRate =
    typeof post.engagement_rate === "number"
      ? post.engagement_rate
      : metrics.views > 0
        ? Number((engagements / metrics.views).toFixed(4))
        : 0;
  return {
    post_id: post.post_id,
    platform: post.platform,
    account_id: post.account_id,
    provider_post_id: post.provider_post_id || post.post_id,
    posted_at: post.posted_at,
    type: post.type || "post",
    text: post.text,
    media: post.media,
    media_count: post.media === "none" ? 0 : Number(post.media_count) || 1,
    permalink: post.permalink || "",
    metrics: JSON.stringify(metrics),
    engagement_rate: engagementRate,
    agent_notes: post.agent_notes || "",
    tags: JSON.stringify(post.tags || []),
  };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) return help();
  const apply = rawArgs.includes("--apply");
  const payloadPath = rawArgs.find((arg) => !arg.startsWith("--"));
  if (!payloadPath) fail("usage: node scripts/ingest_snapshot.mjs /path/to/payload.json [--apply]");

  const payload = JSON.parse(await fs.readFile(path.resolve(payloadPath), "utf8"));
  validatePayload(payload);

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Social Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [accountRows, postRows] = await Promise.all([
    readAll(client, declared("accounts")),
    readAll(client, declared("posts")),
  ]);
  const accountsById = new Map(accountRows.map((row) => [row.account_id, row]));
  const postsById = new Map(postRows.map((row) => [row.post_id, row]));

  const collectedAt = payload.collected_at || new Date().toISOString();
  const warningByAccount = new Map(
    (Array.isArray(payload.warnings) ? payload.warnings : []).map((w) => [w.account_id, w]),
  );

  let accountsUpserted = 0;
  for (const incoming of payload.accounts) {
    const existing = accountsById.get(incoming.account_id);
    const fields = mergedAccountFields(existing, incoming, collectedAt, warningByAccount);
    await upsertRow(client, declared("accounts"), existing, fields, `Ingest account ${incoming.account_id}`, apply);
    accountsUpserted += 1;
  }

  let postsCreated = 0;
  let postsUpdated = 0;
  for (const incoming of payload.posts) {
    const existing = postsById.get(incoming.post_id);
    const fields = postFields(incoming);
    const result = await upsertRow(
      client,
      declared("posts"),
      existing,
      fields,
      `Ingest post ${incoming.post_id}`,
      apply,
    );
    if (result === "created" || result === "would_create") postsCreated += 1;
    else postsUpdated += 1;
  }

  const syncStatus = payload.sync?.status || "ok";
  let syncEntries = 0;
  for (const incoming of payload.accounts) {
    const postsCollected = payload.posts.filter((post) => post.account_id === incoming.account_id).length;
    const syncId = `sync-${incoming.account_id}-${Date.now()}`;
    await upsertRow(
      client,
      declared("sync_log"),
      null,
      {
        sync_id: syncId,
        account_id: incoming.account_id,
        method: incoming.collection,
        started_at: collectedAt,
        completed_at: new Date().toISOString(),
        status: syncStatus,
        posts_collected: postsCollected,
        message: payload.sync?.message || `Ingested ${postsCollected} posts via ${incoming.collection}.`,
        actor: payload.source || "kelly-social",
      },
      `Sync log for ${incoming.account_id}`,
      apply,
    );
    syncEntries += 1;
  }

  console.log(
    `${apply ? "Wrote" : "Would write"} ${accountsUpserted} account(s), ${postsCreated} new post(s), ${postsUpdated} updated post(s), ${syncEntries} sync_log entry(ies) to Busabase.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
