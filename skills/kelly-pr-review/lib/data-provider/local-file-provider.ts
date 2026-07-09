// Local-file ReviewProvider: the zero-dependency default.
//
// State lives in app/.cache/ as JSON handoff files (current_batch.json,
// decisions.json, tested.json, execution_report.json, agent.lock) plus the
// per-batch snapshots under app/.cache/batches/ and screenshot evidence under
// app/.cache/test-evidence/. This provider is the offline reference
// implementation of the same review model Busabase serves remotely, so
// KELLY_PR_REVIEW_DATA_PROVIDER=local|busabase is a config switch, not a rewrite
// of the UI or scripts.
//
// The fs logic here is the same code that previously lived inline in
// app/server/{state,decisions,batch-store,lock,tested-cache}.ts; those modules
// now delegate to this provider so both the server and the batch scripts hit
// storage through one seam.

import fs from "node:fs/promises";
import path from "node:path";
import { publicConfigSummary } from "../data-reader/local-file-reader.ts";
import {
  BATCH_DIR,
  CACHE_DIR,
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  TESTED_PATH,
  TEST_EVIDENCE_DIR,
} from "../paths.ts";
import type {
  EvidenceUpload,
  HttpError,
  ProviderMeta,
  RawTestedEntry,
  RawTestedPayload,
  SetTestedOptions,
  StateQuery,
  TestEvidence,
  TestedCache,
  TestedCacheEntry,
} from "../types.ts";

// Actions accepted from the UI. Shared by decisions + normalizeItem.
const ACTIONS = new Set(["approve", "comment", "request_changes", "no_action", "needs_review", "block"]);
const LOCAL_ACTIONS = new Set(["approve", "comment", "request_changes", "no_action", "needs_review", "block"]);
const APPROVED_ACTIONS = ["approve", "comment", "request_changes", "no_action"];
const DEFAULT_LOCK_MESSAGE = "/kelly-pr-review is processing this batch.";

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function utcNow() {
  return new Date().toISOString();
}

