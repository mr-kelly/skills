#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { ReviewConfig, ReviewPolicyConfig } from "../app/server/types.ts";
import { truncateText, utcNow, withLock } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import { loadConfigWithMeta } from "../lib/data-reader/index.ts";
import { CURRENT_BATCH_PATH } from "../lib/paths.ts";

const provider = await createProvider();

interface GhOptions {
  maxBuffer?: number;
}

interface HydrateOptions {
  merged?: boolean;
  merged_at?: string;
}

const execFile = promisify(execFileCallback);
const SAMPLE_FLAG = process.argv.includes("--sample");
const REFRESH_FLAG = process.argv.includes("--refresh");
const CACHE_TTL_MS = Number(process.env.KELLY_PR_REVIEW_CACHE_TTL_MS || 5 * 60 * 1000);

function compactTimestamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

async function cachedBatch() {
  if (SAMPLE_FLAG || REFRESH_FLAG || CACHE_TTL_MS <= 0) return null;
  const batch = await provider.loadBatch();
  // loadBatch() returns a synthetic empty batch when nothing is cached; only a
  // real, fresh gh-sourced batch counts as a cache hit.
  if (!batch || batch.batch_id === "empty" || batch.source !== "kelly-pr-review" || !batch.generated_at) return null;
  const generatedAt = new Date(batch.generated_at as string).getTime();
  if (!Number.isFinite(generatedAt)) return null;
  if (Date.now() - generatedAt > CACHE_TTL_MS) return null;
  return batch;
}

async function gh(args: string[], options: GhOptions = {}) {
  const { stdout } = await execFile("gh", args, {
    maxBuffer: options.maxBuffer || 1024 * 1024 * 10,
  });
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

function sampleItems() {
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
      updated_at: utcNow(),
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
      changed_files: ["app/dashboard/EmptyState.tsx", "app/dashboard/styles.css"],
      additions: 22,
      deletions: 5,
      comments_count: 0,
      updated_at: utcNow(),
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
      changed_files: ["app/profile/Settings.tsx"],
      additions: 48,
      deletions: 9,
      comments_count: 1,
      state: "closed",
      merged: true,
      merged_at: utcNow(),
      updated_at: utcNow(),
      review_body: "",
      patch_excerpt: "",
    },
  ];
}

function defaultConfig(config: ReviewConfig = {}): ReviewConfig {
  return {
    ...config,
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
  };
}

function repoArgs(config) {
  const repos = (config.repos || []).filter((repo) => repo.include !== false && repo.repo);
  return repos.flatMap((repo) => ["--repo", repo.repo]);
}

function riskFor(pr, files: string[], policy: ReviewPolicyConfig): string[] {
  const risks = new Set<string>();
  const text = `${pr.title || ""} ${pr.body || ""} ${files.join(" ")}`.toLowerCase();
  const keywords = policy.risk_keywords || {};
  for (const [name, words] of Object.entries(keywords)) {
    if ((words || []).some((word) => text.includes(String(word).toLowerCase()))) risks.add(name);
  }
  if (files.length >= Number(policy.large_diff_changed_files || 25)) risks.add("large_diff");
  return Array.from(risks);
}

function proposedActionFor(pr, risks: string[], policy: ReviewPolicyConfig) {
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

async function hydratePullRequest(pr, config: ReviewConfig, options: HydrateOptions = {}) {
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
    updated_at: pr.updatedAt || utcNow(),
    review_body: reviewBody,
    patch_excerpt: policy.include_patch_excerpt
      ? await patchExcerpt(repo, number, Number(policy.max_patch_chars || 12000))
      : "",
  };
}

function metrics(items) {
  return {
    needs_review: items.filter((item) => item.status === "needs_review").length,
    to_approve: items.filter((item) => item.status === "to_approve").length,
    approved: items.filter((item) => item.status === "approved").length,
    done: items.filter((item) => item.status === "done").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    needs_test: items.filter((item) => item.merged && item.status === "merged").length,
    tested: 0,
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

async function buildBatch(): Promise<any> {
  const cached = await cachedBatch();
  if (cached) return { ...cached, reused_cache: true };
  const meta = await loadConfigWithMeta();
  const config = defaultConfig(meta.config || {});
  let items = [];
  let source = "kelly-pr-review";
  if (SAMPLE_FLAG) {
    items = sampleItems();
    source = "kelly-pr-review-sample";
  } else {
    if (!(await authReady())) {
      throw new Error("gh is not authenticated. Run `gh auth login` first.");
    }
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
    items = [];
    for (const pr of filtered) {
      items.push(await hydratePullRequest(pr, config));
    }
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
    for (const pr of mergedPrs) {
      items.push(await hydratePullRequest(pr, config, { merged: true, merged_at: pr.closedAt || "" }));
    }
    items = dedupeItems(items);
  }
  const batch = {
    batch_id: `kelly-pr-review-${compactTimestamp()}`,
    generated_at: utcNow(),
    source,
    mode: "app-in-skill",
    metrics: metrics(items),
    items,
  };
  // saveBatch writes current_batch.json + the per-batch snapshot; then reset the
  // decisions and execution-report handoffs for the fresh batch.
  await provider.saveBatch(batch);
  await provider.writeDecisions({ ...batch, items: [] });
  await provider.writeExecutionReport({
    generated_at: utcNow(),
    batch_id: batch.batch_id,
    live: false,
    results: [],
    note: "No execution has run for this batch.",
  });
  return batch;
}

await withLock("Generating GitHub PR review batch", async () => {
  const batch = await buildBatch();
  if (batch.reused_cache) {
    console.log(`Reused cached PR review batch with ${batch.items.length} item(s): ${CURRENT_BATCH_PATH}`);
  } else {
    console.log(`Wrote ${batch.items.length} PR review item(s) to ${CURRENT_BATCH_PATH}`);
  }
});
