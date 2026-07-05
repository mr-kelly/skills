#!/usr/bin/env node
// Single write path for collected social data. The agent (browser session,
// export parser, or API connector) produces a payload JSON file, and this
// script validates and merges it into app/.data/social_snapshot.json with
// per-account sync_log entries. It refuses to run while another owner holds
// app/.data/agent.lock.
//
// Usage: node scripts/ingest_snapshot.mjs /path/to/payload.json
//
// Payload shape:
// {
//   "collected_at": "ISO timestamp (optional, defaults to now)",
//   "source": "collector name (optional)",
//   "accounts": [ { account_id, platform, handle, display_name, collection, metrics, follower_series, ... } ],
//   "posts": [ { post_id, platform, account_id, posted_at, text, media, metrics, ... } ],
//   "warnings": [ optional warning objects ],
//   "sync": { "status": "ok|warning|error", "message": "optional note" }
// }
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Post } from "../app/server/types.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const snapshotPath = path.join(dataDir, "social_snapshot.json");
const lockPath = path.join(dataDir, "agent.lock");
const now = new Date().toISOString();

const PLATFORMS = ["x", "facebook", "instagram", "linkedin", "youtube", "threads", "tiktok", "xiaohongshu", "manual"];
const COLLECTION_METHODS = ["browser_agent", "api", "manual_export"];
const MEDIA_KINDS = ["none", "image", "video", "carousel", "link"];

