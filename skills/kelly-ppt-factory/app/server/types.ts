// Domain types are now defined once in lib/types.ts (shared by the
// data-provider layer, the server, and the batch scripts). This module re-exports
// them so existing `./types.ts` importers under app/server keep working.
export * from "../../lib/types.ts";
