// Path constants now live in lib/paths.ts (the data-provider layer owns the
// on-disk layout). Re-exported here so existing app/server and scripts imports
// keep working unchanged.
export * from "../../lib/paths.ts";
