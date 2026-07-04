import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH
} from "./paths.mjs";

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

export async function readSnapshot() {
  return readJson(SNAPSHOT_PATH, emptySnapshot());
}

export async function readOnboarding() {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export async function readLock() {
  return readJson(LOCK_PATH, null);
}

export async function readDecisions() {
  return readJson(DECISIONS_PATH, { decisions: {} });
}

export function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-ads",
    currency: "USD",
    range: { start: "", end: "" },
    targets: { acos_target_pct: 25, roas_target: 4 },
    metrics: {
      spend_mtd: 0,
      spend_last_month: 0,
      revenue_mtd: 0,
      spend_14d: 0,
      revenue_14d: 0,
      blended_roas: 0,
      blended_acos_pct: 0,
      acos_target_pct: 25,
      conversions_14d: 0,
      campaigns_total: 0,
      campaigns_active: 0,
      anomalies_open: 0,
      anomalies_critical: 0,
      adjustments_needing_review: 0,
      budget_at_risk_today: 0
    },
    platforms: [],
    campaigns: [],
    anomalies: [],
    adjustments: [],
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No ads snapshot exists yet. Configure platforms, then ingest platform reports."
      }
    ]
  };
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
  const paths = [];
  if (process.env.KELLY_ADS_CONFIG) paths.push(process.env.KELLY_ADS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-ads", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_ADS_ENV_FILE) paths.push(process.env.KELLY_ADS_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-ads", ".env"));
  return paths;
}

export async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

export function summarizeConfig(configResult) {
  const config = configResult.config || {};
  const platforms = Array.isArray(config.platforms) ? config.platforms : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    currency: config.currency || "USD",
    targets: config.targets || {},
    thresholds: config.thresholds || {},
    platforms: platforms.map((platform) => {
      const secretKeys = ["token_env", "client_id_env", "client_secret_env", "api_key_env", "developer_token_env"].filter((key) => platform[key]);
      return {
        platform_id: platform.platform_id || "",
        name: platform.name || platform.platform_id || "",
        account_id: platform.account_id || "",
        secret_envs: secretKeys.map((key) => platform[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[platform[key]]))
      };
    })
  };
}

export async function acquireLock(owner, message) {
  const existing = await readLock();
  if (existing && existing.owner !== owner) {
    const error = new Error(`Agent lock is held by ${existing.owner || "unknown"}: ${existing.message || "working"}`);
    error.code = "LOCKED";
    throw error;
  }
  await writeJson(LOCK_PATH, { owner, message, started_at: new Date().toISOString() });
}

export async function releaseLock() {
  await fs.rm(LOCK_PATH, { force: true });
}

