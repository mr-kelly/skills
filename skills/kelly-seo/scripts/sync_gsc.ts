#!/usr/bin/env node
// Read-only Google Search Console sync for Kelly SEO. Zero npm dependencies.
// Auth: service-account JSON key (KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE, JWT built
// with node:crypto) or a plain OAuth token (KELLY_SEO_GSC_ACCESS_TOKEN).
// Never required for demo mode or app startup.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { badgesFor } from "../app/server/demo.ts";
import { ensureDirs, envSearchPaths, loadDotenvFiles, readConfig } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();

const GSC_BASE = "https://www.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function fail(message) {
  console.error(`kelly-seo sync: ${message}`);
  process.exit(1);
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

async function serviceAccountToken(keyFilePath) {
  let key: any;
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

async function gscFetch(token, url, options: RequestInit = {}) {
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

  const queries = (curQueries.rows || []).map((row) => {
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
  });

  const pages = (curPages.rows || []).map((row) => {
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
  });

  const daily = (dates.rows || []).map((row) => ({
    date: row.keys[0],
    site_id: site.site_id,
    ...toMetricRow(row),
  }));
  const currentDaily = daily.filter((point) => point.date >= windows.current.start);
  const previousDaily = daily.filter((point) => point.date < windows.current.start);
  if (!currentDaily.length) {
    warnings.push({
      id: `no-data-${site.site_id}`,
      severity: "warning",
      site_id: site.site_id,
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
    },
    queries,
    pages,
    daily,
  };
}

async function main() {
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const configResult = await readConfig();
  const config = configResult.config || {};
  if (configResult.is_example || !configResult.path) {
    fail(
      "no private config found (config.local.json, KELLY_SEO_CONFIG, or ~/.config/kelly-seo/config.json). Run onboarding first; config.example.json is a template only.",
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
        site_id: site.site_id,
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

  const existingLock = await provider.getLock();
  if (existingLock) {
    fail(
      `agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Another run is in progress; remove the lock only if you are sure it is stale.`,
    );
  }
  await provider.acquireLock("Syncing Google Search Console search analytics");

  try {
    const results = [];
    for (const site of reachable) {
      console.log(
        `Syncing ${site.property_url} (${windows.current.start}..${windows.current.end}, prev ${windows.previous.start}..${windows.previous.end})`,
      );
      results.push(await syncSite(token, site, windows, rowLimit, warnings));
    }
    const previousSnapshot = await provider.getSnapshot();
    const opportunities = previousSnapshot?.opportunities || [];
    const aiVisibility = previousSnapshot?.ai_visibility ?? null;
    const geoOpportunities = previousSnapshot?.geo_opportunities || [];
    const entitySignals = previousSnapshot?.entity_signals ?? null;
    const siteEntries = results.map((result) => result.site);
    const totals = rowTotals(
      results.flatMap((result) => result.daily.filter((point) => point.date >= windows.current.start)),
    );
    const prevTotals = rowTotals(
      results.flatMap((result) => result.daily.filter((point) => point.date < windows.current.start)),
    );
    const snapshot = {
      schema_version: "1",
      generated_at: new Date().toISOString(),
      source: "kelly-seo",
      range: windows,
      metrics: {
        site_count: siteEntries.length,
        query_count: results.reduce((sum, result) => sum + result.queries.length, 0),
        page_count: results.reduce((sum, result) => sum + result.pages.length, 0),
        opportunity_count: opportunities.length,
        clicks: totals.clicks,
        impressions: totals.impressions,
        ctr: totals.ctr,
        position: totals.position,
        prev_clicks: prevTotals.clicks,
        prev_impressions: prevTotals.impressions,
        prev_ctr: prevTotals.ctr,
        prev_position: prevTotals.position,
      },
      sites: siteEntries,
      daily: results.flatMap((result) => result.daily),
      queries: results.flatMap((result) => result.queries),
      pages: results.flatMap((result) => result.pages),
      opportunities,
      ai_visibility: aiVisibility,
      geo_opportunities: geoOpportunities,
      entity_signals: entitySignals,
      warnings,
    };
    await provider.writeSnapshot(snapshot);
    console.log("Wrote SEO snapshot");
    console.log(
      `Sites: ${snapshot.metrics.site_count}, queries: ${snapshot.metrics.query_count}, pages: ${snapshot.metrics.page_count}, clicks 28d: ${snapshot.metrics.clicks}`,
    );
    if (warnings.length) {
      console.log(`Warnings: ${warnings.map((warning) => warning.message).join(" | ")}`);
    }
  } catch (error) {
    await provider.releaseLock();
    fail(`sync failed: ${error.message}`);
  }
  await provider.releaseLock();
}

await main();
