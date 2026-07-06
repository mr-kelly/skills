// Path constants now live in lib/paths.ts (shared by the data-provider layer,
// the server, and the scripts). This module re-exports them so existing
// server-local imports keep working.
export * from "../../lib/paths.ts";