async function pathExists(pathname: string) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function readJson(pathname: string, fallback: unknown = null) {
  try {
    return JSON.parse(await fs.readFile(pathname, "utf8"));
  } catch (error) {
    if (fallback !== null && (error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

// Like readJson, but a missing file always resolves to the fallback (even null),
// so callers can distinguish "absent" from a real read error.
async function readJsonOrNull(pathname: string, fallback: unknown) {
  try {
    return JSON.parse(await fs.readFile(pathname, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(pathname: string, value: unknown) {
  await fs.mkdir(path.dirname(pathname), { recursive: true });
  await fs.writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeQueryValue(value: unknown, fallback = "") {
  if (Array.isArray(value)) return value[0] || fallback;
  return (value as string) || fallback;
}

// ---- Batch normalization (was batch-store.ts) ----

export function normalizeItem(item, index = 0) {
  const repo = String(item.repo || item.repository || "");
  const number = Number.parseInt(item.number || item.pr_number || 0, 10) || 0;
  const id = String(item.id || (repo && number ? `${repo}#${number}` : `item-${index + 1}`));
  const decision = item.decision || {};
  const proposed = ACTIONS.has(item.proposed_action) ? item.proposed_action : "comment";
  return {
    id,
    review_ref: item.review_ref || "",
    repo,
    number,
    title: item.title || "(untitled pull request)",
    author: item.author || "",
    url: item.url || "",
    summary: item.summary || "",
    body: item.body || "",
    status: item.status || "needs_review",
    proposed_action: proposed,
    reason: item.reason || "",
    risk: Array.isArray(item.risk) ? item.risk : [],
    labels: Array.isArray(item.labels) ? item.labels : [],
    changed_files: Array.isArray(item.changed_files) ? item.changed_files : [],
    additions: Number(item.additions || 0),
    deletions: Number(item.deletions || 0),
    comments_count: Number(item.comments_count || 0),
    checks: item.checks || "",
    state: item.state || "",
    merged: Boolean(item.merged || item.status === "merged"),
    merged_at: item.merged_at || "",
    verification_status: item.verification_status || "",
    tested: Boolean(item.tested),
    tested_at: item.tested_at || "",
    test_note: item.test_note || "",
    test_evidence: Array.isArray(item.test_evidence) ? item.test_evidence : [],
    is_draft: Boolean(item.is_draft),
    created_at: item.created_at || "",
    updated_at: item.updated_at || utcNow(),
    review_body: item.review_body || item.suggested_review || "",
    patch_excerpt: item.patch_excerpt || "",
    decision,
    execution: item.execution || {},
  };
}

function emptyBatch() {
  return {
    batch_id: "empty",
    generated_at: utcNow(),
    source: "kelly-pr-review",
    mode: "app-in-skill",
    metrics: {},
    items: [],
  };
}

function findItem(batch, itemId) {
  const item = (batch.items || []).find((candidate) => String(candidate.id) === String(itemId));
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  return item;
}

// ---- Workflow predicates (was workflow.ts) ----

function isNeedsReview(item) {
  return item.status === "needs_review";
}
function isToApprove(item) {
  return item.status === "to_approve";
}
function isDone(item) {
  return item.status === "done" || item.execution?.status === "executed";
}
function isApprovedForExecution(item) {
  // An item that has already been executed is terminal ("done"); it must not
  // keep counting as "approved" just because decision.approved_for_execution
  // was never cleared after execute_decisions.ts ran.
  if (isDone(item)) return false;
  return item.status === "approved" || Boolean(item.decision?.approved_for_execution);
}
function isBlocked(item) {
  return item.status === "blocked" || item.decision?.action === "block";
}

// ---- Tested cache (was tested-cache.ts) ----

function safePart(value, fallback = "item") {
  return (
    String(value || fallback)
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || fallback
  );
}

function extensionFor(contentType, filename = "") {
  const ext = path.extname(filename || "").toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return ext;
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  return ".png";
}

function normalizeEntry(itemId: string, value: RawTestedEntry | null): TestedCacheEntry | null {
  if (!value || value.tested === false) return null;
  const testedAt = value.tested_at || value.updated_at || utcNow();
  return {
    id: itemId,
    tested: true,
    tested_at: testedAt,
    note: value.note || "",
    evidence: Array.isArray(value.evidence) ? value.evidence : [],
    updated_at: value.updated_at || testedAt,
  };
}

function applyTestedCache(items, cache: TestedCache) {
  return items.map((item) => {
    const entry = cache.items?.[item.id];
    const merged = Boolean(item.merged || item.status === "merged");
    const tested = Boolean(merged && entry?.tested);
    return {
      ...item,
      verification_status: merged ? (tested ? "tested" : "needs_test") : "",
      tested,
      tested_at: tested ? entry.tested_at || "" : "",
      test_note: tested ? entry.note || "" : "",
      test_evidence: tested ? entry.evidence || [] : [],
    };
  });
}

// ---- State payload helpers (was state.ts) ----

function countByWorkflow(items) {
  return {
    needs_review: items.filter(isNeedsReview).length,
    to_approve: items.filter(isToApprove).length,
    approved: items.filter(isApprovedForExecution).length,
    done: items.filter(isDone).length,
    blocked: items.filter(isBlocked).length,
    needs_test: items.filter((item) => item.verification_status === "needs_test").length,
    tested: items.filter((item) => item.verification_status === "tested").length,
  };
}

function withReviewRefs(items) {
  return items.map((item, index) => ({
    ...item,
    review_number: index + 1,
    review_ref: item.review_ref || `Review #${index + 1}`,
  }));
}

function matchesMode(item, mode) {
  if (mode === "all") return true;
  if (mode === "needs_review") return isNeedsReview(item);
  if (mode === "to_approve") return isToApprove(item);
  if (mode === "approved") return isApprovedForExecution(item);
  if (mode === "done") return isDone(item);
  if (mode === "blocked") return isBlocked(item);
  if (mode === "needs_test") return item.verification_status === "needs_test";
  if (mode === "tested") return item.verification_status === "tested";
  return item.status === mode;
}

function reposFor(items) {
  const counts = new Map();
  for (const item of items) {
    if (!item.repo) continue;
    counts.set(item.repo, (counts.get(item.repo) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, count]) => ({ repo, count }));
}

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  async function ensureDirs() {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(BATCH_DIR, { recursive: true });
  }

  async function loadBatch() {
    await ensureDirs();
    if (!(await pathExists(CURRENT_BATCH_PATH))) return emptyBatch();
    const batch = await readJson(CURRENT_BATCH_PATH);
    batch.items = (batch.items || []).map(normalizeItem);
    return batch;
  }

  async function saveBatch(batch) {
    await ensureDirs();
    batch.updated_at = utcNow();
    batch.items = (batch.items || []).map(normalizeItem);
    await writeJson(CURRENT_BATCH_PATH, batch);
    await writeJson(path.join(BATCH_DIR, `${batch.batch_id || "current"}.json`), batch);
  }

  async function writeDecisions(batch) {
    const decisions = [];
    for (const item of batch.items || []) {
      const decision = item.decision || {};
      if (!decision.action) continue;
      decisions.push({
        id: item.id,
        repo: item.repo,
        number: item.number,
        title: item.title,
        url: item.url,
        proposed_action: item.proposed_action,
        decision,
        review_body: item.review_body || decision.review_body || "",
      });
    }
    const payload = { batch_id: batch.batch_id, updated_at: utcNow(), decisions };
    await writeJson(DECISIONS_PATH, payload);
    return payload;
  }

  async function loadTestedCache(): Promise<TestedCache> {
    const payload = (await readJson(TESTED_PATH, { updated_at: "", items: {} })) as RawTestedPayload;
    const items: Record<string, TestedCacheEntry> = {};
    for (const [id, value] of Object.entries(payload.items || {})) {
      const entry = normalizeEntry(id, value);
      if (entry) items[id] = entry;
    }
    return { updated_at: payload.updated_at || "", items };
  }

  async function persistEvidence(itemId: string, evidence: EvidenceUpload[] = []): Promise<TestEvidence[]> {
    const saved: TestEvidence[] = [];
    const dir = path.join(TEST_EVIDENCE_DIR, safePart(itemId));
    await fs.mkdir(dir, { recursive: true });
    for (const [index, file] of evidence.entries()) {
      const contentType = String(file.content_type || file.type || "");
      if (!IMAGE_TYPES.has(contentType)) throw new Error("Test evidence must be an image screenshot.");
      const base64 = String(file.base64 || "").replace(/^data:[^;]+;base64,/, "");
      const bytes = Buffer.from(base64, "base64");
      if (!bytes.length) throw new Error("Uploaded screenshot is empty.");
      if (bytes.length > MAX_EVIDENCE_BYTES) throw new Error("Uploaded screenshot is too large.");
      const now = utcNow();
      const filenameBase = safePart(
        path.basename(file.filename || "screenshot", path.extname(file.filename || "")),
        "screenshot",
      );
      const filename = `${Date.now()}-${index + 1}-${filenameBase}${extensionFor(contentType, file.filename)}`;
      const fullPath = path.join(dir, filename);
      await fs.writeFile(fullPath, bytes);
      saved.push({
        filename: file.filename || filename,
        content_type: contentType,
        size: bytes.length,
        path: fullPath,
        url: `/test-evidence/${encodeURIComponent(safePart(itemId))}/${encodeURIComponent(filename)}`,
        uploaded_at: now,
      });
    }
    return saved;
  }

  async function lockPayload() {
    if (!(await pathExists(LOCK_PATH))) return { locked: false };
    let raw: { message?: string; owner?: string; started_at?: string };
    try {
      raw = (await readJson(LOCK_PATH, {})) as typeof raw;
    } catch {
      raw = { message: DEFAULT_LOCK_MESSAGE };
    }
    return {
      locked: true,
      path: LOCK_PATH,
      message: raw.message || DEFAULT_LOCK_MESSAGE,
      owner: raw.owner || "kelly-pr-review",
      started_at: raw.started_at,
    };
  }

  async function rejectIfLocked() {
    const lock = await lockPayload();
    if (lock.locked) throw new Error(lock.message || DEFAULT_LOCK_MESSAGE);
  }

  return {
    kind: "local",

    configSummary() {
      // `reader` carries the provider name; in local mode it stays "local" so
      // the /api/state payload is byte-identical to the pre-provider server.
      return publicConfigSummary(meta as never);
    },

    async getLock() {
      return lockPayload();
    },

    async loadBatch() {
      return loadBatch();
    },

    async saveBatch(batch) {
      await saveBatch(batch);
    },

    async writeDecisions(batch) {
      return writeDecisions(batch);
    },

    async readDecisions(fallback: unknown = null) {
      return readJsonOrNull(DECISIONS_PATH, fallback);
    },

    async readExecutionReport(fallback: unknown = {}) {
      return readJsonOrNull(EXECUTION_REPORT_PATH, fallback);
    },

    async writeExecutionReport(report) {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    async getState(query: StateQuery = {}) {
      const batch = await loadBatch();
      const testedCache = await loadTestedCache();
      const allItems = applyTestedCache(withReviewRefs((batch.items || []).map(normalizeItem)), testedCache);
      const mode = normalizeQueryValue(query.mode, "all");
      const search = normalizeQueryValue(query.q, "").toLowerCase().trim();
      const repo = normalizeQueryValue(query.repo, "all");
      const repoItems = repo && repo !== "all" ? allItems.filter((item) => item.repo === repo) : allItems;
      let items = repoItems.filter((item) => matchesMode(item, mode));
      if (search) {
        items = items.filter((item) =>
          `${item.review_ref} ${item.repo} ${item.number} ${item.title} ${item.author} ${item.summary}`
            .toLowerCase()
            .includes(search),
        );
      }
      items.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
      return {
        app: "kelly-pr-review",
        batch: {
          batch_id: batch.batch_id,
          generated_at: batch.generated_at,
          updated_at: batch.updated_at,
          source: batch.source,
          mode: batch.mode,
          metrics: batch.metrics || countByWorkflow(allItems),
        },
        counts: countByWorkflow(repoItems),
        repos: reposFor(allItems),
        selected_repo: repo || "all",
        items,
        total_cached: repoItems.length,
        total_all_repos: allItems.length,
        batch_path: CURRENT_BATCH_PATH,
        decisions_path: DECISIONS_PATH,
        tested_path: TESTED_PATH,
        execution_report_path: EXECUTION_REPORT_PATH,
        config_summary: this.configSummary(),
        execution_report: await readJson(EXECUTION_REPORT_PATH, {}),
        lock: await lockPayload(),
      };
    },

    async saveDecision(body) {
      await rejectIfLocked();
      const batch = await loadBatch();
      const ids = (body.ids || []).map(String);
      const action = body.action;
      const comment = body.comment || "";
      if (!ids.length) throw new Error("No items selected");
      if (!LOCAL_ACTIONS.has(action)) throw new Error(`Unsupported decision: ${action}`);
      const changed = [];
      for (const id of ids) {
        const item = findItem(batch, id);
        item.status = statusForAction(action);
        item.decision = {
          action,
          comment,
          review_body: body.review_body ?? item.review_body ?? "",
          approved_for_execution: APPROVED_ACTIONS.includes(action),
          decided_at: utcNow(),
        };
        if (body.review_body !== undefined) item.review_body = body.review_body || "";
        item.updated_at = utcNow();
        changed.push(item.id);
      }
      await saveBatch(batch);
      const decisions = await writeDecisions(batch);
      return { changed, decisions: decisions.decisions.length };
    },

    async saveDetail(body) {
      await rejectIfLocked();
      const batch = await loadBatch();
      const item = findItem(batch, String(body.id));
      if (Object.hasOwn(body, "review_body")) item.review_body = body.review_body || "";
      if (Object.hasOwn(body, "comment")) {
        item.decision = {
          ...(item.decision || {}),
          comment: body.comment || "",
          decided_at: item.decision?.decided_at || utcNow(),
        };
      }
      item.updated_at = utcNow();
      await saveBatch(batch);
      const decisions = await writeDecisions(batch);
      return { id: item.id, decisions: decisions.decisions.length };
    },

    async setTested(itemId: string, tested: boolean, options: SetTestedOptions = {}) {
      await rejectIfLocked();
      const batch = await loadBatch();
      const item = findItem(batch, String(itemId || ""));
      if (!item.merged && item.status !== "merged")
        throw new Error("Only merged pull requests can enter test verification.");
      const cache = await loadTestedCache();
      const id = String(itemId || "");
      if (!id) throw new Error("Missing item id");
      const now = utcNow();
      if (tested) {
        const note = String(options.note || "").trim();
        const evidence = await persistEvidence(id, options.evidence || []);
        const existingEvidence = cache.items[id]?.evidence || [];
        if (!note && !evidence.length && !existingEvidence.length) {
          throw new Error("Add a test note or upload a screenshot before marking this PR tested.");
        }
        cache.items[id] = {
          id,
          tested: true,
          note,
          evidence: [...existingEvidence, ...evidence],
          tested_at: cache.items[id]?.tested_at || now,
          updated_at: now,
        };
      } else {
        delete cache.items[id];
      }
      const payload = { updated_at: now, items: cache.items };
      await writeJson(TESTED_PATH, payload);
      return payload.items[id] || { id, tested: false, tested_at: "", updated_at: now };
    },
  };
}

function statusForAction(action) {
  if (APPROVED_ACTIONS.includes(action)) return "approved";
  if (action === "block") return "blocked";
  return "needs_review";
}

// Keep the shared HttpError type referenced so busabase-provider (which throws
// status-coded errors) stays type-aligned with this default implementation.
export type { HttpError };
