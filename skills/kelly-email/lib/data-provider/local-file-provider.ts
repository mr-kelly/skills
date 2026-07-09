import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ROOT_DIR, SKILL_DIR } from "../paths.ts";
import {
  ATTACHMENTS_DIR,
  BATCH_DIR,
  CURRENT_BATCH_PATH,
  DECISIONS_PATH,
  EMAIL_RECORDS_PATH,
  LOCK_PATH,
  REPORTS_DIR,
} from "../paths.ts";
import type { Batch } from "../types.ts";
import type { Config, ConfigWithMeta } from "../types.ts";
import { batchFromEmailRecords, rowsFromBatch } from "./email-records.ts";
import type { AttachmentInput, AttachmentResult, DecisionInput, DetailInput } from "./provider-interface.ts";
import {
  applyDetailUpdate,
  applyItemsDecision,
  decisionsFromBatch,
  emptyBatch,
  normalizeBatch,
  utcNow,
} from "./provider-utils.ts";

export const CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.json");
export const LEGACY_CONFIG_LOCAL_PATH = path.join(SKILL_DIR, "config.local.yml");
export const CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, "config.example.json");
export const LEGACY_CONFIG_EXAMPLE_PATH = path.join(SKILL_DIR, "config.example.yml");
export const REPO_ENV_PATH = path.join(ROOT_DIR, ".env");
export const SKILL_ENV_PATH = path.join(SKILL_DIR, ".env.local");
export const USER_CONFIG_DIR = path.join(os.homedir(), ".config", "kelly-email");
export const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, "config.json");
export const LEGACY_USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, "config.yml");
export const USER_ENV_PATH = path.join(USER_CONFIG_DIR, ".env");

export function envFileCandidates() {
  return [process.env.KELLY_EMAIL_ENV_FILE, REPO_ENV_PATH, SKILL_ENV_PATH, USER_ENV_PATH].filter(Boolean);
}

export function configFileCandidates() {
  return [process.env.KELLY_EMAIL_CONFIG, CONFIG_LOCAL_PATH, USER_CONFIG_PATH, CONFIG_EXAMPLE_PATH].filter(Boolean);
}

export function privateConfigCandidates() {
  return [process.env.KELLY_EMAIL_CONFIG, CONFIG_LOCAL_PATH, USER_CONFIG_PATH].filter(Boolean);
}

export function legacyConfigFileCandidates() {
  return [LEGACY_CONFIG_LOCAL_PATH, LEGACY_USER_CONFIG_PATH, LEGACY_CONFIG_EXAMPLE_PATH].filter(Boolean);
}

