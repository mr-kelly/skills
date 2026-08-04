#!/usr/bin/env node
// Trusted hand-off step. Kelly Ads' AirApp never pulls ad-platform reports
// itself — the browser cannot call Amazon/Meta/TikTok/Google Ads APIs with
// real credentials. The agent gathers a normalized JSON performance payload
// or a raw platform CSV export outside the app and feeds it to this script,
// which validates, converts currencies via the Settings row's
// `currency_rates`, merges the daily series into Busabase's campaigns Base
// by campaign_id+date (idempotent re-ingest), upserts the platforms roster,
// and appends a sync-log entry.
//
// parseCsv/slugify/toNumber/normalizeDate/payloadFromCsv/validatePayload/
// currencyRate/mergeCampaign are ported verbatim from the retired
// scripts/ingest_reports.ts; only the storage target changed, from a
// persisted app/.data/ads_snapshot.json to Busabase's platforms/campaigns/
// sync_log Bases (derived totals_7d/trend/metrics are no longer written at
// ingest time — the AirApp/scripts compute them at read time via
// app/app/js/ads-model.js's buildSnapshot()/recomputeDerived(), so this
// importer only needs to write the raw normalized campaign/platform rows).
//
// Usage:
//   node scripts/ingest_reports.mjs /path/to/performance_payload.json [--apply]
//   node scripts/ingest_reports.mjs --csv /path/to/report.csv --platform amazon [--campaign <campaign_id>] [--apply]
//
// Without --apply this is a dry run that only prints what would change.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

const PLATFORMS = new Set(["amazon", "meta", "tiktok", "google"]);
const PLATFORM_NAMES = { amazon: "Amazon Ads", meta: "Meta Ads", tiktok: "TikTok Ads", google: "Google Ads" };

function help() {
  console.log(`Usage: node scripts/ingest_reports.mjs /path/to/performance_payload.json [--apply]
       node scripts/ingest_reports.mjs --csv /path/to/report.csv --platform amazon [--campaign <campaign_id>] [--apply]

The JSON payload is normalized performance data the agent pulled from a
platform API or report export (shape documented in the header of this
file / references/ads-schema.md). CSV mode maps columns via the Settings
row's csv_mappings.<platform>. Without --apply this is a dry run that only
prints what would change.`);
}

