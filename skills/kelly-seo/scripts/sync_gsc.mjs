#!/usr/bin/env node
// Read-only Google Search Console sync for Kelly SEO. Ported from the retired
// scripts/sync_gsc.ts, preserving the real Google API integration verbatim:
// service-account JWT signing (node:crypto), plain OAuth token support, the
// Search Analytics query shape (dimensions/rowLimit/dataState), and the GSC
// site-permission check. Only the storage layer changed — this now writes
// normalized site/query/page records into Busabase (sites/queries/pages/
// settings Bases) instead of app/.data/seo_snapshot.json.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
//
// Never required for demo mode or app startup. Usage: node scripts/sync_gsc.mjs

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import { badgesFor, ratio, round1 } from "../app/app/js/seo-model.js";

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const GSC_BASE = "https://www.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_WRITTEN_ROWS = 100; // Busabase records.list caps limit at 100.

function fail(message) {
  console.error(`kelly-seo sync: ${message}`);
  process.exit(1);
}

// ── Local config/env discovery, ported from the retired lib/common.ts ────────

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function configSearchPaths() {
  const paths = [];
  if (process.env.KELLY_SEO_CONFIG) paths.push(process.env.KELLY_SEO_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-seo", "config.json"));
  return paths;
}

function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_SEO_ENV_FILE) paths.push(process.env.KELLY_SEO_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-seo", ".env"));
  return paths;
}

async function loadDotenvFiles(files) {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file };
  }
  return { config: { sites: [] }, path: "" };
}

// ── Google Search Console client, ported verbatim from scripts/sync_gsc.ts ───

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

async function serviceAccountToken(keyFilePath) {
  let key;
  try {
    key = JSON.parse(await fs.readFile(keyFilePath, "utf8"));
  } catch (error) {
    fail(`cannot read service-account key file at ${keyFilePath}: ${error.message}`);
  }
  if (!key.client_email || !key.private_key) {
    fail(`service-account key file ${keyFilePath} is missing client_email or private_key.`);
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: key.token_uri || TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url");
  const assertion = `${unsigned}.${signature}`;
  const res = await fetch(key.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    fail(
      `token exchange failed (${res.status}): ${body.error_description || body.error || "no access_token returned"}. Check that the key is valid and the service account is added as a user on your Search Console properties.`,
    );
  }
  return body.access_token;
}

async function resolveAccessToken(config) {
  const auth = config.auth || {};
  const tokenEnv = auth.access_token_env || "KELLY_SEO_GSC_ACCESS_TOKEN";
  const fileEnv = auth.service_account_file_env || "KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE";
  const token = process.env[tokenEnv];
  const keyFile = process.env[fileEnv];
  if (token) {
    console.log(`Using OAuth access token from ${tokenEnv}.`);
    return token;
  }
  if (keyFile) {
    console.log(`Using service-account key from ${fileEnv}.`);
    return serviceAccountToken(keyFile);
  }
  fail(
    [
      "no Google Search Console credentials configured, so nothing was synced.",
      "",
      "To fix, choose one auth method:",
      `  1. Service account (recommended): set ${fileEnv}=/absolute/path/to/key.json in a local env file`,
      "     (e.g. skills/kelly-seo/.env.local) and add the service account email as a user on each",
      "     Search Console property (Settings -> Users and permissions).",
      `  2. Quick manual run: set ${tokenEnv}=<oauth token with ${SCOPE}>.`,
      "",
      "Demo mode and the local app do not need credentials: try /?demo=overview instead.",
    ].join("\n"),
  );
}

async function gscFetch(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`${url}: ${message}`);
  }
  return body;
}

function searchAnalytics(token, propertyUrl, body) {
  const url = `${GSC_BASE}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`;
  return gscFetch(token, url, { method: "POST", body: JSON.stringify(body) });
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function dateWindows(windowDays) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2); // GSC data lags ~2 days
  const currentStart = new Date(end);
  currentStart.setUTCDate(currentStart.getUTCDate() - (windowDays - 1));
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (windowDays - 1));
  return {
    current: { start: isoDay(currentStart), end: isoDay(end) },
    previous: { start: isoDay(previousStart), end: isoDay(previousEnd) },
  };
}

function shortHash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 10);
}

function slugOrHash(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || shortHash(value);
}

function rowTotals(rows) {
  const clicks = rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const weighted = rows.reduce((sum, row) => sum + (row.position || 0) * (row.impressions || 0), 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? Number((clicks / impressions).toFixed(4)) : 0,
    position: impressions ? Number((weighted / impressions).toFixed(1)) : 0,
  };
}

function toMetricRow(row) {
  return {
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: Number((row.ctr || 0).toFixed(4)),
    position: Number((row.position || 0).toFixed(1)),
  };
}

