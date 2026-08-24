#!/usr/bin/env node
// Trusted ingestion step. The AirApp browser cannot shell out to the local
// `gh` CLI (no secrets, no local process access), so this script is the only
// place that reads real GitHub PR data: it calls `gh search prs` / `gh pr
// diff`, scores risk and a proposed review action, and writes the resulting
// review-queue rows into Busabase's `reviews` Base (create or update, keyed
// by item-id) — the same "list existing rows, then create/update" pattern as
// kelly-family-fund's scripts/import_csv.mjs, just sourced from `gh` output
// instead of a CSV file. Regenerating resets each item's live PR data
// (title/status/risk/…) and its decision/execution fields exactly like the
// retired local-file provider's saveBatch() did, but preserves whatever
// tested/test_note/test_evidence a human already recorded (that lived in a
// separate tested.json file before; it now survives on the record because it
// is simply never touched by the fields this script writes).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Config (repos/query/review policy) is read from the same local
// JSON/env-file priority the retired lib/data-reader used; gh defaults are
// used when nothing is configured. Writes are gated behind --apply (default
// dry run), the same convention as kelly-family-fund's importer.
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-pr-review-app/app/js/config.js";

const execFile = promisify(execFileCallback);
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_DIR = path.resolve(SKILL_DIR, "..", "..");

function help() {
  console.log(`Usage: node scripts/generate_review_batch.mjs [--apply] [--sample]

Reads open PRs requesting review and recently merged PRs with gh CLI (or
built-in sample data with --sample), scores risk and a proposed review
action, and writes the resulting rows into Busabase's "reviews" Base. Without
--apply this is a dry run that only prints what would be written. Human
decision/tested state already on a record is never overwritten by a
regenerate — only the live PR fields (title, status, risk, review body, …)
and the decision/execution fields (reset, matching the retired local-file
provider's regenerate-resets-decisions behavior).`);
}

// ---- Config loading, ported from the retired lib/data-reader/local-file-reader.ts ----

const CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.json");
const USER_CONFIG_DIR = path.join(os.homedir(), ".config", "kelly-pr-review");
const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, "config.json");
const CONFIG_CANDIDATES = [() => process.env.KELLY_PR_REVIEW_CONFIG, () => CONFIG_LOCAL_PATH, () => USER_CONFIG_PATH];
const ENV_CANDIDATES = [
  () => process.env.KELLY_PR_REVIEW_ENV_FILE,
  () => path.join(ROOT_DIR, ".env"),
  () => path.join(SKILL_DIR, ".env.local"),
  () => path.join(USER_CONFIG_DIR, ".env"),
];

