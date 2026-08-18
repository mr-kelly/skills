#!/usr/bin/env node
// Trusted wrapper around scripts/build_three_statement_model.py (kept as
// Python — see that script's module docstring and SKILL.md's "Create A
// Three-Statement Template" section for why: it hand-writes a real .xlsx
// zip/XML structure with genuine three-statement modeling formulas
// (balance-sheet balancing, depreciation/PP&E roll-forward, debt/interest
// schedule, working-capital tie) using only the Python standard library —
// forcing a Node rewrite would mean reimplementing that formula logic
// instead of just calling it, which is explicitly out of scope for this
// conversion. This wrapper owns the ONE part of the flow that must talk to
// Busabase: after the Python script writes the workbook, it upserts the
// `model` Base's current row with the workbook's path/tab contract and
// company/currency/purpose, optionally seeding the standard model-quality
// check queue (the "Required Checks" list from
// references/three-statement-modeling.md — check definitions, not computed
// math) and/or a caller-supplied `periods` array (e.g. once an agent has
// actually opened the workbook and read real computed values). This script
// never fabricates financial figures itself.
//
// Usage:
//   node scripts/build_three_statement_model.mjs --company "ExampleCo" --start-year 2026 --years 5 \
//     --currency USD --base-revenue 1000000 [--output /tmp/model.xlsx] [--purpose "..."] \
//     [--periods '[{"label":"2026","revenue":1000000,...}, ...]'] [--seed-checks] [--apply]
//
// The .xlsx is always generated locally (no external side effect either
// way — this mirrors the original CLI contract in SKILL.md). Without
// --apply nothing is written to Busabase; the script only prints what it
// would write. Connects with the trusted process's own credentials
// (BUSABASE_BASE_URL, BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the
// AirApp's ambient session.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKBOOK_TABS = ["Assumptions", "Income Statement", "Balance Sheet", "Cash Flow", "Checks"];

// Check *definitions* only (title/summary/evidence pointer), ported from the
// "Required Checks" list in references/three-statement-modeling.md — no
// computed financial figures, just the standard review-queue scaffolding a
// freshly generated starter workbook should carry.
const REQUIRED_CHECKS = [
  {
    check_id: "check-balance-sheet",
    title: "Balance sheet balances",
    summary: "Total assets minus total liabilities and equity equals zero in every forecast period.",
    severity: "info",
    check_type: "statement_tie",
    evidence: ["Checks!Balance sheet check"],
    proposed_action: "Open the workbook and confirm every period ties to zero.",
  },
  {
    check_id: "check-cash-roll-forward",
    title: "Cash roll-forward ties",
    summary: "Beginning cash plus net change in cash equals ending cash, and ties to the balance sheet.",
    severity: "info",
    check_type: "cash_flow_tie",
    evidence: ["Checks!Cash tie check"],
    proposed_action: "Open the workbook and confirm the cash tie check is zero in every period.",
  },
  {
    check_id: "check-net-income-tie",
    title: "Net income flows to retained earnings",
    summary: "Income statement net income equals the cash-flow statement's starting net income.",
    severity: "info",
    check_type: "statement_tie",
    evidence: ["Checks!Net income tie check"],
    proposed_action: "Open the workbook and confirm the net income tie check is zero in every period.",
  },
  {
    check_id: "check-ppe-tie",
    title: "Depreciation ties to PP&E",
    summary: "Beginning PP&E plus capex minus depreciation equals ending PP&E.",
    severity: "info",
    check_type: "schedule_tie",
    evidence: ["Balance Sheet!PP&E, net"],
    proposed_action: "Open the workbook and confirm the PP&E roll-forward.",
  },
  {
    check_id: "check-debt-tie",
    title: "Debt schedule ties to interest and debt balances",
    summary: "Beginning debt plus issuance minus repayment equals ending debt, and interest references prior debt.",
    severity: "info",
    check_type: "schedule_tie",
    evidence: ["Checks!Debt tie check"],
    proposed_action: "Open the workbook and confirm the debt tie check is zero in every period.",
  },
];

function help() {
  console.log(`Usage: node scripts/build_three_statement_model.mjs [options] [--apply]

Options (forwarded to scripts/build_three_statement_model.py):
  --company <name>          Company/model name (default: Company)
  --start-year <year>       First forecast year (default: 2026)
  --years <1-10>            Forecast years (default: 5)
  --currency <code>         Model currency label (default: USD)
  --base-revenue <number>   First forecast year revenue (default: 1000000)
  --output <path>           Output .xlsx path (default: a temp path under /tmp)
  --purpose <text>          Model purpose label stored on the model row

Options handled only by this wrapper:
  --periods <json>          Precomputed periods array (from an agent that already
                             opened the workbook) to seed the dashboard's forecast table
  --seed-checks              Also seed the standard model-quality check queue
  --apply                    Write to Busabase (default: dry run, prints what would be written)

The .xlsx is always generated locally regardless of --apply — that step has
no external side effect. Only the Busabase write is gated.`);
}

