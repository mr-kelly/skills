import { ENV_PREFIX } from "../types.ts";
import { createLocalFileProvider } from "./local-file-provider.ts";
import { type DataProvider, assertProvider } from "./provider-interface.ts";

export async function createProvider(): Promise<DataProvider> {
  const selected = String(process.env[`${ENV_PREFIX}_DATA_PROVIDER`] || "local").toLowerCase();
  if (selected === "local") return assertProvider("local", createLocalFileProvider());
  if (selected === "busabase") {
    throw new Error(
      "kelly-legal-firm-radar reserves the busabase provider name; this App-in-Skill currently ships the local-file provider.",
    );
  }
  throw new Error(`Unknown ${ENV_PREFIX}_DATA_PROVIDER: "${selected}"`);
}
