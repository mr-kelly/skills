import { createBusabaseProvider } from "./busabase-provider.js";
import { assertProvider } from "./provider-interface.js";

let cachedProvider = null;

export function dataProviderKind() {
  return "busabase";
}

export const dataReaderKind = dataProviderKind;

export function createProvider() {
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

export function onboardingStatus(config, meta = {}) {
  return createProvider().onboardingStatus(config, meta);
}
