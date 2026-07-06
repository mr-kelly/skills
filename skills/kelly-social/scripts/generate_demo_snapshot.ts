#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { snapshotPath } from "../lib/paths.ts";

const out = snapshotPath;
const now = new Date().toISOString();

const accounts = [
  account(
    "x-main",
    "x",
    "@example_builder",
    "Example Builder",
    "https://x.com/example_builder",
    "browser_agent",
    {
      followers: 1840,
      following: 320,
      posts: 412,
      impressions_7d: 24800,
      impressions_28d: 88200,
      engagements_7d: 1120,
      engagement_rate_7d: 0.0452,
      profile_visits_7d: 260,
      followers_delta_7d: 34,
      followers_delta_28d: 118,
    },
    [1680, 1702, 1731, 1756, 1774, 1790, 1806, 1840],
  ),
  account(
    "instagram-main",
    "instagram",
    "@example.builder",
    "Example Builder Studio",
    "https://instagram.com/example.builder",
    "manual_export",
    {
      followers: 620,
      following: 210,
      posts: 88,
      impressions_7d: 5400,
      impressions_28d: 19800,
      engagements_7d: 310,
      engagement_rate_7d: 0.0574,
      profile_visits_7d: 88,
      followers_delta_7d: 9,
      followers_delta_28d: 31,
    },
    [560, 568, 574, 582, 589, 598, 611, 620],
  ),
  account(
    "facebook-page",
    "facebook",
    "Example Builder Page",
    "Example Builder Page",
    "https://facebook.com/examplebuilder",
    "api",
    {
      followers: 340,
      following: 0,
      posts: 120,
      impressions_7d: 1450,
      impressions_28d: 5200,
      engagements_7d: 72,
      engagement_rate_7d: 0.0497,
      profile_visits_7d: 24,
      followers_delta_7d: 3,
      followers_delta_28d: 11,
    },
    [318, 320, 323, 326, 329, 332, 336, 340],
  ),
];

const posts = [
  post(
    "x-demo-1",
    "x",
    "x-main",
    daysAgo(1),
    "Shipped the follower sparkline today. Zero chart libraries, 14 lines of SVG.",
    "image",
    1,
    "https://x.com/example_builder/status/1",
    { likes: 42, replies: 6, reposts: 5, views: 3900, saves: 0, clicks: 12 },
    "post",
  ),
  post(
    "x-demo-2",
    "x",
    "x-main",
    daysAgo(3),
    "Build-in-public update: 3 new users this week, one churn, one very kind email.",
    "none",
    0,
    "https://x.com/example_builder/status/2",
    { likes: 61, replies: 11, reposts: 8, views: 5200, saves: 0, clicks: 0 },
    "post",
  ),
  post(
    "x-demo-3",
    "x",
    "x-main",
    daysAgo(5),
    "Thread: everything I learned parsing three platforms' analytics exports. 🧵",
    "none",
    0,
    "https://x.com/example_builder/status/3",
    { likes: 148, replies: 24, reposts: 37, views: 16400, saves: 0, clicks: 84 },
    "thread",
  ),
  post(
    "ig-demo-1",
    "instagram",
    "instagram-main",
    daysAgo(2),
    "Desk tour reel: where the dashboards get built.",
    "video",
    1,
    "https://instagram.com/p/demo1",
    { likes: 96, replies: 9, reposts: 6, views: 1850, saves: 14, clicks: 0 },
    "reel",
  ),
  post(
    "ig-demo-2",
    "instagram",
    "instagram-main",
    daysAgo(4),
    "Launch carousel: 5 slides on the new timeline view.",
    "carousel",
    5,
    "https://instagram.com/p/demo2",
    { likes: 64, replies: 5, reposts: 4, views: 1210, saves: 22, clicks: 0 },
    "post",
  ),
  post(
    "fb-demo-1",
    "facebook",
    "facebook-page",
    daysAgo(2),
    "Office hours Friday. Bring questions about the aggregator.",
    "none",
    0,
    "https://facebook.com/examplebuilder/posts/1",
    { likes: 12, replies: 4, reposts: 1, views: 420, saves: 0, clicks: 0 },
    "post",
  ),
];

const sync_log = [
  syncEntry(
    "sync-x-demo",
    "x-main",
    "browser_agent",
    daysAgo(0.05),
    "ok",
    3,
    "Demo collection entry; no live platform was touched.",
  ),
  syncEntry(
    "sync-ig-demo",
    "instagram-main",
    "manual_export",
    daysAgo(1.1),
    "ok",
    2,
    "Demo export parse entry; no live platform was touched.",
  ),
  syncEntry(
    "sync-fb-demo",
    "facebook-page",
    "api",
    daysAgo(0.06),
    "ok",
    1,
    "Demo API entry; no live platform was touched.",
  ),
];

const metrics = accounts.reduce(
  (acc, item) => {
    acc.total_followers += item.metrics.followers;
    acc.followers_delta_7d += item.metrics.followers_delta_7d;
    acc.followers_delta_28d += item.metrics.followers_delta_28d;
    acc.impressions_7d += item.metrics.impressions_7d;
    acc.engagements_7d += item.metrics.engagements_7d;
    return acc;
  },
  {
    account_count: accounts.length,
    post_count: posts.length,
    total_followers: 0,
    followers_delta_7d: 0,
    followers_delta_28d: 0,
    impressions_7d: 0,
    engagements_7d: 0,
    engagement_rate_7d: 0,
  },
);
metrics.engagement_rate_7d =
  metrics.impressions_7d > 0 ? Number((metrics.engagements_7d / metrics.impressions_7d).toFixed(4)) : 0;

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(
  out,
  JSON.stringify(
    {
      schema_version: "1",
      generated_at: now,
      source: "kelly-social-demo",
      range: { start: dateOnly(daysAgo(28)), end: dateOnly(now) },
      metrics,
      accounts,
      posts,
      sync_log,
      warnings: [],
    },
    null,
    2,
  ),
);

console.log(`Wrote ${out}`);

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function dateOnly(iso) {
  return String(iso).slice(0, 10);
}

function account(account_id, platform, handle, display_name, profile_url, collection, metrics, seriesValues) {
  return {
    account_id,
    platform,
    handle,
    display_name,
    profile_url,
    collection,
    status: "ok",
    metrics,
    follower_series: seriesValues.map((followers, index) => ({
      date: dateOnly(daysAgo((seriesValues.length - 1 - index) * 7)),
      followers,
    })),
    traffic_sources: [],
    last_sync_at: now,
    notes: "",
  };
}

function post(post_id, platform, account_id, posted_at, text, media, media_count, permalink, postMetrics, type) {
  const engagements = postMetrics.likes + postMetrics.replies + postMetrics.reposts + (postMetrics.saves || 0);
  return {
    post_id,
    platform,
    account_id,
    provider_post_id: post_id,
    posted_at,
    type,
    text,
    media,
    media_count,
    permalink,
    metrics: postMetrics,
    engagement_rate: postMetrics.views > 0 ? Number((engagements / postMetrics.views).toFixed(4)) : 0,
    agent_notes: "",
    tags: [],
  };
}

function syncEntry(sync_id, account_id, method, started_at, status, posts_collected, message) {
  return {
    sync_id,
    account_id,
    method,
    started_at,
    completed_at: started_at,
    status,
    posts_collected,
    message,
    actor: "kelly-social-demo",
  };
}
