import fs from "node:fs/promises";
import path from "node:path";
import { findItem, loadBatch } from "./batch-store.ts";
import { rejectIfLocked } from "./lock.ts";
import { TESTED_PATH, TEST_EVIDENCE_DIR } from "./paths.ts";
import type {
  EvidenceUpload,
  RawTestedEntry,
  RawTestedPayload,
  SetTestedOptions,
  TestEvidence,
  TestedCache,
  TestedCacheEntry,
} from "./types.ts";
import { readJson, utcNow, writeJson } from "./utils.ts";

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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

export async function loadTestedCache(): Promise<TestedCache> {
  const payload = (await readJson(TESTED_PATH, { updated_at: "", items: {} })) as RawTestedPayload;
  const items: Record<string, TestedCacheEntry> = {};
  for (const [id, value] of Object.entries(payload.items || {})) {
    const entry = normalizeEntry(id, value);
    if (entry) items[id] = entry;
  }
  return {
    updated_at: payload.updated_at || "",
    items,
  };
}

export function applyTestedCache(items, cache) {
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

export async function setTested(
  itemId: string,
  tested: boolean,
  options: SetTestedOptions = {},
): Promise<TestedCacheEntry | { id: string; tested: false; tested_at: string; updated_at: string }> {
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
  const payload = {
    updated_at: now,
    items: cache.items,
  };
  await writeJson(TESTED_PATH, payload);
  return payload.items[id] || { id, tested: false, tested_at: "", updated_at: now };
}
