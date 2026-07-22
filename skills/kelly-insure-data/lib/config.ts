import fs from "node:fs/promises";
import path from "node:path";
import { SKILL_DIR } from "./paths.ts";
import type { Config, ConfigResult, ConfigSummary, FieldMapping } from "./types.ts";

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function loadDotenvFiles(files: string[]): Promise<void> {
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
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_INSURE_DATA_CONFIG) paths.push(process.env.KELLY_INSURE_DATA_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-insure-data", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_INSURE_DATA_ENV_FILE) paths.push(process.env.KELLY_INSURE_DATA_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-insure-data", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

export function recordLimit(config: Config): number {
  const raw = process.env.KELLY_INSURE_DATA_BUSABASE_RECORD_LIMIT || config.busabase?.record_limit || 200;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 200;
}

type MappingKind = "qa" | "featured" | "notices" | "news" | "feedback";

export function fieldMapping(kind: MappingKind, config: Config): FieldMapping {
  const informationDefaults = {
    title: "title",
    summary: "content",
    url: "source_url",
    source: "carrier",
    published_at: "published_at",
    category: "category",
    status: "status",
  };
  const defaults =
    kind === "qa"
      ? { question: "question", answer: "answer", source: "carrier", source_path: "source_path", status: "status" }
      : kind === "featured" || kind === "notices" || kind === "news"
        ? informationDefaults
        : {
            title: "title",
            content: "content",
            source: "source",
            user_name: "user_name",
            contact: "contact",
            rating: "rating",
            category: "category",
            tags: "tags",
            created_at: "created_at",
            status: "status",
          };
  const legacyNews = config.taxonomy?.news_fields || {};
  const overrides =
    kind === "qa"
      ? config.taxonomy?.qa_fields || {}
      : kind === "featured"
        ? { ...legacyNews, ...(config.taxonomy?.featured_fields || {}) }
        : kind === "notices" || kind === "news"
          ? { ...legacyNews, ...(config.taxonomy?.notices_fields || {}) }
          : config.taxonomy?.feedback_fields || {};
  return { ...defaults, ...overrides };
}

function configured(value: unknown, fallback: string): string {
  return String(value || fallback);
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const busa = config.busabase || {};
  const apiKeyEnv = busa.api_key_env || "KELLY_INSURE_DATA_BUSABASE_API_KEY";
  const noticesId = process.env.KELLY_INSURE_DATA_BUSABASE_NOTICES_BASE_ID ||
    busa.notices_base_id || process.env.KELLY_INSURE_DATA_BUSABASE_NEWS_BASE_ID || busa.news_base_id || "";
  const noticesSlug = configured(busa.notices_base_slug || busa.news_base_slug, "insurance-news");
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    operator: {
      name: config.operator?.name || "",
      role: config.operator?.role || "",
      timezone: config.operator?.timezone || "",
    },
    busabase: {
      base_url: process.env.KELLY_INSURE_DATA_BUSABASE_URL || busa.base_url || "",
      space_id: process.env.KELLY_INSURE_DATA_BUSABASE_SPACE_ID || busa.space_id || "",
      api_key_env: apiKeyEnv,
      api_key_ready: Boolean(process.env[apiKeyEnv] || process.env.KELLY_INSURE_DATA_BUSABASE_API_KEY),
      drive_node_id: process.env.KELLY_INSURE_DATA_BUSABASE_DRIVE_NODE_ID || busa.drive_node_id || "",
      drive_node_slug: configured(busa.drive_node_slug, "hk-insurance-drive"),
      featured_base_id: process.env.KELLY_INSURE_DATA_BUSABASE_FEATURED_BASE_ID || busa.featured_base_id || "",
      featured_base_slug: configured(busa.featured_base_slug, "featured-information"),
      notices_base_id: String(noticesId),
      notices_base_slug: noticesSlug,
      news_base_id: String(noticesId),
      news_base_slug: noticesSlug,
      qa_base_id: process.env.KELLY_INSURE_DATA_BUSABASE_QA_BASE_ID || busa.qa_base_id || "",
      qa_base_slug: configured(busa.qa_base_slug, "insurance-qa"),
      feedback_base_id: process.env.KELLY_INSURE_DATA_BUSABASE_FEEDBACK_BASE_ID || busa.feedback_base_id || "",
      feedback_base_slug: configured(busa.feedback_base_slug, "user-feedback"),
      record_limit: recordLimit(config),
    },
    taxonomy: {
      file_metadata_fields: Array.isArray(config.taxonomy?.file_metadata_fields)
        ? config.taxonomy.file_metadata_fields
        : [],
      qa_fields: fieldMapping("qa", config),
      featured_fields: fieldMapping("featured", config),
      notices_fields: fieldMapping("notices", config),
      news_fields: fieldMapping("notices", config),
      feedback_fields: fieldMapping("feedback", config),
    },
  };
}
