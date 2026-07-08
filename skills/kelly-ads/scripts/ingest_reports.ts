#!/usr/bin/env node
// Single write-path for ad performance data. The agent gathers a payload JSON
// (from platform APIs/exports it pulled outside the app) or a raw platform
// CSV export, and this script validates, normalizes currency, merges daily
// series by campaign+date (idempotent re-ingest), and appends the sync log.
//
// Usage:
//   node scripts/ingest_reports.ts /path/to/performance_payload.json
//   node scripts/ingest_reports.ts --csv /path/to/report.csv --platform amazon [--campaign <campaign_id>]
//
// JSON payload shape:
// {
//   "platform": "amazon",
//   "currency": "USD",
//   "spend_last_month": 5840.22,            // optional
//   "campaigns": [
//     {
//       "campaign_id": "amz-sp-auto-lunchbox",
//       "name": "SP Auto — Silicone Bento Lunchbox",
//       "product": "Silicone Bento Lunchbox", "sku": "NH-LB-01",
//       "status": "active", "daily_budget": 35, "budget_spent_today_pct": 54,
//       "acos_target_pct": 25,
//       "daily": [ { "date": "2026-07-01", "spend": 28.4, "impressions": 1350, "clicks": 30, "conversions": 5, "revenue": 124.5 } ],
//       "targets": [ { "target_id": "t1", "type": "search_term", "text": "kids bento box", "match_type": "broad", "state": "enabled", "spend_14d": 96.4, "clicks": 74, "conversions": 14, "revenue": 348.6 } ]
//     }
//   ]
// }
//
// CSV mode maps columns via config.csv_mappings[<platform>].
import fs from "node:fs/promises";
import { createProvider } from "../lib/data-provider/index.ts";
import {
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  pushSyncLog,
  readConfig,
  readJson,
  recomputeDerived,
  round1,
  round2,
} from "../lib/data-provider/index.ts";
import { snapshotPath } from "../lib/paths.ts";
import type { Campaign } from "../lib/types.ts";

const OWNER = "kelly-ads-ingest";
const PLATFORMS = new Set(["amazon", "meta", "tiktok", "google"]);
const PLATFORM_NAMES = { amazon: "Amazon Ads", meta: "Meta Ads", tiktok: "TikTok Ads", google: "Google Ads" };

function fail(message) {
  console.error(`ingest_reports: ${message}`);
  process.exit(1);
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

// Small CSV parser: handles quoted fields, embedded commas, escaped quotes
// ("") and CRLF line endings. Returns an array of row arrays.
export function parseCsv(text) {
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
  const args = { csv: "", platform: "", campaign: "", payload: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--csv") args.csv = argv[++i] || "";
    else if (argv[i] === "--platform") args.platform = argv[++i] || "";
    else if (argv[i] === "--campaign") args.campaign = argv[++i] || "";
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
// mapping from config.csv_mappings[platform].
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

function currencyRate(config, from, base) {
  if (!from || from === base) return { rate: 1, known: true };
  const rates = config.currency_rates || {};
  const rate = Number(rates[from]);
  if (Number.isFinite(rate) && rate > 0) return { rate, known: true };
  return { rate: 1, known: false };
}

function mergeCampaign(existing: Campaign | null | undefined, incoming: Record<string, any>, rate: number): Campaign {
  const campaign: Campaign = existing || {
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.payload && !args.csv) {
    console.log("Usage: node scripts/ingest_reports.ts /path/to/performance_payload.json");
    console.log(
      "       node scripts/ingest_reports.ts --csv /path/to/report.csv --platform amazon [--campaign <campaign_id>]",
    );
    console.log("The payload is performance data the agent pulled from platform APIs or report exports.");
    return;
  }
  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const provider = await createProvider();
  const configResult = await readConfig();
  const config = configResult.config || {};

  let payload: Record<string, any> | null;
  if (args.csv) {
    if (!PLATFORMS.has(args.platform)) fail(`--platform must be one of: ${[...PLATFORMS].join(", ")}`);
    const text = await fs
      .readFile(args.csv, "utf8")
      .catch((error) => fail(`cannot read CSV at ${args.csv}: ${error.message}`));
    const mapping = config.csv_mappings?.[args.platform] || {};
    payload = payloadFromCsv(text, args.platform, mapping, args.campaign);
  } else {
    payload = await readJson<Record<string, any>>(args.payload, null);
    if (!payload) fail(`cannot read payload JSON at ${args.payload}`);
  }
  validatePayload(payload);

  const base = config.currency || "USD";
  const from = String(payload.currency || base).toUpperCase();
  const { rate, known } = currencyRate(config, from, base);

  try {
    await provider.acquireLock(OWNER, `Ingesting ${payload.platform} performance report`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  try {
    const snapshot = await provider.readSnapshot();
    const now = new Date().toISOString();
    snapshot.campaigns = Array.isArray(snapshot.campaigns) ? snapshot.campaigns : [];
    snapshot.platforms = Array.isArray(snapshot.platforms) ? snapshot.platforms : [];

    let merged = 0;
    let days = 0;
    for (const incoming of payload.campaigns) {
      const index = snapshot.campaigns.findIndex((campaign) => campaign.campaign_id === incoming.campaign_id);
      const campaign = mergeCampaign(index >= 0 ? snapshot.campaigns[index] : null, incoming, rate);
      campaign.platform = payload.platform;
      campaign.currency = base;
      if (index >= 0) snapshot.campaigns[index] = campaign;
      else snapshot.campaigns.push(campaign);
      merged += 1;
      days += (incoming.daily || []).length;
    }

    let platform = snapshot.platforms.find((item) => item.platform_id === payload.platform);
    if (!platform) {
      const configured = (config.platforms || []).find((item) => item.platform_id === payload.platform) || {};
      platform = {
        platform_id: payload.platform,
        name: configured.name || PLATFORM_NAMES[payload.platform] || payload.platform,
        account_id: configured.account_id || "",
        status: "ok",
        currency: base,
      };
      snapshot.platforms.push(platform);
    }
    platform.last_sync_at = now;

    if (typeof payload.spend_last_month === "number") {
      snapshot.metrics.spend_last_month = round2(payload.spend_last_month * rate);
    }

    snapshot.generated_at = now;
    snapshot.source = "kelly-ads";
    snapshot.currency = base;
    snapshot.warnings = (snapshot.warnings || []).filter(
      (warning) => warning.id !== "no-snapshot" && warning.id !== `unknown-currency-${payload.platform}`,
    );
    if (!known) {
      snapshot.warnings.push({
        id: `unknown-currency-${payload.platform}`,
        severity: "warning",
        message: `No currency rate configured for ${from}; amounts were kept 1:1. Add it to config.currency_rates.`,
      });
    }
    pushSyncLog(snapshot, {
      sync_id: `sync-${payload.platform}-${now.slice(0, 10)}`,
      at: now,
      platform: payload.platform,
      kind: "ingest",
      message: `${PLATFORM_NAMES[payload.platform] || payload.platform} report ingested: ${merged} campaign(s), ${days} daily row(s)${from !== base ? `, ${from}→${base}` : ""}.`,
      rows: days,
    });
    recomputeDerived(snapshot, config);
    await provider.writeSnapshot(snapshot);
    console.log(`Ingested ${merged} campaign(s) (${days} daily rows) for ${payload.platform}.`);
    console.log(`Wrote ${snapshotPath}`);
  } finally {
    await provider.releaseLock();
  }
}

await main();
