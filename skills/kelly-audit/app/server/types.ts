// Domain + provider types now live in lib/types.ts (shared by the data-provider
// layer, the server, and the scripts). Re-export them here so existing
// `./types.ts` imports across app/server and scripts keep working unchanged.
export * from "../../lib/types.ts";
