// Domain types now live in lib/types.ts (shared with the data-provider layer).
// This file re-exports them so existing server/script imports of "./types.ts" /
// "../app/server/types.ts" keep working unchanged.
export * from "../../lib/types.ts";
