// Shared, backend-neutral helpers for the kelly-seo data layer.
//
// These are the pieces both providers AND the batch scripts need but that are not
// themselves provider state: JSON file IO, config/dotenv discovery + summary, the
// empty-snapshot seed, and the pure opportunity-merge used to fold decisions and
// the execution report back onto the snapshot for /api/state.

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, SKILL_DIR } from "./paths.ts";
import type { Config, ProviderMeta, SeoSnapshot } from "./types.ts";

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function emptySnapshot(): SeoSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-seo",
    range: {
      current: { start: "", end: "" },
      previous: { start: "", end: "" },
    },
    metrics: {
      site_count: 0,
      query_count: 0,
      page_count: 0,
      opportunity_count: 0,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
      prev_clicks: 0,
      prev_impressions: 0,
      prev_ctr: 0,
      prev_position: 0,
    },
    sites: [],
    daily: [],
    queries: [],
    pages: [],
    opportunities: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No SEO snapshot exists yet. Configure site properties, then run a read-only GSC sync.",
      },
    ],
    ai_visibility: null,
    geo_opportunities: [],
    entity_signals: null,
  };
}

export function mergeOpportunities(snapshot, decisions, executionReport) {
  const verdicts = decisions?.decisions || {};
  const execById = new Map();
  for (const result of executionReport?.results || []) {
    if (result?.id) execById.set(result.id, result);
  }
  const opportunities = (snapshot.opportunities || []).map((opportunity) => {
    const decision = verdicts[opportunity.id] || opportunity.decision || null;
    const reportEntry = execById.get(opportunity.id);
    const execution =
      opportunity.execution ||
      (reportEntry
        ? {
            status: reportEntry.status,
            operation: reportEntry.operation,
            target: reportEntry.target_page || reportEntry.target_query || "",
            detail: reportEntry.detail || "",
            executed_at: executionReport?.generated_at || "",
          }
        : null);
    let status = opportunity.status;
    if (decision?.action === "approve") status = "approved";
    if (decision?.action === "request_changes") status = "changes_requested";
    if (decision?.action === "block") status = "blocked";
    if (execution?.status === "executed") status = "done";
    return {
      ...opportunity,
      status,
      decision,
      draft: decision?.draft ?? opportunity.draft,
      execution,
    };
  });
  return { ...snapshot, opportunities };
}

// Fold GEO decisions (geo_decisions.json) back onto the snapshot's
// geo_opportunities the same way mergeOpportunities does for SEO. A GEO change
// that geo-qa BLOCKs can never be approved, so approve degrades to blocked.
export function mergeGeoOpportunities(snapshot, geoDecisions) {
  const verdicts = geoDecisions?.decisions || {};
  const geoOpportunities = (snapshot.geo_opportunities || []).map((opportunity) => {
    const decision = verdicts[opportunity.id] || opportunity.decision || null;
    let status = opportunity.status;
    if (decision?.action === "approve") status = "approved";
    if (decision?.action === "request_changes") status = "changes_requested";
    if (decision?.action === "block") status = "blocked";
    // A shipped GEO change (executed) stays done regardless of its decision.
    if (opportunity.execution?.status === "executed") status = "done";
    // geo-qa is a hard gate: a BLOCK verdict overrides everything but done.
    if (opportunity.gate?.verdict === "BLOCK" && status !== "done") status = "blocked";
    return {
      ...opportunity,
      status,
      decision,
      draft: decision?.draft ?? opportunity.draft,
    };
  });
  return { ...snapshot, geo_opportunities: geoOpportunities };
}

export async function loadDotenvFiles(files) {
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

export function configSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_SEO_CONFIG) paths.push(process.env.KELLY_SEO_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-seo", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_SEO_ENV_FILE) paths.push(process.env.KELLY_SEO_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-seo", ".env"));
  return paths;
}

export async function readConfig(): Promise<ProviderMeta> {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { sites: [] }, path: "", is_example: false };
}

export function resolveProviderKind(config: Config = {}) {
  return String(process.env.KELLY_SEO_DATA_PROVIDER || config.data_provider || "local").toLowerCase();
}

export function summarizeConfig(configResult: ProviderMeta) {
  const config = configResult.config || {};
  const sites = Array.isArray(config.sites) ? config.sites : [];
  const auth = config.auth || {};
  const serviceAccountEnv = auth.service_account_file_env || "KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE";
  const accessTokenEnv = auth.access_token_env || "KELLY_SEO_GSC_ACCESS_TOKEN";
  const serviceAccountPath = process.env[serviceAccountEnv] || "";
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    sites: sites.map((site) => ({
      site_id: site.site_id || "",
      property_url: site.property_url || "",
      verification_type: site.verification_type || "url_prefix",
    })),
    auth: {
      method: auth.method || "service_account",
      service_account_file_env: serviceAccountEnv,
      service_account_ready: Boolean(serviceAccountPath) && existsSync(serviceAccountPath),
      access_token_env: accessTokenEnv,
      access_token_ready: Boolean(process.env[accessTokenEnv]),
    },
    sync: {
      window_days: config.sync?.window_days ?? 28,
      compare_previous_period: config.sync?.compare_previous_period ?? true,
      row_limit: config.sync?.row_limit ?? 250,
      read_only: config.sync?.read_only ?? true,
    },
  };
}
