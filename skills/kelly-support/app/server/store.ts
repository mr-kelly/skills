// Provider-neutral store helpers.
//
// The stateful read/write operations live in the data-provider layer
// (lib/data-provider/*); callers reach storage through createProvider(). What
// remains — constants, config loading, the SLA/CSAT math, and the support-qa
// quality gate — is provider-neutral and re-exported from
// lib/data-provider/store-core.ts. This module keeps the original `./store.ts`
// import path working for the scripts.
export * from "../../lib/data-provider/store-core.ts";