async function loadDotenvFile(pathname) {
  if (!existsSync(pathname)) return false;
  const text = await fs.readFile(pathname, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}

export async function loadDotenv() {
  const loaded = [];
  for (const pathname of envFileCandidates()) {
    if (await loadDotenvFile(pathname)) loaded.push(pathname);
  }
  return loaded;
}

export async function loadConfigWithMeta() {
  const candidates = configFileCandidates();
  const source = candidates.find((candidate) => existsSync(candidate));
  const legacyCandidates = legacyConfigFileCandidates();
  const legacySource = legacyCandidates.find((candidate) => existsSync(candidate));
  const sourceIsLegacy = Boolean(source && /\.(ya?ml)$/i.test(source));
  const baseMeta = {
    reader: "local",
    provider: "local_file",
    candidates,
    legacy_candidates: legacyCandidates,
    legacy_source: sourceIsLegacy ? source : legacySource || "",
    recommended_config: USER_CONFIG_PATH,
    recommended_env: USER_ENV_PATH,
    example_config: CONFIG_EXAMPLE_PATH,
    legacy_config_format: Boolean(sourceIsLegacy || legacySource),
  };
  if (!source || sourceIsLegacy) {
    return {
      config: { mailboxes: [], identities: [] },
      source: "",
      is_example: false,
      has_private_config: false,
      ...baseMeta,
    };
  }
  const parsed = JSON.parse(await fs.readFile(source, "utf8")) || {};
  if (!Array.isArray(parsed.mailboxes)) parsed.mailboxes = [];
  if (!Array.isArray(parsed.identities)) parsed.identities = [];
  const isExample = path.resolve(source) === path.resolve(CONFIG_EXAMPLE_PATH);
  return {
    config: isExample ? { mailboxes: [], identities: [] } : parsed,
    source,
    is_example: isExample,
    has_private_config: !isExample && privateConfigCandidates().some((candidate) => existsSync(candidate)),
    ...baseMeta,
  };
}

export function onboardingStatus(config: Config, meta: ConfigWithMeta = {} as ConfigWithMeta) {
  const mailboxes = config.mailboxes || [];
  const reader = meta.reader || "local";
  if (meta.is_example || !meta.has_private_config || !mailboxes.length) {
    const legacyMessage =
      meta.legacy_config_format && meta.legacy_source
        ? `Found legacy YAML config at ${meta.legacy_source}, but Kelly Email is now zero-dependency and reads JSON only. Convert it to ${USER_CONFIG_PATH} or set KELLY_EMAIL_CONFIG to a JSON file before scanning mail.`
        : "";
    return {
      configured: false,
      state: meta.legacy_config_format ? "needs_json_config" : "needs_config",
      reader,
      message:
        legacyMessage ||
        (reader === "local"
          ? "No private Kelly Email configuration found. Copy config.example.json to ~/.config/kelly-email/config.json, fill mailboxes, identities, profile, style, official URLs, and knowledge sources, then add secrets to ~/.config/kelly-email/.env before scanning mail."
          : `No usable Kelly Email configuration found from data provider ${reader}. Configure that provider before scanning mail.`),
      missing_env: [],
      config_candidates: meta.candidates || configFileCandidates(),
      legacy_source: meta.legacy_source || "",
      recommended_config: meta.recommended_config || USER_CONFIG_PATH,
      recommended_env: meta.recommended_env || USER_ENV_PATH,
      example_config: meta.example_config || CONFIG_EXAMPLE_PATH,
    };
  }
  const missingEnv = [];
  for (const mailbox of mailboxes) {
    for (const envName of [mailbox.imap?.password_env, mailbox.smtp?.password_env].filter(Boolean)) {
      if (!process.env[envName]) missingEnv.push(envName);
    }
  }
  return {
    configured: missingEnv.length === 0,
    state: missingEnv.length ? "missing_secrets" : "ready",
    reader,
    message: missingEnv.length
      ? "Kelly Email config is present, but one or more required secret env vars are missing."
      : "Kelly Email config is ready.",
    missing_env: [...new Set(missingEnv)],
    config_candidates: meta.candidates || configFileCandidates(),
    recommended_config: meta.recommended_config || USER_CONFIG_PATH,
    recommended_env: meta.recommended_env || USER_ENV_PATH,
    example_config: meta.example_config || CONFIG_EXAMPLE_PATH,
  };
}

async function pathExists(pathname: string) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function readJson(pathname: string, fallback?: unknown): Promise<any> {
  if (!(await pathExists(pathname))) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${pathname}`);
  }
  return JSON.parse(await fs.readFile(pathname, "utf8"));
}

async function writeJson(pathname: string, value: unknown) {
  await fs.mkdir(path.dirname(pathname), { recursive: true });
  const tempPath = `${pathname}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, pathname);
}