async function pathExists(pathname) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function loadEnvFile(pathname) {
  if (!pathname || !(await pathExists(pathname))) return false;
  const raw = await fs.readFile(pathname, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

async function loadDotenvFiles() {
  for (const candidate of ENV_CANDIDATES) await loadEnvFile(candidate());
}

async function loadLocalConfig() {
  await loadDotenvFiles();
  for (const candidate of CONFIG_CANDIDATES) {
    const pathname = candidate();
    if (!pathname || !(await pathExists(pathname))) continue;
    return JSON.parse(await fs.readFile(pathname, "utf8")) || {};
  }
  return {};
}

function defaultConfig(config = {}) {
  return {
    ...config,
    repos: config.repos || [],
    reviewer: {
      handle: "@me",
      ...(config.reviewer || {}),
    },
    query: {
      state: "open",
      review_requested: "@me",
      limit: 30,
      merged_limit: 30,
      merged_at: ">=2026-01-01",
      sort: "updated",
      order: "desc",
      include_drafts: false,
      ...(config.query || {}),
    },
    review_policy: {
      default_action: "comment",
      include_patch_excerpt: false,
      max_patch_chars: 12000,
      large_diff_changed_files: 25,
      large_diff_additions: 1500,
      risk_keywords: {
        security: ["auth", "token", "password", "permission", "privacy", "secret"],
        data: ["migration", "schema", "delete", "drop table", "billing", "payment"],
        generated: ["generated", "lockfile", "vendor"],
        ...(config.review_policy?.risk_keywords || {}),
      },
      ...(config.review_policy || {}),
    },
    style: config.style || {},
  };
}

function repoArgs(config) {
  const repos = (config.repos || []).filter((repo) => repo.include !== false && repo.repo);
  return repos.flatMap((repo) => ["--repo", repo.repo]);
}

// ---- gh CLI helpers, ported verbatim from the retired scripts/generate_review_batch.ts ----

async function gh(args, options = {}) {
  const { stdout } = await execFile("gh", args, { maxBuffer: options.maxBuffer || 1024 * 1024 * 10 });
  return stdout;
}

async function ghJson(args) {
  const text = await gh(args);
  return JSON.parse(text || "[]");
}

async function authReady() {
  try {
    await gh(["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}

function truncateText(value, max = 4000) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 28).trimEnd()}\n\n[truncated locally]`;
}

function riskFor(pr, files, policy) {
  const risks = new Set();
  const text = `${pr.title || ""} ${pr.body || ""} ${files.join(" ")}`.toLowerCase();
  const keywords = policy.risk_keywords || {};
  for (const [name, words] of Object.entries(keywords)) {
    if ((words || []).some((word) => text.includes(String(word).toLowerCase()))) risks.add(name);
  }
  if (files.length >= Number(policy.large_diff_changed_files || 25)) risks.add("large_diff");
  return Array.from(risks);
}

function proposedActionFor(pr, risks, policy) {
  if (pr.isDraft) return "needs_review";
  if (risks.length) return "comment";
  return policy.default_action || "comment";
}

async function changedFiles(repo, number) {
  try {
    const text = await gh(["pr", "diff", String(number), "--repo", repo, "--name-only"]);
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function patchExcerpt(repo, number, maxChars) {
  try {
    const text = await gh(["pr", "diff", String(number), "--repo", repo, "--patch"], { maxBuffer: 1024 * 1024 * 20 });
    return truncateText(text, maxChars);
  } catch {
    return "";
  }
}

async function hydratePullRequest(pr, config, options = {}) {
  const repo = pr.repository?.nameWithOwner || pr.repository?.fullName || pr.repository?.name || "";
  const number = Number(pr.number);
  const policy = config.review_policy || {};
  const files = await changedFiles(repo, number);
  const risks = riskFor(pr, files, policy);
  const merged = Boolean(options.merged);
  const action = proposedActionFor(pr, risks, policy);
  const status = merged ? "merged" : action === "needs_review" || risks.length ? "needs_review" : "to_approve";
  const reviewBody =
    action === "approve"
      ? "Looks good. The change appears scoped and I did not see obvious review blockers in the loaded context."
      : `Thanks, I reviewed this locally. ${risks.length ? `Risk areas to confirm: ${risks.join(", ")}.` : "Leaving a review note for confirmation."}`;
  return {
    id: `${repo}#${number}`,
    repo,
    number,
    title: pr.title || "(untitled pull request)",
    author: pr.author?.login || "",
    url: pr.url || "",
    summary: truncateText(pr.body || "", 600),
    body: truncateText(pr.body || "", 2000),
    status,
    proposed_action: merged ? "no_action" : action,
    reason: merged
      ? "Merged PR is waiting for human test verification."
      : risks.length
        ? `Detected risk: ${risks.join(", ")}`
        : "No configured risk keywords detected.",
    risk: risks,
    labels: (pr.labels || []).map((label) => label.name || label).filter(Boolean),
    changed_files: files,
    additions: Number(pr.additions || 0),
    deletions: Number(pr.deletions || 0),
    comments_count: Number(pr.commentsCount || 0),
    state: pr.state || "",
    merged,
    merged_at: options.merged_at || pr.mergedAt || pr.closedAt || "",
    is_draft: Boolean(pr.isDraft),
    created_at: pr.createdAt || "",
    updated_at: pr.updatedAt || new Date().toISOString(),
    review_body: reviewBody,
    patch_excerpt: policy.include_patch_excerpt
      ? await patchExcerpt(repo, number, Number(policy.max_patch_chars || 12000))
      : "",
  };
}

function dedupeItems(items) {
  const byId = new Map();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing || existing.status === "merged") byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

function sampleItems() {
  const now = new Date().toISOString();
  return [
    {
      id: "sample/repo#42",
      repo: "sample/repo",
      number: 42,
      title: "Refine billing webhook retry handling",
      author: "octocat",
      url: "https://github.com/sample/repo/pull/42",
      summary: "Touches billing retry logic and should get a careful review before approval.",
      body: "Sample PR body for local UI preview.",
      status: "needs_review",
      proposed_action: "comment",
      reason: "Billing logic changed; leave a review note unless tests and edge cases are confirmed.",
      risk: ["billing", "retry"],
      labels: ["backend"],
      changed_files: ["src/billing/webhooks.ts", "src/billing/retry-policy.ts", "test/billing/webhooks.test.ts"],
      additions: 214,
      deletions: 37,
      comments_count: 3,
      updated_at: now,
      review_body:
        "Thanks, I reviewed the retry flow. Please double-check idempotency around duplicate webhook delivery before we approve this.",
      patch_excerpt: "",
    },
    {
      id: "sample/repo#43",
      repo: "sample/repo",
      number: 43,
      title: "Fix dashboard empty state spacing",
      author: "mona",
      url: "https://github.com/sample/repo/pull/43",
      summary: "Small UI spacing fix with low risk.",
      body: "Sample PR body for local UI preview.",
      status: "to_approve",
      proposed_action: "approve",
      reason: "Small CSS-only change; no risky files detected.",
      risk: [],
      labels: ["frontend"],
      changed_files: [
        "content/kelly-pr-review-app/dashboard/EmptyState.tsx",
        "content/kelly-pr-review-app/dashboard/styles.css",
      ],
      additions: 22,
      deletions: 5,
      comments_count: 0,
      updated_at: now,
      review_body: "Looks good. The empty state spacing is clearer and the change is nicely scoped.",
      patch_excerpt: "",
    },
    {
      id: "sample/repo#44",
      repo: "sample/repo",
      number: 44,
      title: "Ship post-merge profile settings polish",
      author: "alex",
      url: "https://github.com/sample/repo/pull/44",
      summary: "Merged UI polish that still needs manual product verification.",
      body: "Sample merged PR body for local UI preview.",
      status: "merged",
      proposed_action: "no_action",
      reason: "Merged PR is waiting for human test verification.",
      risk: ["frontend"],
      labels: ["frontend"],
      changed_files: ["content/kelly-pr-review-app/profile/Settings.tsx"],
      additions: 48,
      deletions: 9,
      comments_count: 1,
      state: "closed",
      merged: true,
      merged_at: now,
      updated_at: now,
      review_body: "",
      patch_excerpt: "",
    },
  ];
}

async function fetchLiveItems(config) {
  if (!(await authReady())) throw new Error("gh is not authenticated. Run `gh auth login` first.");
  const query = config.query || {};
  const openArgs = [
    "search",
    "prs",
    "--state",
    query.state || "open",
    "--review-requested",
    query.review_requested || config.reviewer?.handle || "@me",
    "--limit",
    String(query.limit || 30),
    "--sort",
    query.sort || "updated",
    "--order",
    query.order || "desc",
    "--json",
    "title,number,author,body,labels,repository,url,updatedAt,createdAt,isDraft,commentsCount",
    ...repoArgs(config),
  ];
  const prs = await ghJson(openArgs);
  const filtered = query.include_drafts ? prs : prs.filter((pr) => !pr.isDraft);
  const items = [];
  for (const pr of filtered) items.push(await hydratePullRequest(pr, config));

  const mergedArgs = [
    "search",
    "prs",
    "--state",
    "closed",
    "--merged",
    "--limit",
    String(query.merged_limit || query.limit || 30),
    "--sort",
    query.sort || "updated",
    "--order",
    query.order || "desc",
    "--json",
    "title,number,author,body,labels,repository,url,updatedAt,createdAt,closedAt,isDraft,commentsCount,state",
    ...repoArgs(config),
  ];
  if (query.merged_at) mergedArgs.splice(5, 0, "--merged-at", String(query.merged_at));
  const mergedPrs = await ghJson(mergedArgs);
  for (const pr of mergedPrs)
    items.push(await hydratePullRequest(pr, config, { merged: true, merged_at: pr.closedAt || "" }));

  return dedupeItems(items);
}

// ---- Busabase write side, mirrors kelly-family-fund's import_csv.mjs ----

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));
// records.get({baseId, fieldSlug, valueText}) is typed narrower than the
// records.list() shape busabase-provider.js reads client-side (only
// headCommit.fields, no top-level fields fallback); accept it loosely here.
// Mirrors busabase-provider.js's findRecord(): a missing record raises
// NOT_FOUND rather than resolving to null.
/** @param {any} record */
const rawFieldsOf = (record) => record?.headCommit?.payload || record?.headCommit?.fields || record?.fields || {};
async function findByFieldSlug(client, baseId, fieldSlug, valueText) {
  try {
    return await client.records.get({ baseId, fieldSlug, valueText });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

function toRowFields(item) {
  return {
    item_id: item.id,
    repo: item.repo,
    number: item.number,
    title: item.title,
    author: item.author,
    url: item.url,
    summary: item.summary,
    body: item.body,
    status: item.status,
    proposed_action: item.proposed_action,
    reason: item.reason,
    risk: JSON.stringify(item.risk || []),
    labels: JSON.stringify(item.labels || []),
    changed_files: JSON.stringify(item.changed_files || []),
    additions: item.additions,
    deletions: item.deletions,
    comments_count: item.comments_count,
    checks: item.checks || "",
    state: item.state || "",
    merged: item.merged ? "true" : "false",
    merged_at: item.merged_at || "",
    is_draft: item.is_draft ? "true" : "false",
    created_at: item.created_at || "",
    updated_at: item.updated_at,
    review_body: item.review_body || "",
    patch_excerpt: item.patch_excerpt || "",
    // A regenerate resets the decision/execution fields, matching the
    // retired local-file provider's saveBatch()-overwrites-decisions
    // behavior — a fresh gh read has no opinion on a prior human verdict.
    decision_action: "",
    decision_note: "",
    decided_at: "",
    execution_status: "",
    execution_detail: "",
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");
  const sample = args.has("--sample");

  const rawConfig = sample ? {} : await loadLocalConfig();
  const config = defaultConfig(rawConfig);
  const items = sample ? sampleItems() : await fetchLiveItems(config);

  console.log(`Fetched ${items.length} pull request(s)${sample ? " (sample data)" : ""}.`);
  if (!apply) {
    console.log("Dry run (pass --apply to write to Busabase):");
    for (const item of items) console.log(`  ${item.status.padEnd(12)} ${item.id}  ${item.title}`);
    return;
  }

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required with --apply");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly PR Review Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const reviewsBase = resources.bases.find((base) => base.key === "reviews");
  const settingsBase = resources.bases.find((base) => base.key === "settings");

  let created = 0;
  let updated = 0;
  for (const item of items) {
    const existing = await findByFieldSlug(client, reviewsBase.baseId, "item-id", item.id);
    const current = existing ? normalizeFields(rawFieldsOf(existing)) : {};
    // Preserve whatever a human already recorded (tested/test_note/test_evidence)
    // by spreading `current` first; toRowFields()'s fresh PR data (and reset
    // decision/execution fields) then overwrite the rest.
    const fields = { ...current, ...toRowFields(item) };
    if (existing) {
      await client.records.changeRequest({
        recordId: existing.id,
        operation: "update",
        fields: toBusabaseFields(fields),
        message: `Refresh review batch for ${item.id}`,
        author: "kelly-pr-review-generator",
        baseCommitId: existing.headCommitId || existing.headCommit?.id,
        autoMerge: true,
      });
      updated += 1;
    } else {
      await client.bases.createChangeRequest({
        baseId: reviewsBase.baseId,
        fields: toBusabaseFields(fields),
        message: `Add review batch item ${item.id}`,
        submittedBy: "kelly-pr-review-generator",
        autoMerge: true,
      });
      created += 1;
    }
  }

  const existingProfile = await findByFieldSlug(client, settingsBase.baseId, "record-id", "kelly-pr-review-profile");
  const profilePayload = JSON.stringify({
    reviewer: config.reviewer,
    repos: config.repos || [],
    query: config.query,
    review_policy: config.review_policy,
    style: config.style,
  });
  const profileFields = toBusabaseFields({
    record_id: "kelly-pr-review-profile",
    kind: "kelly-pr-review-profile",
    payload: profilePayload,
    updated_at: new Date().toISOString(),
  });
  if (existingProfile) {
    await client.records.changeRequest({
      recordId: existingProfile.id,
      operation: "update",
      fields: profileFields,
      message: "Refresh Kelly PR Review profile",
      author: "kelly-pr-review-generator",
      baseCommitId: existingProfile.headCommitId || existingProfile.headCommit?.id,
      autoMerge: true,
    });
  } else {
    await client.bases.createChangeRequest({
      baseId: settingsBase.baseId,
      fields: profileFields,
      message: "Write Kelly PR Review profile",
      submittedBy: "kelly-pr-review-generator",
      autoMerge: true,
    });
  }

  console.log(`Wrote ${created} new and updated ${updated} existing review item(s) to Busabase.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
