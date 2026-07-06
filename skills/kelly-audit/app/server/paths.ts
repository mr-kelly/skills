// Paths now live in lib/paths.ts (shared by the data-provider layer, the server,
// and the scripts). Re-export them here so existing `./paths.ts` imports across
// app/server and scripts keep working unchanged.
export * from "../../lib/paths.ts";
