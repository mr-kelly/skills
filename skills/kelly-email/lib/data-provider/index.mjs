import {
  CONFIG_EXAMPLE_PATH,
  USER_CONFIG_PATH,
  USER_ENV_PATH,
  configFileCandidates as localConfigFileCandidates,
  envFileCandidates as localEnvFileCandidates,
  loadConfigWithMeta as loadLocalConfigWithMeta,
  loadDotenv as loadLocalDotenv,
  privateConfigCandidates as localPrivateConfigCandidates
} from "./local-file-provider.mjs";

// Config is read through this data-provider interface (scaffold convention).
// Today the only implementation is `local` (JSON/env files). A remote provider
// (e.g. busabase) would implement the same functions and be selected here.
// Selector: KELLY_EMAIL_DATA_PROVIDER (KELLY_EMAIL_DATA_READER kept as a
// backward-compatible alias).
export function dataProviderKind() {
  return (
    process.env.KELLY_EMAIL_DATA_PROVIDER ||
    process.env.KELLY_EMAIL_DATA_READER ||
    "local"
  )
    .trim()
    .toLowerCase();
}

// Back-compat alias for callers that still import the old name.
export const dataReaderKind = dataProviderKind;

function assertLocal() {
  const kind = dataProviderKind();
  if (kind !== "local") {
    throw new Error(
      `Unknown KELLY_EMAIL_DATA_PROVIDER: "${kind}" (only "local" is implemented).`,
    );
  }
}

export function envFileCandidates() {
  assertLocal();
  return localEnvFileCandidates();
}

export function configFileCandidates() {
  assertLocal();
  return localConfigFileCandidates();
}

export function privateConfigCandidates() {
  assertLocal();
  return localPrivateConfigCandidates();
}

export async function loadDotenv() {
  assertLocal();
  return loadLocalDotenv();
}

export const loadDotenvFiles = loadDotenv;

export async function loadConfigWithMeta() {
  assertLocal();
  return loadLocalConfigWithMeta();
}

export async function loadConfig() {
  return (await loadConfigWithMeta()).config;
}

export function onboardingStatus(config, meta = {}) {
  const mailboxes = config.mailboxes || [];
  const reader = meta.reader || dataReaderKind();
  if (meta.is_example || !meta.has_private_config || !mailboxes.length) {
    const legacyMessage = meta.legacy_config_format && meta.legacy_source
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
          : `No usable Kelly Email configuration found from data reader ${reader}. Configure that reader before scanning mail.`),
      missing_env: [],
      config_candidates: meta.candidates || configFileCandidates(),
      legacy_source: meta.legacy_source || "",
      recommended_config: meta.recommended_config || USER_CONFIG_PATH,
      recommended_env: meta.recommended_env || USER_ENV_PATH,
      example_config: meta.example_config || CONFIG_EXAMPLE_PATH
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
    example_config: meta.example_config || CONFIG_EXAMPLE_PATH
  };
}
