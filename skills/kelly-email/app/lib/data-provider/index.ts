import type { Config, ConfigMeta } from "../types.ts";
import { createBusabaseProvider } from "./busabase-provider.ts";
import { type EmailDataProvider, assertProvider } from "./provider-interface.ts";

let cachedProvider: EmailDataProvider | null = null;

export function dataProviderKind() {
  return "busabase";
}

export const dataReaderKind = dataProviderKind;

export function createProvider(): EmailDataProvider {
  if (!cachedProvider) cachedProvider = assertProvider("busabase", createBusabaseProvider());
  return cachedProvider;
}

export const getProvider = createProvider;

export async function loadDotenv() {
  return [];
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