function flagValue(args, name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
}

function runPython(pyArgs) {
  return new Promise((resolve, reject) => {
    const python = process.env.KELLY_FINANCE_PYTHON || "python3";
    const scriptPath = path.join(SKILL_DIR, "scripts", "build_three_statement_model.py");
    let out = "";
    let err = "";
    const child = spawn(python, [scriptPath, ...pyArgs], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error((err || out).trim() || `build_three_statement_model.py exit ${code}`));
      resolve(out.trim());
    });
  });
}

async function upsert(client, declared, idFieldSlug, idValue, existingRows, fields, message) {
  const toBusabaseFields = (value) =>
    Object.fromEntries(Object.entries(value).map(([key, v]) => [key.replaceAll("_", "-"), String(v ?? "")]));
  const existing = existingRows.find((row) => row[idFieldSlug.replaceAll("-", "_")] === idValue);
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: "kelly-finance-builder",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: normalized,
    message,
    author: "kelly-finance-builder",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

async function readAll(client, declared) {
  const normalizeFields = (fields) =>
    Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
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
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const apply = args.includes("--apply");
  const seedChecks = args.includes("--seed-checks");

  const company = flagValue(args, "--company", "Company");
  const startYear = flagValue(args, "--start-year", "2026");
  const years = flagValue(args, "--years", "5");
  const currency = flagValue(args, "--currency", "USD");
  const baseRevenue = flagValue(args, "--base-revenue", "1000000");
  const purpose = flagValue(args, "--purpose", "");
  const periodsJson = flagValue(args, "--periods", "");
  const output = flagValue(args, "--output", path.join("/tmp", `kelly-finance-model-${Date.now()}.xlsx`));

  let periods = [];
  if (periodsJson) {
    const parsed = JSON.parse(periodsJson);
    if (!Array.isArray(parsed)) throw new Error("--periods must be a JSON array");
    periods = parsed;
  }

  const pyArgs = [
    "--output",
    output,
    "--company",
    company,
    "--start-year",
    startYear,
    "--years",
    years,
    "--currency",
    currency,
    "--base-revenue",
    baseRevenue,
  ];
  const pyOutput = await runPython(pyArgs);
  console.log(pyOutput);

  const now = new Date().toISOString();
  const modelFields = {
    model_id: "current",
    snapshot_id: `finance-${now.slice(0, 10).replace(/-/g, "")}-${now.slice(11, 19).replace(/:/g, "")}`,
    generated_at: now,
    source: "local",
    company,
    currency,
    display_unit: "units",
    model_purpose: purpose,
    periods: JSON.stringify(periods),
    revenue_cagr: 0,
    ending_cash: 0,
    free_cash_flow: 0,
    balance_check: 0,
    warnings: periods.length
      ? JSON.stringify([])
      : JSON.stringify(["Open the workbook to fill in periods and checks for the dashboard."]),
    workbook_path: output,
    workbook_tabs: JSON.stringify(WORKBOOK_TABS),
  };

  if (!apply) {
    console.log(
      JSON.stringify({ mode: "dry-run", model: modelFields, checks: seedChecks ? REQUIRED_CHECKS : [] }, null, 2),
    );
    console.log("Dry run only. Re-run with --apply to write the model (and optional checks) to Busabase.");
    return;
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
    throw new Error("Kelly Finance Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const modelBase = resources.bases.find((base) => base.key === "model");
  const checksBase = resources.bases.find((base) => base.key === "checks");

  const existingModelRows = await readAll(client, modelBase);
  await upsert(
    client,
    modelBase,
    "model-id",
    "current",
    existingModelRows,
    modelFields,
    `Build three-statement starter model for ${company}`,
  );

  if (seedChecks) {
    const existingCheckRows = await readAll(client, checksBase);
    await Promise.all(
      REQUIRED_CHECKS.map((check) =>
        upsert(
          client,
          checksBase,
          "check-id",
          check.check_id,
          existingCheckRows,
          {
            check_id: check.check_id,
            title: check.title,
            summary: check.summary,
            severity: check.severity,
            status: "needs_review",
            check_type: check.check_type,
            evidence: JSON.stringify(check.evidence),
            proposed_action: check.proposed_action,
            draft: "",
            decision_action: "",
            decision_comment: "",
            decided_at: "",
          },
          `Seed required check ${check.check_id}`,
        ),
      ),
    );
  }

  console.log(`Wrote model row (and ${seedChecks ? REQUIRED_CHECKS.length : 0} required checks) to Busabase.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
