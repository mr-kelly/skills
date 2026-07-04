#!/usr/bin/env node
// Deterministic compliance checker. Reads per-platform rule sets from private
// config (or config.example.json), evaluates every draft in the snapshot with
// the shared engine in app/server/rules.mjs (character caps count code
// points, byte caps use Buffer.byteLength, banned-word matching uses word
// boundaries for ASCII terms), merges the results into checks[], recomputes
// per-draft compliance scores and metrics, and writes the snapshot back.
// Re-running is idempotent.
//
// Usage: node scripts/run_checks.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeMetrics, evaluateDraft, ruleCatalog, scoreChecks } from "../app/server/rules.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const snapshotPath = path.join(dataDir, "listing_snapshot.json");
const lockPath = path.join(dataDir, "agent.lock");

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
  if (process.env.KELLY_LISTING_CONFIG) paths.push(process.env.KELLY_LISTING_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-listing", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file };
  }
  return { config: {}, path: "" };
}

const lock = await readJson(lockPath);
if (lock) {
  console.error(`Refusing to run checks: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = await readJson(snapshotPath);
if (!snapshot) {
  console.error(`No snapshot at ${snapshotPath}. Ingest a draft first (scripts/ingest_drafts.mjs).`);
  process.exit(1);
}

const { config, path: configPath } = await readConfig();
if (!Array.isArray(config.platforms) || !config.platforms.length) {
  console.error(`No platforms[] rule sets found in config (${configPath || "no config file"}). Add them to config.local.json.`);
  process.exit(1);
}

// Optionally support a separate banned-words file referenced from config.
if (typeof config.banned_words_file === "string" && config.banned_words_file) {
  const bannedPath = path.isAbsolute(config.banned_words_file)
    ? config.banned_words_file
    : path.join(skillDir, config.banned_words_file);
  const extra = await readJson(bannedPath, null);
  if (Array.isArray(extra)) config.banned_words = [...(config.banned_words || []), ...extra];
  else if (extra) console.error(`warning: ${bannedPath} must contain a JSON array of banned words; ignored.`);
}

const now = new Date().toISOString();
const productsById = new Map((snapshot.products || []).map((product) => [product.product_id, product]));
const checks = [];

for (const draft of snapshot.drafts || []) {
  const product = productsById.get(draft.product_id);
  for (const result of evaluateDraft(draft, product, config, "en")) {
    checks.push({
      check_id: `chk-${draft.draft_id.replace(/^d-/, "")}-${result.rule_id}`,
      draft_id: draft.draft_id,
      rule_id: result.rule_id,
      severity: result.severity,
      result: result.result,
      evidence: result.evidence,
      checked_at: now
    });
  }
  draft.compliance_score = scoreChecks(checks.filter((check) => check.draft_id === draft.draft_id));
}

snapshot.rules = ruleCatalog(config, "en");
snapshot.checks = checks;
snapshot.metrics = { ...snapshot.metrics, ...computeMetrics(snapshot) };
snapshot.generated_at = now;

await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
const failCount = checks.filter((check) => check.result === "fail").length;
const warnCount = checks.filter((check) => check.result === "warn").length;
console.log(`Checked ${(snapshot.drafts || []).length} draft(s): ${failCount} fail, ${warnCount} warn, pass rate ${snapshot.metrics.compliance_pass_rate}%.`);
console.log(`Wrote ${snapshotPath}`);
