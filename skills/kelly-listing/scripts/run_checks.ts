#!/usr/bin/env node
// Deterministic compliance checker. Reads the snapshot + claims registry
// through the data-provider layer, reads per-platform rule sets from private
// config (or config.example.json), evaluates every draft with the shared engine
// in app/server/rules.ts (character caps count code points, byte caps use
// Buffer.byteLength, banned-word matching uses word boundaries for ASCII terms,
// and the claims_registry rule consults the approved-claims / banned-phrase
// registry), merges the results into checks[], recomputes per-draft compliance
// scores and metrics, and writes the snapshot back. Re-running is idempotent.
//
// Usage: node scripts/run_checks.ts
import path from "node:path";
import { computeMetrics, evaluateDraft, ruleCatalog, scoreChecks } from "../app/server/rules.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();

const lock = await provider.readLock();
if (lock) {
  console.error(`Refusing to run checks: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const snapshot = await provider.readSnapshot();
if (!snapshot || !Array.isArray(snapshot.drafts)) {
  console.error("No snapshot found. Ingest a draft first (scripts/ingest_drafts.ts).");
  process.exit(1);
}

const { config, path: configPath } = await provider.readConfig();
if (!Array.isArray(config.platforms) || !config.platforms.length) {
  console.error(
    `No platforms[] rule sets found in config (${configPath || "no config file"}). Add them to config.local.json.`,
  );
  process.exit(1);
}

// Optionally support a separate banned-words file referenced from config.
if (typeof config.banned_words_file === "string" && config.banned_words_file) {
  const skillDir = path.resolve(import.meta.dirname, "..");
  const bannedPath = path.isAbsolute(config.banned_words_file)
    ? config.banned_words_file
    : path.join(skillDir, config.banned_words_file);
  const extra = await import("node:fs/promises")
    .then((fs) => fs.readFile(bannedPath, "utf8"))
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  if (Array.isArray(extra)) config.banned_words = [...(config.banned_words || []), ...extra];
  else if (extra) console.error(`warning: ${bannedPath} must contain a JSON array of banned words; ignored.`);
}

const claims = await provider.readClaims();
const now = new Date().toISOString();
const productsById = new Map((snapshot.products || []).map((product) => [product.product_id, product]));
const checks = [];

for (const draft of snapshot.drafts || []) {
  const product = productsById.get(draft.product_id);
  for (const result of evaluateDraft(draft, product, config, "en", claims)) {
    checks.push({
      check_id: `chk-${draft.draft_id.replace(/^d-/, "")}-${result.rule_id}`,
      draft_id: draft.draft_id,
      rule_id: result.rule_id,
      severity: result.severity,
      result: result.result,
      evidence: result.evidence,
      ...(result.refs ? { refs: result.refs } : {}),
      checked_at: now,
    });
  }
  draft.compliance_score = scoreChecks(checks.filter((check) => check.draft_id === draft.draft_id));
}

snapshot.rules = ruleCatalog(config, "en");
snapshot.checks = checks;
snapshot.metrics = { ...snapshot.metrics, ...computeMetrics(snapshot) };
snapshot.generated_at = now;

await provider.writeSnapshot(snapshot);
const failCount = checks.filter((check) => check.result === "fail").length;
const warnCount = checks.filter((check) => check.result === "warn").length;
console.log(
  `Checked ${(snapshot.drafts || []).length} draft(s): ${failCount} fail, ${warnCount} warn, pass rate ${snapshot.metrics.compliance_pass_rate}%.`,
);
console.log("Wrote listing snapshot via the data provider.");