async function syncSite(token, site, windows, rowLimit, warnings) {
  const property = site.property_url;
  const query = (range, dimensions, limit = rowLimit) =>
    searchAnalytics(token, property, {
      startDate: range.start,
      endDate: range.end,
      dimensions,
      rowLimit: limit,
      dataState: "final",
    });

  const [curQueries, prevQueries, curPages, prevPages, dates, queryPages] = await Promise.all([
    query(windows.current, ["query"]),
    query(windows.previous, ["query"]),
    query(windows.current, ["page"]),
    query(windows.previous, ["page"]),
    query({ start: windows.previous.start, end: windows.current.end }, ["date"], 1000),
    query(windows.current, ["query", "page"], 1000),
  ]);

  const prevQueryMap = new Map((prevQueries.rows || []).map((row) => [row.keys[0], toMetricRow(row)]));
  const prevPageMap = new Map((prevPages.rows || []).map((row) => [row.keys[0], toMetricRow(row)]));

  const pagesByQuery = new Map();
  const queriesByPage = new Map();
  for (const row of queryPages.rows || []) {
    const [queryText, pageUrl] = row.keys;
    const entry = { ...toMetricRow(row) };
    const forQuery = pagesByQuery.get(queryText) || [];
    forQuery.push({ url: pageUrl, clicks: entry.clicks, impressions: entry.impressions, position: entry.position });
    pagesByQuery.set(queryText, forQuery);
    const forPage = queriesByPage.get(pageUrl) || [];
    forPage.push({ query: queryText, clicks: entry.clicks, impressions: entry.impressions, position: entry.position });
    queriesByPage.set(pageUrl, forPage);
  }
  const topOf = (list) => (list || []).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 5);

  const queries = (curQueries.rows || [])
    .map((row) => {
      const text = row.keys[0];
      const current = toMetricRow(row);
      return {
        query_id: `q-${site.site_id}-${slugOrHash(text)}`,
        site_id: site.site_id,
        query: text,
        ...current,
        previous: prevQueryMap.get(text) || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        badges: badgesFor(current.clicks, current.impressions, current.position),
        top_pages: topOf(pagesByQuery.get(text)),
        trend: [],
        agent_notes: "",
      };
    })
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, MAX_WRITTEN_ROWS);

  const pages = (curPages.rows || [])
    .map((row) => {
      const url = row.keys[0];
      const current = toMetricRow(row);
      return {
        page_id: `p-${site.site_id}-${slugOrHash(url.replace(/^https?:\/\//, ""))}`,
        site_id: site.site_id,
        url,
        ...current,
        previous: prevPageMap.get(url) || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        issues: [],
        top_queries: topOf(queriesByPage.get(url)),
        trend: [],
        agent_notes: "",
      };
    })
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, MAX_WRITTEN_ROWS);

  const daily = (dates.rows || []).map((row) => ({
    date: row.keys[0],
    ...toMetricRow(row),
  }));
  const currentDaily = daily.filter((point) => point.date >= windows.current.start);
  const previousDaily = daily.filter((point) => point.date < windows.current.start);
  if (!currentDaily.length) {
    warnings.push({
      id: `no-data-${site.site_id}`,
      severity: "warning",
      message: `No search analytics rows returned for ${property} in the current window.`,
      detail: "The property may be new, empty, or the account may lack access.",
    });
  }

  return {
    site: {
      site_id: site.site_id,
      property_url: property,
      verification_type: site.verification_type || "url_prefix",
      permission_level: site.permission_level || "unknown",
      status: currentDaily.length ? "ok" : "warning",
      last_sync_at: new Date().toISOString(),
      totals: rowTotals(currentDaily),
      previous: rowTotals(previousDaily),
      daily, // both windows, one row per day — embedded on the site record
    },
    queries,
    pages,
  };
}

// ── Busabase write layer ──────────────────────────────────────────────────

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

async function upsert(client, declared, idKey, idValue, existingByKey, fields, message) {
  const existing = existingByKey.get(idValue);
  if (existing) {
    return client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: toBusabaseFields(fields),
      message,
      author: "kelly-seo-sync-gsc",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
  }
  return client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: "kelly-seo-sync-gsc",
    autoMerge: true,
  });
}