/** @returns {never} */
function fail(message) {
  console.error(`kelly-ads ingest: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

// ---- Ported verbatim from the retired scripts/ingest_reports.ts ----

// Small CSV parser: handles quoted fields, embedded commas, escaped quotes
// ("") and CRLF line endings. Returns an array of row arrays.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
}

function parseArgs(argv) {
  const args = { csv: "", platform: "", campaign: "", payload: "", apply: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--csv") args.csv = argv[++i] || "";
    else if (argv[i] === "--platform") args.platform = argv[++i] || "";
    else if (argv[i] === "--campaign") args.campaign = argv[++i] || "";
    else if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else if (!argv[i].startsWith("--")) args.payload = argv[i];
  }
  return args;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function toNumber(value) {
  const cleaned = String(value ?? "").replaceAll(/[^0-9.-]/g, "");
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return "";
}

// Convert a platform CSV export to the JSON payload shape using the column
// mapping from the Settings row's csv_mappings[platform].
function payloadFromCsv(text, platformId, mapping, fixedCampaignId) {
  const rows = parseCsv(text);
  if (rows.length < 2) fail("CSV must contain a header row and at least one data row");
  const header = rows[0].map((cell) => String(cell).trim());
  const indexOfColumn = (name) => header.findIndex((cell) => cell.toLowerCase() === String(name || "").toLowerCase());
  const columns = {
    campaign: indexOfColumn(mapping.campaign || "Campaign Name"),
    campaign_id: indexOfColumn(mapping.campaign_id || ""),
    date: indexOfColumn(mapping.date || "Date"),
    spend: indexOfColumn(mapping.spend || "Spend"),
    impressions: indexOfColumn(mapping.impressions || "Impressions"),
    clicks: indexOfColumn(mapping.clicks || "Clicks"),
    conversions: indexOfColumn(mapping.conversions || "Conversions"),
    revenue: indexOfColumn(mapping.revenue || "Revenue"),
    currency: indexOfColumn(mapping.currency || ""),
  };
  if (columns.date < 0) fail(`CSV is missing the date column "${mapping.date || "Date"}"`);
  if (columns.spend < 0) fail(`CSV is missing the spend column "${mapping.spend || "Spend"}"`);
  if (columns.campaign < 0 && !fixedCampaignId)
    fail(`CSV is missing the campaign column "${mapping.campaign || "Campaign Name"}" (or pass --campaign)`);

  const byCampaign = new Map();
  let currency = "";
  for (const cells of rows.slice(1)) {
    const name = columns.campaign >= 0 ? String(cells[columns.campaign] || "").trim() : "";
    const campaignId =
      fixedCampaignId ||
      (columns.campaign_id >= 0 && String(cells[columns.campaign_id] || "").trim()) ||
      `${platformId}-${slugify(name)}`;
    if (!campaignId || campaignId === `${platformId}-`) continue;
    const date = normalizeDate(cells[columns.date]);
    if (!date) continue;
    if (columns.currency >= 0 && !currency)
      currency = String(cells[columns.currency] || "")
        .trim()
        .toUpperCase();
    const entry = byCampaign.get(campaignId) || { campaign_id: campaignId, name: name || campaignId, daily: new Map() };
    const day = entry.daily.get(date) || { date, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    day.spend += toNumber(cells[columns.spend]);
    if (columns.impressions >= 0) day.impressions += toNumber(cells[columns.impressions]);
    if (columns.clicks >= 0) day.clicks += toNumber(cells[columns.clicks]);
    if (columns.conversions >= 0) day.conversions += toNumber(cells[columns.conversions]);
    if (columns.revenue >= 0) day.revenue += toNumber(cells[columns.revenue]);
    entry.daily.set(date, day);
    byCampaign.set(campaignId, entry);
  }
  if (!byCampaign.size) fail("CSV produced no campaign rows; check the column mapping");
  return {
    platform: platformId,
    currency: currency || undefined,
    campaigns: [...byCampaign.values()].map((entry) => ({
      campaign_id: entry.campaign_id,
      name: entry.name,
      daily: [...entry.daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    })),
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") fail("payload must be an object");
  if (!PLATFORMS.has(payload.platform)) fail(`payload.platform must be one of: ${[...PLATFORMS].join(", ")}`);
  if (!Array.isArray(payload.campaigns) || !payload.campaigns.length)
    fail("payload.campaigns must be a non-empty array");
  payload.campaigns.forEach((campaign, index) => {
    if (!campaign.campaign_id) fail(`payload.campaigns[${index}].campaign_id is required`);
    if (!Array.isArray(campaign.daily)) fail(`payload.campaigns[${index}].daily must be an array`);
    campaign.daily.forEach((day, dayIndex) => {
      const path = `payload.campaigns[${index}].daily[${dayIndex}]`;
      if (!normalizeDate(day.date)) fail(`${path}.date must be YYYY-MM-DD`);
      requireNumber(day, "spend", path);
    });
    (campaign.targets || []).forEach((target, targetIndex) => {
      const path = `payload.campaigns[${index}].targets[${targetIndex}]`;
      if (!target.target_id) fail(`${path}.target_id is required`);
      if (!target.text) fail(`${path}.text is required`);
      requireNumber(target, "spend_14d", path);
    });
  });
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function currencyRate(rates, from, base) {
  if (!from || from === base) return { rate: 1, known: true };
  const rate = Number(rates[from]);
  if (Number.isFinite(rate) && rate > 0) return { rate, known: true };
  return { rate: 1, known: false };
}

function mergeCampaign(existing, incoming, rate) {
  const campaign = existing || {
    campaign_id: incoming.campaign_id,
    platform: "",
    name: incoming.campaign_id,
    product: "",
    sku: "",
    status: "active",
    daily_budget: 0,
    budget_spent_today_pct: 0,
    acos_target_pct: 0,
    currency: "",
    daily: [],
    targets: [],
  };
  for (const key of ["name", "product", "sku", "status"]) {
    if (incoming[key] !== undefined && incoming[key] !== "") campaign[key] = incoming[key];
  }
  for (const key of ["daily_budget", "budget_spent_today_pct", "acos_target_pct"]) {
    if (typeof incoming[key] === "number") campaign[key] = incoming[key];
  }
  const byDate = new Map((campaign.daily || []).map((day) => [day.date, day]));
  for (const day of incoming.daily || []) {
    const date = normalizeDate(day.date);
    byDate.set(date, {
      date,
      spend: round2(Number(day.spend || 0) * rate),
      impressions: Math.round(Number(day.impressions || 0)),
      clicks: Math.round(Number(day.clicks || 0)),
      conversions: Math.round(Number(day.conversions || 0)),
      revenue: round2(Number(day.revenue || 0) * rate),
    });
  }
  campaign.daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (Array.isArray(incoming.targets) && incoming.targets.length) {
    const byTarget = new Map((campaign.targets || []).map((target) => [target.target_id, target]));
    for (const target of incoming.targets) {
      const spend = round2(Number(target.spend_14d || 0) * rate);
      const revenue = round2(Number(target.revenue || 0) * rate);
      byTarget.set(target.target_id, {
        target_id: target.target_id,
        type: target.type || "search_term",
        text: target.text,
        match_type: target.match_type || "",
        state: target.state || "enabled",
        spend_14d: spend,
        clicks: Math.round(Number(target.clicks || 0)),
        conversions: Math.round(Number(target.conversions || 0)),
        revenue,
        cpc: Number(target.clicks) > 0 ? round2(spend / Number(target.clicks)) : 0,
        acos_pct: revenue > 0 ? round1((spend / revenue) * 100) : 0,
      });
    }
    campaign.targets = [...byTarget.values()];
  }
  campaign.last_sync_at = new Date().toISOString();
  return campaign;
}

// ---- Busabase plumbing ----

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

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

async function upsertRow(client, declared, existingByKey, keyValue, fields, message, apply) {
  const existing = existingByKey.get(keyValue);
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-ads-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-ads-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.payload && !args.csv)) return help();
  const apply = args.apply;

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Ads Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [existingCampaigns, existingPlatforms, settingsRows] = await Promise.all([
    readAll(client, declared("campaigns")),
    readAll(client, declared("platforms")),
    readAll(client, declared("settings")),
  ]);
  /** @type {Record<string, any>} */
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const base = settings.currency || "USD";
  const rates = parseJsonValue(settings.currency_rates, {}) || {};
  const csvMappings = parseJsonValue(settings.csv_mappings, {}) || {};

  let payload;
  if (args.csv) {
    if (!PLATFORMS.has(args.platform)) fail(`--platform must be one of: ${[...PLATFORMS].join(", ")}`);
    const text = await fs
      .readFile(args.csv, "utf8")
      .catch((error) => fail(`cannot read CSV at ${args.csv}: ${error.message}`));
    payload = payloadFromCsv(text, args.platform, csvMappings[args.platform] || {}, args.campaign);
  } else {
    const raw = await fs
      .readFile(args.payload, "utf8")
      .catch((error) => fail(`cannot read payload JSON at ${args.payload}: ${error.message}`));
    payload = JSON.parse(raw);
  }
  validatePayload(payload);

  const from = String(payload.currency || base).toUpperCase();
  const { rate, known } = currencyRate(rates, from, base);
  if (!known) {
    console.log(
      `warning: no currency rate configured for ${from}; amounts kept 1:1. Add it to Settings.currency_rates.`,
    );
  }

  const campaignsByKey = new Map(existingCampaigns.map((row) => [row.campaign_id, row]));
  let merged = 0;
  let days = 0;
  for (const incoming of payload.campaigns) {
    const existingRow = campaignsByKey.get(incoming.campaign_id);
    const existingParsed = existingRow
      ? {
          ...existingRow,
          daily: parseJsonValue(existingRow.daily, []) || [],
          targets: parseJsonValue(existingRow.targets, []) || [],
        }
      : null;
    const campaign = mergeCampaign(existingParsed, incoming, rate);
    campaign.platform = payload.platform;
    campaign.currency = base;
    const fields = { ...campaign, daily: JSON.stringify(campaign.daily), targets: JSON.stringify(campaign.targets) };
    const outcome = await upsertRow(
      client,
      declared("campaigns"),
      campaignsByKey,
      incoming.campaign_id,
      fields,
      `Ingest ${payload.platform} campaign ${incoming.campaign_id}`,
      apply,
    );
    console.log(`  campaign ${incoming.campaign_id}: ${outcome}`);
    merged += 1;
    days += (incoming.daily || []).length;
  }

  const platformsByKey = new Map(existingPlatforms.map((row) => [row.platform_id, row]));
  const existingPlatform = platformsByKey.get(payload.platform);
  const platformFields = existingPlatform
    ? { ...existingPlatform, last_sync_at: new Date().toISOString() }
    : {
        platform_id: payload.platform,
        name: PLATFORM_NAMES[payload.platform] || payload.platform,
        account_id: "",
        status: "ok",
        currency: base,
        last_sync_at: new Date().toISOString(),
      };
  await upsertRow(
    client,
    declared("platforms"),
    platformsByKey,
    payload.platform,
    platformFields,
    `Update platform ${payload.platform} last_sync_at`,
    apply,
  );

  if (typeof payload.spend_last_month === "number") {
    const settingsRow = settingsRows.find((row) => row.record_id === "config");
    const settingsByKey = new Map(settingsRows.map((row) => [row.record_id, row]));
    await upsertRow(
      client,
      declared("settings"),
      settingsByKey,
      "config",
      { ...settings, record_id: "config", spend_last_month: round2(payload.spend_last_month * rate) },
      "Update spend_last_month from ingest payload",
      apply,
    );
  }

  const now = new Date().toISOString();
  const syncId = `sync-${payload.platform}-${now.slice(0, 10)}`;
  const syncLogRows = await readAll(client, declared("sync_log"));
  const syncLogByKey = new Map(syncLogRows.map((row) => [row.sync_id, row]));
  await upsertRow(
    client,
    declared("sync_log"),
    syncLogByKey,
    syncId,
    {
      sync_id: syncId,
      at: now,
      platform: payload.platform,
      kind: "ingest",
      message: `${PLATFORM_NAMES[payload.platform] || payload.platform} report ingested: ${merged} campaign(s), ${days} daily row(s)${from !== base ? `, ${from}→${base}` : ""}.`,
      rows: days,
    },
    `Sync log entry ${syncId}`,
    apply,
  );

  console.log(`${apply ? "Wrote" : "Dry run for"} the Busabase platforms/campaigns/sync_log Bases`);
  console.log(`  ingested ${merged} campaign(s) (${days} daily rows) for ${payload.platform}`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
  else console.log("Next: node scripts/run_checks.mjs to refresh the anomaly queue.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
