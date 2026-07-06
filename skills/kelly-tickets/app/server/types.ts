// Domain types now live in lib/types.ts (shared by the data-provider layer, the
// server, and the scripts). Re-export them here so existing server/demo imports
// (`./types.ts`) keep working unchanged.
export type * from "../../lib/types.ts";
