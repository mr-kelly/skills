import { loadLocalConfig } from "./local-file-reader.ts";

export async function loadConfigWithMeta() {
  const reader = process.env.KELLY_PR_REVIEW_DATA_READER || "local";
  if (reader !== "local") {
    return {
      reader,
      configured: false,
      config: {},
      source: "",
      onboarding: {
        configured: false,
        state: "unsupported_reader",
        message: `Unsupported data reader: ${reader}`,
      },
    };
  }
  return loadLocalConfig();
}
