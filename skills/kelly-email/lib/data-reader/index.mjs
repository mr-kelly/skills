import {
  CONFIG_EXAMPLE_PATH,
  USER_CONFIG_PATH,
  USER_ENV_PATH,
  configFileCandidates as localConfigFileCandidates,
  envFileCandidates as localEnvFileCandidates,
  loadConfigWithMeta as loadLocalConfigWithMeta,
  loadDotenv as loadLocalDotenv,
  privateConfigCandidates as localPrivateConfigCandidates
} from "./local-file-reader.mjs";

const REMOTE_READERS = new Set(["supabase", "postgres", "pg", "pusa-cloud", "pusabase"]);

export function dataReaderKind() {
  return (process.env.KELLY_EMAIL_DATA_READER || "local").trim().toLowerCase();
}

function unsupportedRemoteReader(kind) {
  const normalized = kind === "pg" ? "postgres" : kind === "pusabase" ? "pusa-cloud" : kind;
  return new Error(
    `KELLY_EMAIL_DATA_READER=${kind} is recognized as ${normalized}, but this reader is not implemented yet. ` +
      "Use KELLY_EMAIL_DATA_READER=local for now, or add a reader under lib/data-reader/."
  );
}

export function envFileCandidates() {
  const kind = dataReaderKind();
  if (kind === "local") return localEnvFileCandidates();
  if (REMOTE_READERS.has(kind)) return [];
  throw new Error(`Unknown KELLY_EMAIL_DATA_READER: ${kind}`);
}

export function configFileCandidates() {
  const kind = dataReaderKind();
  if (kind === "local") return localConfigFileCandidates();
  if (REMOTE_READERS.has(kind)) return [];
  throw new Error(`Unknown KELLY_EMAIL_DATA_READER: ${kind}`);
}

export function privateConfigCandidates() {
  const kind = dataReaderKind();
  if (kind === "local") return localPrivateConfigCandidates();
  if (REMOTE_READERS.has(kind)) return [];
  throw new Error(`Unknown KELLY_EMAIL_DATA_READER: ${kind}`);
}

export async function loadDotenv() {
  const kind = dataReaderKind();
  if (kind === "local") return loadLocalDotenv();
  if (REMOTE_READERS.has(kind)) throw unsupportedRemoteReader(kind);
  throw new Error(`Unknown KELLY_EMAIL_DATA_READER: ${kind}`);
}

export const loadDotenvFiles = loadDotenv;

export async function loadConfigWithMeta() {
  const kind = dataReaderKind();
  if (kind === "local") return loadLocalConfigWithMeta();
  if (REMOTE_READERS.has(kind)) throw unsupportedRemoteReader(kind);
  throw new Error(`Unknown KELLY_EMAIL_DATA_READER: ${kind}`);
}

export async function loadConfig() {
  return (await loadConfigWithMeta()).config;
}

export function onboardingStatus(config, meta = {}) {
  const mailboxes = config.mailboxes || [];
  const reader = meta.reader || dataReaderKind();
  if (meta.is_example || !meta.has_private_config || !mailboxes.length) {
    return {
      configured: false,
      state: "needs_config",
      reader,
      message:
        reader === "local"
          ? "No private Kelly Email configuration found. Copy config.example.yml to ~/.config/kelly-email/config.yml, fill mailboxes, identities, profile, style, official URLs, and knowledge sources, then add secrets to ~/.config/kelly-email/.env before scanning mail."
          : `No usable Kelly Email configuration found from data reader ${reader}. Configure that reader before scanning mail.`,
      missing_env: [],
      config_candidates: meta.candidates || configFileCandidates(),
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

