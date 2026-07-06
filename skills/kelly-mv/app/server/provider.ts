// Shared data-provider singleton for the kelly-mv server + services.
//
// The Hono app and the service modules reach the store ONLY through this
// provider (never node:fs directly), so switching KELLY_MV_DATA_PROVIDER is a
// config change, not a rewrite. Created once at module load; assertProvider()
// (inside createProvider) fails loud here if a provider drifts.

import { createProvider } from "../../lib/data-provider/index.ts";

export const provider = await createProvider();
