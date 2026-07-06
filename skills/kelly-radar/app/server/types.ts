// Core domain types are defined once in lib/types.ts (the data-provider layer's
// source of truth) and re-exported here so the server modules, demo.ts, and the
// scripts can keep importing from ./types.ts without churn.
export * from "../../lib/types.ts";