export function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export function totalsForDays(campaign, days) {
  const daily = Array.isArray(campaign.daily) ? [...campaign.daily].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const slice = days > 0 ? daily.slice(-days) : daily;
  const totals = slice.reduce((acc, day) => {
    acc.spend += Number(day.spend || 0);
    acc.impressions += Number(day.impressions || 0);
    acc.clicks += Number(day.clicks || 0);
    acc.conversions += Number(day.conversions || 0);
    acc.revenue += Number(day.revenue || 0);
    return acc;
  }, { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
  return {
    spend: round2(totals.spend),
    impressions: totals.impressions,
    clicks: totals.clicks,
    conversions: totals.conversions,
    revenue: round2(totals.revenue),
    roas: totals.spend > 0 ? round2(totals.revenue / totals.spend) : 0,
    acos_pct: totals.revenue > 0 ? round1((totals.spend / totals.revenue) * 100) : 0,
    cpc: totals.clicks > 0 ? round2(totals.spend / totals.clicks) : 0
  };
}

function trendFor(campaign) {
  const daily = Array.isArray(campaign.daily) ? [...campaign.daily].sort((a, b) => a.date.localeCompare(b.date)) : [];
  if (daily.length < 4) return "flat";
  const half = Math.floor(daily.length / 2);
  const roasOf = (slice) => {
    const spend = slice.reduce((sum, day) => sum + Number(day.spend || 0), 0);
    const revenue = slice.reduce((sum, day) => sum + Number(day.revenue || 0), 0);
    return spend > 0 ? revenue / spend : 0;
  };
  const early = roasOf(daily.slice(0, half));
  const late = roasOf(daily.slice(half));
  if (early <= 0) return "flat";
  const delta = (late - early) / early;
  if (delta > 0.08) return "up";
  if (delta < -0.08) return "down";
  return "flat";
}

// Recompute campaign totals, platform rollups, and top-level metrics from the
// daily series. Shared by the ingest/check scripts so the UI always reflects
// what the scripts wrote.
export function recomputeDerived(snapshot, config = {}) {
  const campaigns = Array.isArray(snapshot.campaigns) ? snapshot.campaigns : [];
  const anomalies = Array.isArray(snapshot.anomalies) ? snapshot.anomalies : [];
  const adjustments = Array.isArray(snapshot.adjustments) ? snapshot.adjustments : [];
  const defaultAcos = Number(config.targets?.default_acos_pct || snapshot.targets?.acos_target_pct || 25);

  let latest = "";
  for (const campaign of campaigns) {
    campaign.totals_7d = totalsForDays(campaign, 7);
    campaign.trend = trendFor(campaign);
    if (!campaign.acos_target_pct) campaign.acos_target_pct = defaultAcos;
    for (const day of campaign.daily || []) {
      if (day.date > latest) latest = day.date;
    }
  }
  if (latest) {
    const dates = campaigns.flatMap((campaign) => (campaign.daily || []).map((day) => day.date));
    snapshot.range = { start: dates.reduce((min, d) => (min && min < d ? min : d), ""), end: latest };
  }

  const platforms = Array.isArray(snapshot.platforms) ? snapshot.platforms : [];
  for (const platform of platforms) {
    const own = campaigns.filter((campaign) => campaign.platform === platform.platform_id);
    const totals = own.reduce((acc, campaign) => {
      const all = totalsForDays(campaign, 0);
      acc.spend += all.spend;
      acc.revenue += all.revenue;
      acc.conversions += all.conversions;
      return acc;
    }, { spend: 0, revenue: 0, conversions: 0 });
    platform.campaign_count = own.length;
    platform.spend_14d = round2(totals.spend);
    platform.revenue_14d = round2(totals.revenue);
    platform.conversions_14d = totals.conversions;
    platform.roas = totals.spend > 0 ? round2(totals.revenue / totals.spend) : 0;
    platform.acos_pct = totals.revenue > 0 ? round1((totals.spend / totals.revenue) * 100) : 0;
  }

  const month = latest ? latest.slice(0, 7) : "";
  const inMonth = (day) => month && day.date.startsWith(month);
  const all = campaigns.reduce((acc, campaign) => {
    for (const day of campaign.daily || []) {
      acc.spend += Number(day.spend || 0);
      acc.revenue += Number(day.revenue || 0);
      acc.conversions += Number(day.conversions || 0);
      if (inMonth(day)) {
        acc.spendMtd += Number(day.spend || 0);
        acc.revenueMtd += Number(day.revenue || 0);
      }
    }
    return acc;
  }, { spend: 0, revenue: 0, conversions: 0, spendMtd: 0, revenueMtd: 0 });

  const budgetRiskPct = Number(config.thresholds?.budget_risk_pct || 85);
  snapshot.metrics = {
    ...(snapshot.metrics || {}),
    spend_mtd: round2(all.spendMtd),
    revenue_mtd: round2(all.revenueMtd),
    spend_14d: round2(all.spend),
    revenue_14d: round2(all.revenue),
    blended_roas: all.spend > 0 ? round2(all.revenue / all.spend) : 0,
    blended_acos_pct: all.revenue > 0 ? round1((all.spend / all.revenue) * 100) : 0,
    acos_target_pct: defaultAcos,
    conversions_14d: all.conversions,
    campaigns_total: campaigns.length,
    campaigns_active: campaigns.filter((campaign) => campaign.status === "active").length,
    anomalies_open: anomalies.filter((anomaly) => anomaly.state === "open").length,
    anomalies_critical: anomalies.filter((anomaly) => anomaly.state === "open" && anomaly.severity === "critical").length,
    adjustments_needing_review: adjustments.filter((item) => item.status === "needs_review").length,
    budget_at_risk_today: campaigns.filter((campaign) => campaign.status === "active" && Number(campaign.budget_spent_today_pct || 0) >= budgetRiskPct).length
  };
  return snapshot;
}

export function pushSyncLog(snapshot, entry) {
  snapshot.sync_log = Array.isArray(snapshot.sync_log) ? snapshot.sync_log : [];
  snapshot.sync_log = snapshot.sync_log.filter((item) => item.sync_id !== entry.sync_id);
  snapshot.sync_log.unshift(entry);
  snapshot.sync_log = snapshot.sync_log.slice(0, 50);
}

const VERDICTS = new Set(["approve", "request_changes", "block", "note"]);

const VERDICT_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked"
};

export async function applyDecision({ adjustment_id, verdict, note }) {
  if (!adjustment_id || typeof adjustment_id !== "string") throw new Error("adjustment_id is required");
  if (!VERDICTS.has(verdict)) throw new Error(`verdict must be one of: ${[...VERDICTS].join(", ")}`);
  const lock = await readLock();
  if (lock) {
    const error = new Error(`Agent lock is held by ${lock.owner || "unknown"}: ${lock.message || "working"}`);
    error.code = "LOCKED";
    throw error;
  }
  const snapshot = await readSnapshot();
  const adjustment = (snapshot.adjustments || []).find((item) => item.adjustment_id === adjustment_id);
  if (!adjustment) throw new Error(`Unknown adjustment: ${adjustment_id}`);
  const decidedAt = new Date().toISOString();
  const decision = {
    adjustment_id,
    verdict,
    note: typeof note === "string" ? note : "",
    decided_at: decidedAt
  };
  if (verdict !== "note") adjustment.status = VERDICT_STATUS[verdict];
  adjustment.decision = decision;
  if (typeof note === "string") adjustment.note = note;

  const decisions = await readDecisions();
  decisions.decisions = decisions.decisions || {};
  decisions.decisions[adjustment_id] = decision;
  decisions.updated_at = decidedAt;

  snapshot.metrics = snapshot.metrics || {};
  snapshot.metrics.adjustments_needing_review = (snapshot.adjustments || []).filter((item) => item.status === "needs_review").length;

  await writeJson(DECISIONS_PATH, decisions);
  await writeJson(SNAPSHOT_PATH, snapshot);

  if (verdict === "request_changes") {
    const tasks = (await readJson(AGENT_TASKS_PATH, { tasks: [] })) || { tasks: [] };
    tasks.tasks = Array.isArray(tasks.tasks) ? tasks.tasks.filter((task) => task.adjustment_id !== adjustment_id) : [];
    tasks.tasks.push({
      task_id: `task-${adjustment_id}-${Date.now()}`,
      adjustment_id,
      type: adjustment.type || "",
      title: adjustment.title || "",
      request: decision.note,
      status: "queued",
      created_at: decidedAt
    });
    tasks.updated_at = decidedAt;
    await writeJson(AGENT_TASKS_PATH, tasks);
  }

  return { adjustment, decision };
}
