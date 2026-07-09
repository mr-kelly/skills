import { existsSync, readFileSync } from "node:fs";
import type { Config, ConfigMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import {
  CONFIG_EXAMPLE_PATH,
  USER_CONFIG_PATH,
  USER_ENV_PATH,
  loadConfigWithMeta as loadLocalConfigWithMeta,
  loadDotenv as loadLocalDotenv,
  configFileCandidates as localConfigFileCandidates,
  envFileCandidates as localEnvFileCandidates,
  privateConfigCandidates as localPrivateConfigCandidates,
} from "./local-file-provider.ts";
import { type EmailDataProvider, assertProvider } from "./provider-interface.ts";

let cachedProvider: EmailDataProvider | null = null;
let cachedKind = "";

export function dataProviderKind() {
  const envKind = process.env.KELLY_EMAIL_DATA_PROVIDER || process.env.KELLY_EMAIL_DATA_READER;
  if (envKind) return envKind.trim().toLowerCase();
  for (const candidate of localConfigFileCandidates()) {
    try {
      if (!existsSync(candidate)) continue;
      if (candidate === CONFIG_EXAMPLE_PATH) continue;
      const parsed = JSON.parse(readFileSync(candidate, "utf8"));
      if (parsed?.data_provider) return String(parsed.data_provider).trim().toLowerCase();
    } catch {
      // Ignore malformed config here; loadConfigWithMeta reports parse errors on
      // the normal config path. Provider selection falls back to local.
    }
  }
  return "local";
}

// Back-compat alias for callers that still import the old name.
export const dataReaderKind = dataProviderKind;

export function createProvider(): EmailDataProvider {
  const kind = dataProviderKind();
  if (cachedProvider && cachedKind === kind) return cachedProvider;
  let provider: EmailDataProvider;
  if (kind === "local") provider = createLocalFileProvider();
  else if (kind === "busabase") provider = createBusabaseProvider();
  else throw new Error(`Unknown KELLY_EMAIL_DATA_PROVIDER: "${kind}" (expected "local" or "busabase")`);
  cachedProvider = assertProvider(kind, provider);
  cachedKind = kind;
  return cachedProvider;
}

export const getProvider = createProvider;

export function envFileCandidates() {
  if (dataProviderKind() !== "local") return localEnvFileCandidates();
  return localEnvFileCandidates();
}

export function configFileCandidates() {
  if (dataProviderKind() !== "local") return localConfigFileCandidates();
  return localConfigFileCandidates();
}

export function privateConfigCandidates() {
  if (dataProviderKind() !== "local") return localPrivateConfigCandidates();
  return localPrivateConfigCandidates();
}

export async function loadDotenv() {
  return createProvider().loadDotenv();
}

export const loadDotenvFiles = loadDotenv;

export async function loadConfigWithMeta() {
  return createProvider().loadConfigWithMeta();
}

export async function loadConfig() {
  return createProvider().loadConfig();
}

export function onboardingStatus(config: Config, meta: ConfigMeta = {}) {
  return createProvider().onboardingStatus(config, meta as any);
}

export { CONFIG_EXAMPLE_PATH, USER_CONFIG_PATH, USER_ENV_PATH, loadLocalConfigWithMeta, loadLocalDotenv };
