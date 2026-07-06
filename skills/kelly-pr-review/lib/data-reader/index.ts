import { loadLocalConfig } from "./local-file-reader.ts";

// Config loading is provider-neutral: it always reads config.local.json /
// config.example.json (+ .env) from disk so every provider — local or busabase —
// can find its settings (including config.busabase). Which data-provider is
// active is decided in lib/data-provider/index.ts via
// KELLY_PR_REVIEW_DATA_PROVIDER, not here.
export async function loadConfigWithMeta() {
  return loadLocalConfig();
}