async function ensureDataDirs() {
  await fs.mkdir(path.dirname(EMAIL_RECORDS_PATH), { recursive: true });
  await fs.mkdir(path.dirname(CURRENT_BATCH_PATH), { recursive: true });
  await fs.mkdir(BATCH_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

async function readEmailRecords() {
  const rows = await readJson(EMAIL_RECORDS_PATH, []);
  return Array.isArray(rows) ? rows : [];
}

async function writeEmailRecords(batch: Batch) {
  await writeJson(EMAIL_RECORDS_PATH, rowsFromBatch(batch));
}

async function readBatchFromRecords() {
  const rows = await readEmailRecords();
  return rows.length ? batchFromEmailRecords(rows) : null;
}

function safeFilename(value: unknown, fallback: string) {
  const source = String(value || fallback || "attachment.bin")
    .replace(/[/:\\]/g, "_")
    .replace(/[^\p{L}\p{N}._()[\]\- @]+/gu, "_")
    .replace(/^[ ._]+|[ ._]+$/g, "")
    .slice(0, 160);
  return source || fallback || "attachment.bin";
}

function contentBuffer(attachment: AttachmentInput) {
  const content = attachment.content;
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === "string") return Buffer.from(content);
  return Buffer.alloc(0);
}

const DEFAULT_LOCK_MESSAGE = "/kelly-email is processing this batch.";

export function createLocalFileProvider() {
  return {
    kind: "local",
    loadDotenv,
    loadConfigWithMeta,
    async loadConfig() {
      return (await loadConfigWithMeta()).config;
    },
    onboardingStatus,

    async getBatch(): Promise<Batch> {
      await ensureDataDirs();
      const recordsBatch = await readBatchFromRecords();
      if (recordsBatch) return recordsBatch;
      if (await pathExists(CURRENT_BATCH_PATH)) return normalizeBatch(await readJson(CURRENT_BATCH_PATH));
      return emptyBatch();
    },

    async saveBatch(batch: Batch) {
      await ensureDataDirs();
      const next = normalizeBatch({ ...batch, updated_at: utcNow() });
      await writeEmailRecords(next);
      await writeJson(CURRENT_BATCH_PATH, next);
      await writeJson(path.join(BATCH_DIR, `${next.batch_id || "current"}.json`), next);
      return next;
    },

    async getDecisions() {
      const batch = await this.getBatch();
      return decisionsFromBatch(batch);
    },

    async writeDecisions(batch: Batch) {
      const payload = decisionsFromBatch(batch);
      await writeJson(DECISIONS_PATH, payload);
      return payload;
    },

    async updateItems(input: DecisionInput) {
      await this.rejectIfLocked();
      const batch = await this.getBatch();
      const changed = applyItemsDecision(batch, input);
      await this.saveBatch(batch);
      const decisions = await this.writeDecisions(batch);
      return { changed, decisions: decisions.decisions?.length || 0 };
    },

    async updateDetail(input: DetailInput) {
      await this.rejectIfLocked();
      const batch = await this.getBatch();
      const item = applyDetailUpdate(batch, input);
      await this.saveBatch(batch);
      const decisions = await this.writeDecisions(batch);
      return { id: item.id, decisions: decisions.decisions?.length || 0 };
    },

    async getLock() {
      if (!(await pathExists(LOCK_PATH))) return { locked: false };
      let raw: { message?: string; owner?: string; started_at?: string };
      try {
        raw = await readJson(LOCK_PATH, {});
      } catch {
        raw = { message: DEFAULT_LOCK_MESSAGE };
      }
      return {
        locked: true,
        path: LOCK_PATH,
        message: raw.message || DEFAULT_LOCK_MESSAGE,
        owner: raw.owner || "kelly-email-agent",
        started_at: raw.started_at,
      };
    },

    async rejectIfLocked() {
      const lock = await this.getLock();
      if (lock.locked) throw new Error(String(lock.message || DEFAULT_LOCK_MESSAGE));
    },

    async writeLock(message: string) {
      await ensureDataDirs();
      await writeJson(LOCK_PATH, {
        owner: "kelly-email-agent",
        message,
        started_at: utcNow(),
      });
    },

    async clearLock() {
      try {
        await fs.unlink(LOCK_PATH);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },

    async writeExecutionReport(batch: Batch, report: Record<string, unknown>, stamp = "") {
      await ensureDataDirs();
      const reportStamp =
        stamp ||
        new Date()
          .toISOString()
          .replace(/[-:T.Z]/g, "")
          .slice(0, 14);
      const pathname = path.join(REPORTS_DIR, `${batch.batch_id}-${reportStamp}.json`);
      await writeJson(pathname, report);
      return { path: pathname };
    },

    async clearBatchAttachments(batchId: string) {
      await fs.rm(path.join(ATTACHMENTS_DIR, batchId), { recursive: true, force: true });
    },

    async persistAttachments(
      batchId: string,
      itemId: string,
      htmlBody: string,
      attachments: AttachmentInput[],
    ): Promise<AttachmentResult> {
      const itemDir = path.join(ATTACHMENTS_DIR, batchId, itemId);
      await fs.mkdir(itemDir, { recursive: true });
      const cidUrls = new Map<string, string>();
      const saved: AttachmentInput[] = [];

      for (const [index, attachment] of attachments.entries()) {
        const content = contentBuffer(attachment);
        let filename = safeFilename(
          attachment.filename,
          `attachment-${index + 1}${path.extname(attachment.filename || "") || ".bin"}`,
        );
        let pathname = path.join(itemDir, filename);
        if (existsSync(pathname)) {
          const extension = path.extname(filename);
          const stem = path.basename(filename, extension);
          filename = `${stem}-${index + 1}${extension}`;
          pathname = path.join(itemDir, filename);
        }
        await fs.writeFile(pathname, content);
        const url = `/attachments/${batchId}/${itemId}/${filename}`;
        const contentId = String(attachment.contentId || attachment.content_id || "").replace(/^<|>$/g, "");
        if (contentId) cidUrls.set(contentId, url);
        const contentType = attachment.contentType || attachment.content_type || "application/octet-stream";
        saved.push({
          filename,
          content_type: contentType,
          size: attachment.size || content.length,
          content_id: contentId,
          url,
          preview: String(contentType).startsWith("image/") || contentType === "application/pdf",
        });
      }

      let html = htmlBody || "";
      for (const [contentId, url] of cidUrls.entries()) {
        html = html.replaceAll(`cid:${contentId}`, url).replaceAll(`CID:${contentId}`, url);
      }
      return { html, attachments: saved };
    },

    async providerStatus() {
      return {
        ok: true,
        provider: "local",
        mode: "local",
        message: "Kelly Email is using local file storage.",
      };
    },

    async init() {
      await ensureDataDirs();
      return {
        ok: true,
        provider: "local",
        mode: "local",
        message: "Kelly Email local file storage is ready.",
      };
    },
  };
}
