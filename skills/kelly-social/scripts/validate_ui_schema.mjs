#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/social_snapshot.json", import.meta.url).pathname;

const PLATFORMS = ["x", "facebook", "instagram", "linkedin", "youtube", "threads", "tiktok", "xiaohongshu", "manual"];
const COLLECTION_METHODS = ["browser_agent", "api", "manual_export"];
const MEDIA_KINDS = ["none", "image", "video", "carousel", "link"];

function fail(message) {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj, key, path) {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

function requireEnum(obj, key, values, path) {
  if (!values.includes(obj[key])) fail(`${path}.${key} must be one of ${values.join("|")}, got ${obj[key]}`);
}

const raw = await fs.readFile(target, "utf8").catch((error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${error.message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of ["account_count", "post_count", "total_followers", "followers_delta_7d", "impressions_7d", "engagement_rate_7d"]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!Array.isArray(snapshot.accounts)) fail("root.accounts must be an array");
if (!Array.isArray(snapshot.posts)) fail("root.posts must be an array");
if (!Array.isArray(snapshot.sync_log)) fail("root.sync_log must be an array");
if (!Array.isArray(snapshot.warnings)) fail("root.warnings must be an array");

const accountIds = new Set();
snapshot.accounts.forEach((account, index) => {
  const path = `root.accounts[${index}]`;
  if (!isObject(account)) fail(`${path} must be an object`);
  for (const key of ["account_id", "platform", "handle", "display_name", "collection", "status"]) requireString(account, key, path);
  requireEnum(account, "platform", PLATFORMS, path);
  requireEnum(account, "collection", COLLECTION_METHODS, path);
  if (accountIds.has(account.account_id)) fail(`${path}.account_id duplicates ${account.account_id}`);
  accountIds.add(account.account_id);
  if (!isObject(account.metrics)) fail(`${path}.metrics must be an object`);
  for (const key of ["followers", "following", "posts", "impressions_7d", "engagement_rate_7d", "followers_delta_7d"]) {
    requireNumber(account.metrics, key, `${path}.metrics`);
  }
  if (!Array.isArray(account.follower_series)) fail(`${path}.follower_series must be an array`);
  account.follower_series.forEach((point, pointIndex) => {
    const pointPath = `${path}.follower_series[${pointIndex}]`;
    if (!isObject(point)) fail(`${pointPath} must be an object`);
    requireString(point, "date", pointPath);
    requireNumber(point, "followers", pointPath);
  });
  if (account.traffic_sources !== undefined) {
    if (!Array.isArray(account.traffic_sources)) fail(`${path}.traffic_sources must be an array when present`);
    account.traffic_sources.forEach((sourceItem, sourceIndex) => {
      const sourcePath = `${path}.traffic_sources[${sourceIndex}]`;
      if (!isObject(sourceItem)) fail(`${sourcePath} must be an object`);
      requireString(sourceItem, "source", sourcePath);
      requireNumber(sourceItem, "share", sourcePath);
    });
  }
});

const postIds = new Set();
snapshot.posts.forEach((post, index) => {
  const path = `root.posts[${index}]`;
  if (!isObject(post)) fail(`${path} must be an object`);
  for (const key of ["post_id", "platform", "account_id", "posted_at", "text", "media"]) requireString(post, key, path);
  requireEnum(post, "media", MEDIA_KINDS, path);
  if (postIds.has(post.post_id)) fail(`${path}.post_id duplicates ${post.post_id}`);
  postIds.add(post.post_id);
  if (!accountIds.has(post.account_id)) fail(`${path}.account_id does not match an account: ${post.account_id}`);
  if (!isObject(post.metrics)) fail(`${path}.metrics must be an object`);
  for (const key of ["likes", "replies", "reposts", "views"]) requireNumber(post.metrics, key, `${path}.metrics`);
  requireNumber(post, "engagement_rate", path);
});

const syncIds = new Set();
snapshot.sync_log.forEach((entry, index) => {
  const path = `root.sync_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["sync_id", "account_id", "method", "started_at", "status"]) requireString(entry, key, path);
  requireEnum(entry, "method", COLLECTION_METHODS, path);
  requireNumber(entry, "posts_collected", path);
  if (syncIds.has(entry.sync_id)) fail(`${path}.sync_id duplicates ${entry.sync_id}`);
  syncIds.add(entry.sync_id);
  if (!accountIds.has(entry.account_id)) fail(`${path}.account_id does not match an account: ${entry.account_id}`);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${target}`);
