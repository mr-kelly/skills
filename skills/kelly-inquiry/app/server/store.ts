// Provider-neutral store helpers.
//
// The stateful read/write operations that used to live here (getState, queueReply,
// decideApproval, setFollowUp, updateQuote, snapshot/lock IO) moved into the data-
// provider layer (lib/data-provider/*), so callers reach storage through
// createProvider() instead of importing store functions directly. What remains —
// constants, config loading, and the pure snapshot math — is provider-neutral and
// re-exported from lib/data-provider/store-core.ts. This module keeps the original
// `./store.ts` import path working for the scripts.
export * from "../../lib/data-provider/store-core.ts";
