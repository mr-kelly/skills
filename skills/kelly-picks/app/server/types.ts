// Domain types now live in lib/types.ts (shared by the data-provider layer,
// server, and scripts). Re-exported here so existing app/server and scripts
// imports keep working unchanged.
export * from "../../lib/types.ts";
