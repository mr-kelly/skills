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

export function fieldMapping(kind: "qa" | "news", config: Config): FieldMapping {
  const defaults =
    kind === "qa"
      ? { question: "question", answer: "answer", category: "category", source: "source", tags: "tags" }
      : {
          title: "title",
          summary: "summary",
          url: "url",
          source: "source",
          published_at: "published_at",
          category: "category",
          tags: "tags",
        };
  return { ...defaults, ...(kind === "qa" ? config.taxonomy?.qa_fields || {} : config.taxonomy?.news_fields || {}) };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const busa = config.busabase || {};
  const apiKeyEnv = busa.api_key_env || "KELLY_INSURE_DATA_BUSABASE_API_KEY";
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
      qa_base_id: process.env.KELLY_INSURE_DATA_BUSABASE_QA_BASE_ID || busa.qa_base_id || "",
      news_base_id: process.env.KELLY_INSURE_DATA_BUSABASE_NEWS_BASE_ID || busa.news_base_id || "",
      record_limit: recordLimit(config),
    },
    taxonomy: {
      file_metadata_fields: Array.isArray(config.taxonomy?.file_metadata_fields)
        ? config.taxonomy.file_metadata_fields
        : [],
      qa_fields: fieldMapping("qa", config),
      news_fields: fieldMapping("news", config),
    },
  };
}
