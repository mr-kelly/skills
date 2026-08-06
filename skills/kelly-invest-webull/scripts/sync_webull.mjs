#!/usr/bin/env node
// Trusted hand-off step. Kelly Invest (Webull)'s AirApp is read-only (see
// app/app/js/config.js — readOnly: true, writeProcedures: []); this script is
// the only process that ever writes account/position rows. It reads Webull
// holdings via the official webull-openapi-python-sdk (Node has no
// first-party Webull SDK, so this shells out to scripts/webull_bridge.py —
// see that file's header for why), maps them with the exact field-mapping
// logic ported verbatim from the retired lib/data-provider/webull.ts into
// app/app/js/webull-model.js (mapAccount/mapPosition/resolveWebullCredentials),
// and writes normalized Accounts/Positions rows plus a sanitized Settings
// config summary to Busabase.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
//
// READ-ONLY BOUNDARY: this script must never place, modify, or cancel
// orders, and never move money. It only reads account/balance/position data
// from Webull and mirrors it into Busabase.
//
// Live network access to Webull is NOT available in this environment (no
// approved App Key/App Secret, no webull-openapi-python-sdk install target
// reachable) — see scripts/webull_bridge.py's header and the skill's README
// for how to run this for real once credentials are provisioned. For local
// testing without live credentials, pass --fixture <path/to/raw.json> with a
// JSON payload shaped like { "accounts": [...], "positions": [...] } using
// the raw Webull SDK field names (accountId/accountType/... ,
// symbol/quantity/costPrice/...) documented in webull-model.js.
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import { mapAccount, mapPosition, resolveWebullCredentials } from "../app/app/js/webull-model.js";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`kelly-invest-webull sync: ${message}`);
  process.exit(1);
}

// ── Local config/env discovery, ported from the retired app/server/store.ts ──

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
  if (process.env.KELLY_INVEST_WEBULL_CONFIG) paths.push(process.env.KELLY_INVEST_WEBULL_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-invest-webull", "config.json"));
  return paths;
}

function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_INVEST_WEBULL_ENV_FILE) paths.push(process.env.KELLY_INVEST_WEBULL_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-invest-webull", ".env"));
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
  return { config: {}, path: "" };
}

// ── Webull fetch: either a local fixture (tests / offline runs) or the
// official Python SDK via scripts/webull_bridge.py. ────────────────────────