async function main() {
  await loadDotenvFiles(envSearchPaths());
  const configResult = await readConfig();
  const config = configResult.config || {};
  if (!configResult.path) {
    fail(
      "no private config found (config.local.json, KELLY_SEO_CONFIG, or ~/.config/kelly-seo/config.json). Run onboarding first.",
    );
  }
  const sites = Array.isArray(config.sites) ? config.sites.filter((site) => site.site_id && site.property_url) : [];
  if (!sites.length) {
    fail(`config at ${configResult.path} has no usable sites[] entries (need site_id and property_url).`);
  }

  const token = await resolveAccessToken(config);
  const windowDays = config.sync?.window_days ?? 28;
  const rowLimit = config.sync?.row_limit ?? 250;
  const windows = dateWindows(windowDays);
  const warnings = [];

  let known = [];
  try {
    const listed = await gscFetch(token, `${GSC_BASE}/sites`);
    known = listed.siteEntry || [];
  } catch (error) {
    fail(`could not list Search Console sites: ${error.message}`);
  }
  const permissionByUrl = new Map(known.map((entry) => [entry.siteUrl, entry.permissionLevel]));
  for (const site of sites) {
    const permission = permissionByUrl.get(site.property_url);
    if (!permission) {
      warnings.push({
        id: `missing-property-${site.site_id}`,
        severity: "error",
        message: `Property ${site.property_url} is not visible to this credential.`,
        detail: "Add the service account / user to the property in Search Console (Settings -> Users and permissions).",
      });
    } else {
      site.permission_level = permission;
    }
  }
  const reachable = sites.filter((site) => permissionByUrl.has(site.property_url));
  if (!reachable.length) {
    fail("none of the configured properties are visible to this credential. Fix property access first.");
  }

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly SEO Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const results = [];
  for (const site of reachable) {
    console.log(
      `Syncing ${site.property_url} (${windows.current.start}..${windows.current.end}, prev ${windows.previous.start}..${windows.previous.end})`,
    );
    results.push(await syncSite(token, site, windows, rowLimit, warnings));
  }

  const [existingSites, existingQueries, existingPages, existingSettings] = await Promise.all([
    readAll(client, declared("sites")),
    readAll(client, declared("queries")),
    readAll(client, declared("pages")),
    readAll(client, declared("settings")),
  ]);
  const sitesByKey = new Map(existingSites.map((row) => [row.site_id, row]));
  const queriesByKey = new Map(existingQueries.map((row) => [row.query_id, row]));
  const pagesByKey = new Map(existingPages.map((row) => [row.page_id, row]));

  for (const result of results) {
    const site = result.site;
    await upsert(
      client,
      declared("sites"),
      "site_id",
      site.site_id,
      sitesByKey,
      {
        site_id: site.site_id,
        property_url: site.property_url,
        verification_type: site.verification_type,
        permission_level: site.permission_level,
        status: site.status,
        last_sync_at: site.last_sync_at,
        totals: JSON.stringify(site.totals),
        previous: JSON.stringify(site.previous),
        daily: JSON.stringify(site.daily),
      },
      `Sync ${site.property_url}`,
    );
    for (const query of result.queries) {
      await upsert(
        client,
        declared("queries"),
        "query_id",
        query.query_id,
        queriesByKey,
        {
          query_id: query.query_id,
          site_id: query.site_id,
          query: query.query,
          clicks: query.clicks,
          impressions: query.impressions,
          ctr: query.ctr,
          position: query.position,
          previous: JSON.stringify(query.previous),
          badges: JSON.stringify(query.badges),
          top_pages: JSON.stringify(query.top_pages),
          trend: JSON.stringify(query.trend),
          agent_notes: query.agent_notes,
        },
        `Sync query "${query.query}" for ${site.property_url}`,
      );
    }
    for (const page of result.pages) {
      await upsert(
        client,
        declared("pages"),
        "page_id",
        page.page_id,
        pagesByKey,
        {
          page_id: page.page_id,
          site_id: page.site_id,
          url: page.url,
          clicks: page.clicks,
          impressions: page.impressions,
          ctr: page.ctr,
          position: page.position,
          previous: JSON.stringify(page.previous),
          issues: JSON.stringify(page.issues),
          top_queries: JSON.stringify(page.top_queries),
          trend: JSON.stringify(page.trend),
          agent_notes: page.agent_notes,
        },
        `Sync page ${page.url}`,
      );
    }
  }

  // Merge the sync-owned fields (window/row-limit/range/warnings) onto the
  // settings row without touching brand/locale/ai-visibility fields, which
  // are owned by the agent's GEO workflow, never by this script.
  const currentSettings = existingSettings.find((row) => row.record_id === "config") || {};
  const settingsByKey = new Map([["config", currentSettings]]);
  await upsert(
    client,
    declared("settings"),
    "record_id",
    "config",
    settingsByKey,
    {
      record_id: "config",
      brand: currentSettings.brand || "",
      locale: currentSettings.locale || "auto",
      sync_window_days: windowDays,
      sync_row_limit: rowLimit,
      sync_read_only: "true",
      range_current_start: windows.current.start,
      range_current_end: windows.current.end,
      range_previous_start: windows.previous.start,
      range_previous_end: windows.previous.end,
      warnings: JSON.stringify(warnings),
      ai_visibility_prev_score: currentSettings.ai_visibility_prev_score || 0,
      ai_visibility_engines: currentSettings.ai_visibility_engines || "",
    },
    "Sync GSC window + warnings",
  );

  console.log(`Wrote ${results.length} site(s) to Busabase.`);
  console.log(
    `Queries: ${results.reduce((sum, r) => sum + r.queries.length, 0)}, pages: ${results.reduce((sum, r) => sum + r.pages.length, 0)}`,
  );
  if (warnings.length) {
    console.log(`Warnings: ${warnings.map((warning) => warning.message).join(" | ")}`);
  }
}

await main();
