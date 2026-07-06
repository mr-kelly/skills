#!/usr/bin/env node
import fs from "node:fs/promises";
import { snapshotPath } from "../lib/paths.ts";

const target = process.argv[2] || snapshotPath;

const PLATFORMS = ["x", "facebook", "instagram", "linkedin", "youtube", "threads", "tiktok", "xiaohongshu", "manual"];
const COLLECTION_METHODS = ["browser_agent", "api", "manual_export"];
const MEDIA_KINDS = ["none", "image", "video", "carousel", "link"];

function fail(message: string): never {
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

let snapshot: any;
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
for (const key of [
  "account_count",
  "post_count",
  "total_followers",
  "followers_delta_7d",
  "impressions_7d",
  "engagement_rate_7d",
]) {
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
  for (const key of ["account_id", "platform", "handle", "display_name", "collection", "status"])
    requireString(account, key, path);
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

// ── ECHO publishing side (all optional; validated only when present) ────────
const REVIEW_STATES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
const GATE_VERDICTS = ["SHIP", "FIX", "BLOCK"];
const CAL_STATES = ["planned", "drafting", "scheduled", "published", "skipped"];

if (snapshot.calendar !== undefined) {
  if (!Array.isArray(snapshot.calendar)) fail("root.calendar must be an array when present");
  const calIds = new Set();
  snapshot.calendar.forEach((entry, index) => {
    const path = `root.calendar[${index}]`;
    if (!isObject(entry)) fail(`${path} must be an object`);
    for (const key of ["entry_id", "date", "channel", "pillar", "title", "status"]) requireString(entry, key, path);
    requireEnum(entry, "channel", PLATFORMS, path);
    requireEnum(entry, "status", CAL_STATES, path);
    if (calIds.has(entry.entry_id)) fail(`${path}.entry_id duplicates ${entry.entry_id}`);
    calIds.add(entry.entry_id);
  });
}

if (snapshot.drafts !== undefined) {
  if (!Array.isArray(snapshot.drafts)) fail("root.drafts must be an array when present");
  const draftIds = new Set();
  snapshot.drafts.forEach((draft, index) => {
    const path = `root.drafts[${index}]`;
    if (!isObject(draft)) fail(`${path} must be an object`);
    for (const key of ["draft_id", "pillar", "hook", "body", "status"]) requireString(draft, key, path);
    requireEnum(draft, "status", REVIEW_STATES, path);
    if (!Array.isArray(draft.channels) || draft.channels.length === 0)
      fail(`${path}.channels must be a non-empty array`);
    draft.channels.forEach((channel) => {
      if (!PLATFORMS.includes(channel)) fail(`${path}.channels contains invalid platform: ${channel}`);
    });
    if (draftIds.has(draft.draft_id)) fail(`${path}.draft_id duplicates ${draft.draft_id}`);
    draftIds.add(draft.draft_id);
    if (!isObject(draft.gate)) fail(`${path}.gate must be an object`);
    requireEnum(draft.gate, "verdict", GATE_VERDICTS, `${path}.gate`);
    requireNumber(draft.gate, "score", `${path}.gate`);
    if (!Array.isArray(draft.gate.checks)) fail(`${path}.gate.checks must be an array`);
  });
}

if (snapshot.shorts !== undefined) {
  if (!Array.isArray(snapshot.shorts)) fail("root.shorts must be an array when present");
  const shortIds = new Set();
  snapshot.shorts.forEach((short, index) => {
    const path = `root.shorts[${index}]`;
    if (!isObject(short)) fail(`${path} must be an object`);
    for (const key of ["short_id", "pillar", "title", "hook", "status"]) requireString(short, key, path);
    requireEnum(short, "status", REVIEW_STATES, path);
    if (shortIds.has(short.short_id)) fail(`${path}.short_id duplicates ${short.short_id}`);
    shortIds.add(short.short_id);
    if (!Array.isArray(short.shots)) fail(`${path}.shots must be an array`);
    short.shots.forEach((shot, shotIndex) => {
      const shotPath = `${path}.shots[${shotIndex}]`;
      if (!isObject(shot)) fail(`${shotPath} must be an object`);
      requireNumber(shot, "shot_no", shotPath);
      requireString(shot, "visual", shotPath);
      requireString(shot, "voiceover", shotPath);
      requireNumber(shot, "duration_s", shotPath);
    });
  });
}

if (snapshot.engagement !== undefined) {
  if (!Array.isArray(snapshot.engagement)) fail("root.engagement must be an array when present");
  const engIds = new Set();
  snapshot.engagement.forEach((item, index) => {
    const path = `root.engagement[${index}]`;
    if (!isObject(item)) fail(`${path} must be an object`);
    for (const key of ["item_id", "platform", "kind", "author_handle", "incoming_text", "draft_reply", "status"])
      requireString(item, key, path);
    requireEnum(item, "platform", PLATFORMS, path);
    requireEnum(item, "status", REVIEW_STATES, path);
    if (engIds.has(item.item_id)) fail(`${path}.item_id duplicates ${item.item_id}`);
    engIds.add(item.item_id);
  });
}

if (snapshot.crisis !== undefined) {
  const path = "root.crisis";
  if (!isObject(snapshot.crisis)) fail(`${path} must be an object when present`);
  requireEnum(snapshot.crisis, "status", ["calm", "watch", "active"], path);
  if (typeof snapshot.crisis.publishing_paused !== "boolean") fail(`${path}.publishing_paused must be a boolean`);
  if (!Array.isArray(snapshot.crisis.steps)) fail(`${path}.steps must be an array`);
  snapshot.crisis.steps.forEach((step, index) => {
    const stepPath = `${path}.steps[${index}]`;
    if (!isObject(step)) fail(`${stepPath} must be an object`);
    for (const key of ["step_id", "label", "detail"]) requireString(step, key, stepPath);
    if (typeof step.done !== "boolean") fail(`${stepPath}.done must be a boolean`);
  });
}

if (snapshot.share_of_voice !== undefined) {
  const path = "root.share_of_voice";
  if (!isObject(snapshot.share_of_voice)) fail(`${path} must be an object when present`);
  requireString(snapshot.share_of_voice, "window", path);
  requireNumber(snapshot.share_of_voice, "total_mentions", path);
  if (!Array.isArray(snapshot.share_of_voice.entries)) fail(`${path}.entries must be an array`);
  snapshot.share_of_voice.entries.forEach((entry, index) => {
    const entryPath = `${path}.entries[${index}]`;
    if (!isObject(entry)) fail(`${entryPath} must be an object`);
    requireString(entry, "name", entryPath);
    requireNumber(entry, "share", entryPath);
    if (typeof entry.is_self !== "boolean") fail(`${entryPath}.is_self must be a boolean`);
  });
}

console.log(`OK: ${target}`);