async function fetchWebullPortfolio(credentials, fixturePath) {
  if (fixturePath) {
    const fixture = await readJson(path.resolve(fixturePath), null);
    if (!fixture) fail(`could not read fixture at ${fixturePath}`);
    return { accounts: fixture.accounts || [], positions: fixture.positions || [] };
  }
  if (!credentials.appKey || !credentials.appSecret) {
    fail(
      [
        "no Webull App Key/App Secret configured, so nothing was synced.",
        "",
        "To fix: set the env vars named by config.webull.app_key_env / app_secret_env",
        "(defaults: KELLY_INVEST_WEBULL_APP_KEY / KELLY_INVEST_WEBULL_APP_SECRET) in a",
        "local env file (e.g. skills/kelly-invest-webull/.env.local), then re-run.",
        "",
        "For a credential-free dry run, pass --fixture <path/to/raw.json> instead.",
      ].join("\n"),
    );
  }
  const bridge = spawnSync("python3", [path.join(SKILL_DIR, "scripts", "webull_bridge.py")], {
    env: {
      ...process.env,
      WEBULL_APP_KEY: credentials.appKey,
      WEBULL_APP_SECRET: credentials.appSecret,
      WEBULL_REGION: credentials.region,
      WEBULL_BASE_URL: credentials.baseUrl,
    },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (bridge.error) fail(`could not launch python3 (${bridge.error.message}); is Python 3 installed?`);
  let payload;
  try {
    payload = JSON.parse(bridge.stdout || "{}");
  } catch {
    fail(`webull_bridge.py did not return valid JSON.\nstdout: ${bridge.stdout}\nstderr: ${bridge.stderr}`);
  }
  if (payload.error) {
    fail(`${payload.error}\nInstall/verify the official webull-openapi-python-sdk, or use --fixture for testing.`);
  }
  return { accounts: payload.accounts || [], positions: payload.positions || [] };
}

// ── Busabase write layer, same upsert shape as the other trusted sync
// scripts in this repo (kelly-seo's sync_gsc.mjs). ──────────────────────────

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

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

async function upsert(client, declared, idValue, existingByKey, fields, message) {
  const existing = existingByKey.get(idValue);
  if (existing?.__recordId) {
    return client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: toBusabaseFields(fields),
      message,
      author: "kelly-invest-webull-sync",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
  }
  return client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: toBusabaseFields(fields),
    message,
    submittedBy: "kelly-invest-webull-sync",
    autoMerge: true,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const fixtureIndex = args.indexOf("--fixture");
  const fixturePath = fixtureIndex >= 0 ? args[fixtureIndex + 1] : "";

  await loadDotenvFiles(envSearchPaths());
  const configResult = await readConfig();
  const config = configResult.config || {};
  const credentials = resolveWebullCredentials(config);
  const allowlist = new Set(credentials.allowlist);

  const raw = await fetchWebullPortfolio(credentials, fixturePath);

  const accounts = raw.accounts
    .map((rawAccount) => mapAccount(rawAccount))
    .filter((account) => !allowlist.size || allowlist.has(account.account_id));
  const allowedAccountIds = new Set(accounts.map((account) => account.account_id));
  const positions = raw.positions
    .map((rawPosition) => mapPosition(rawPosition, rawPosition.account_id ?? rawPosition.accountId ?? ""))
    .filter((position) => !allowedAccountIds.size || allowedAccountIds.has(position.account_id));

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Invest (Webull) Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [existingAccounts, existingPositions, existingSettings] = await Promise.all([
    readAll(client, declared("accounts")),
    readAll(client, declared("positions")),
    readAll(client, declared("settings")),
  ]);
  const accountsByKey = new Map(existingAccounts.map((row) => [row.account_id, row]));
  const positionsByKey = new Map(existingPositions.map((row) => [row.position_id, row]));

  for (const account of accounts) {
    await upsert(
      client,
      declared("accounts"),
      account.account_id,
      accountsByKey,
      {
        account_id: account.account_id,
        account_type: account.account_type,
        display_name: account.display_name,
        currency: account.currency,
        net_liquidation: account.net_liquidation,
        total_cash: account.total_cash,
        buying_power: account.buying_power,
      },
      `Sync account ${account.account_id}`,
    );
  }
  for (const position of positions) {
    const position_id = `${position.account_id}:${position.symbol}`;
    await upsert(
      client,
      declared("positions"),
      position_id,
      positionsByKey,
      {
        position_id,
        symbol: position.symbol,
        name: position.name,
        asset_type: position.asset_type,
        account_id: position.account_id,
        quantity: position.quantity,
        avg_cost: position.avg_cost,
        last_price: position.last_price,
        market_value: position.market_value,
        cost_basis: position.cost_basis,
        unrealized_pnl: position.unrealized_pnl,
        unrealized_pnl_pct: position.unrealized_pnl_pct,
        day_change: position.day_change,
        day_change_pct: position.day_change_pct,
        currency: position.currency,
      },
      `Sync position ${position_id}`,
    );
  }

  const existingConfig = existingSettings.find((row) => row.record_id === "config") || {};
  const configByKey = new Map([["config", existingConfig]]);
  const generated_at = new Date().toISOString();
  await upsert(
    client,
    declared("settings"),
    "config",
    configByKey,
    {
      record_id: "config",
      kind: "config",
      name: "Kelly Invest (Webull) config",
      payload: JSON.stringify({
        base_currency: config.base_currency || "USD",
        target_allocation: config.target_allocation || undefined,
        snapshot_id: `webull-${Date.now()}`,
        generated_at,
        source: "kelly-invest-webull",
        warnings: [],
        webull: {
          region: credentials.region,
          base_url: credentials.baseUrl,
          account_allowlist: [...allowlist],
          secrets_ready: Boolean(credentials.appKey && credentials.appSecret),
        },
      }),
      updated_at: generated_at,
    },
    "Sync Webull config summary",
  );

  const existingOnboarding = existingSettings.find((row) => row.record_id === "onboarding") || {};
  const onboardingByKey = new Map([["onboarding", existingOnboarding]]);
  await upsert(
    client,
    declared("settings"),
    "onboarding",
    onboardingByKey,
    {
      record_id: "onboarding",
      kind: "onboarding",
      name: "Onboarding",
      payload: JSON.stringify({ completed: true, completed_at: generated_at, config_version: "1" }),
      updated_at: generated_at,
    },
    "Mark Kelly Invest (Webull) onboarding complete",
  );

  console.log(
    JSON.stringify(
      {
        synced_at: generated_at,
        accounts: accounts.length,
        positions: positions.length,
        fixture: Boolean(fixturePath),
      },
      null,
      2,
    ),
  );
}

await main();
