// Path constants now live in lib/paths.ts (the canonical, provider-neutral
// resolver). This file re-exports them so existing server/script imports of
// "./paths.ts" / "../app/server/paths.ts" keep working unchanged.
export * from "../../lib/paths.ts";
