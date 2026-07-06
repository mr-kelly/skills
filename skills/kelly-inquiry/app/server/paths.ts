// Filesystem paths now live in lib/paths.ts (the data-provider layer's single
// source of truth). Re-exported here so the server, launcher, and scripts keep
// their original `./paths.ts` / `../app/server/paths.ts` imports unchanged.
export * from "../../lib/paths.ts";