function fail(message) {
  console.error(`Ingest failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-social",
    range: { start: "", end: "" },
    metrics: {
      account_count: 0,
      post_count: 0,
      total_followers: 0,
      followers_delta_7d: 0,
      followers_delta_28d: 0,
      impressions_7d: 0,
      engagements_7d: 0,
      engagement_rate_7d: 0,
    },
    accounts: [],
    posts: [],
    sync_log: [],
    warnings: [],
  };
}

function validatePayload(payload) {
  if (!isObject(payload)) fail("payload must be a JSON object");
  if (!Array.isArray(payload.accounts) || payload.accounts.length === 0)
    fail("payload.accounts must be a non-empty array");
  if (!Array.isArray(payload.posts)) fail("payload.posts must be an array");
  const accountIds = new Set();
  payload.accounts.forEach((account, index) => {
    const path = `payload.accounts[${index}]`;
    if (!isObject(account)) fail(`${path} must be an object`);
    for (const key of ["account_id", "platform", "handle", "collection"]) {
      if (typeof account[key] !== "string" || !account[key]) fail(`${path}.${key} must be a non-empty string`);
    }
    if (!PLATFORMS.includes(account.platform)) fail(`${path}.platform must be one of ${PLATFORMS.join("|")}`);
    if (!COLLECTION_METHODS.includes(account.collection))
      fail(`${path}.collection must be one of ${COLLECTION_METHODS.join("|")}`);
    if (accountIds.has(account.account_id)) fail(`${path}.account_id duplicates ${account.account_id}`);
    accountIds.add(account.account_id);
    if (account.metrics !== undefined && !isObject(account.metrics))
      fail(`${path}.metrics must be an object when present`);
    if (account.follower_series !== undefined && !Array.isArray(account.follower_series))
      fail(`${path}.follower_series must be an array when present`);
  });
  payload.posts.forEach((post, index) => {
    const path = `payload.posts[${index}]`;
    if (!isObject(post)) fail(`${path} must be an object`);
    for (const key of ["post_id", "platform", "account_id", "posted_at", "text", "media"]) {
      if (typeof post[key] !== "string" || !post[key]) fail(`${path}.${key} must be a non-empty string`);
    }
    if (!MEDIA_KINDS.includes(post.media)) fail(`${path}.media must be one of ${MEDIA_KINDS.join("|")}`);
    if (!accountIds.has(post.account_id))
      fail(`${path}.account_id does not match a payload account: ${post.account_id}`);
    if (!isObject(post.metrics)) fail(`${path}.metrics must be an object`);
    for (const key of ["likes", "replies", "reposts", "views"]) {
      if (typeof post.metrics[key] !== "number" || Number.isNaN(post.metrics[key]))
        fail(`${path}.metrics.${key} must be a number`);
    }
  });
}

function normalizeAccount(existing, incoming, collectedAt) {
  const merged = {
    notes: "",
    profile_url: "",
    traffic_sources: [],
    status: "ok",
    ...existing,
    ...incoming,
    metrics: { ...(existing?.metrics || {}), ...(incoming.metrics || {}) },
    last_sync_at: collectedAt,
  };
  const metricDefaults = {
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
  merged.metrics = { ...metricDefaults, ...merged.metrics };
  merged.display_name = merged.display_name || merged.handle || merged.account_id;
  const seriesByDate = new Map();
  for (const point of existing?.follower_series || []) seriesByDate.set(point.date, point);
  for (const point of incoming.follower_series || []) seriesByDate.set(point.date, point);
  merged.follower_series = [...seriesByDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return merged;
}

function normalizePost(post) {
  const metrics = { likes: 0, replies: 0, reposts: 0, views: 0, saves: 0, clicks: 0, ...post.metrics };
  const engagements = metrics.likes + metrics.replies + metrics.reposts + metrics.saves;
  return {
    provider_post_id: post.post_id,
    type: "post",
    media_count: post.media === "none" ? 0 : 1,
    permalink: "",
    agent_notes: "",
    tags: [],
    ...post,
    metrics,
    engagement_rate:
      typeof post.engagement_rate === "number"
        ? post.engagement_rate
        : metrics.views > 0
          ? Number((engagements / metrics.views).toFixed(4))
          : 0,
  };
}

function rollup(snapshot) {
  const totals = snapshot.accounts.reduce(
    (acc, item) => {
      acc.total_followers += Number(item.metrics?.followers || 0);
      acc.followers_delta_7d += Number(item.metrics?.followers_delta_7d || 0);
      acc.followers_delta_28d += Number(item.metrics?.followers_delta_28d || 0);
      acc.impressions_7d += Number(item.metrics?.impressions_7d || 0);
      acc.engagements_7d += Number(item.metrics?.engagements_7d || 0);
      return acc;
    },
    {
      account_count: snapshot.accounts.length,
      post_count: snapshot.posts.length,
      total_followers: 0,
      followers_delta_7d: 0,
      followers_delta_28d: 0,
      impressions_7d: 0,
      engagements_7d: 0,
      engagement_rate_7d: 0,
    },
  );
  totals.engagement_rate_7d =
    totals.impressions_7d > 0 ? Number((totals.engagements_7d / totals.impressions_7d).toFixed(4)) : 0;
  return totals;
}

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) fail("usage: node scripts/ingest_snapshot.mjs /path/to/payload.json");

  const payload = await readJson(path.resolve(payloadPath), null);
  if (!payload) fail(`cannot read payload file: ${payloadPath}`);
  validatePayload(payload);

  const existingLock = await readJson(lockPath, null);
  if (existingLock) {
    fail(
      `app/.data/agent.lock is held by "${existingLock.owner || "unknown"}" (${existingLock.message || "no message"}). Retry after the lock is released.`,
    );
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    lockPath,
    JSON.stringify(
      {
        owner: "kelly-social-ingest",
        message: "Merging collected snapshot payload",
        started_at: now,
      },
      null,
      2,
    ),
  );

  try {
    const snapshot = (await readJson(snapshotPath, null)) || emptySnapshot();
    const collectedAt = payload.collected_at || now;

    const accountsById = new Map(snapshot.accounts.map((account) => [account.account_id, account]));
    for (const incoming of payload.accounts) {
      accountsById.set(
        incoming.account_id,
        normalizeAccount(accountsById.get(incoming.account_id), incoming, collectedAt),
      );
    }
    snapshot.accounts = [...accountsById.values()];

    const postsById = new Map(snapshot.posts.map((post) => [post.post_id, post]));
    for (const incoming of payload.posts) {
      postsById.set(incoming.post_id, normalizePost(incoming));
    }
    snapshot.posts = [...postsById.values()].sort(
      (a: Post, b: Post) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
    );

    const syncStatus = payload.sync?.status || "ok";
    const syncStamp = now.replace(/[-:.TZ]/g, "").slice(0, 14);
    for (const incoming of payload.accounts) {
      const postsCollected = payload.posts.filter((post) => post.account_id === incoming.account_id).length;
      snapshot.sync_log.unshift({
        sync_id: `sync-${incoming.account_id}-${syncStamp}`,
        account_id: incoming.account_id,
        method: incoming.collection,
        started_at: collectedAt,
        completed_at: now,
        status: syncStatus,
        posts_collected: postsCollected,
        message: payload.sync?.message || `Ingested ${postsCollected} posts via ${incoming.collection}.`,
        actor: payload.source || "kelly-social",
      });
    }
    snapshot.sync_log = snapshot.sync_log.slice(0, 200);

    if (Array.isArray(payload.warnings) && payload.warnings.length) {
      const warningIds = new Set(payload.warnings.map((warning) => warning.id));
      snapshot.warnings = [...payload.warnings, ...snapshot.warnings.filter((warning) => !warningIds.has(warning.id))];
    }
    snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");

    const postDates = snapshot.posts.map((post) => String(post.posted_at).slice(0, 10)).sort();
    snapshot.range = { start: postDates[0] || "", end: postDates[postDates.length - 1] || "" };
    snapshot.metrics = rollup(snapshot);
    snapshot.generated_at = now;
    snapshot.source = "kelly-social";
    snapshot.schema_version = snapshot.schema_version || "1";

    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log(`Merged ${payload.accounts.length} accounts and ${payload.posts.length} posts into ${snapshotPath}`);
    console.log("Run: node scripts/validate_ui_schema.mjs to verify the merged snapshot.");
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

await main();
