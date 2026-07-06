// Domain types now live in lib/types.ts (shared by the data-provider layer, the
// server, and the scripts). This module re-exports them so existing
// server-local imports (demo.ts, etc.) keep working.
export * from "../../lib/types.ts";
