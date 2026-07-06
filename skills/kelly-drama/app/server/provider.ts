// Shared data-provider singleton for the server process.
//
// Every server module reaches storage through this one provider instance
// (selected by KELLY_DRAMA_DATA_PROVIDER via lib/data-provider). Created once,
// lazily, so `import`-time side effects stay cheap and tests can await it.

import { createProvider } from "../../lib/data-provider/index.ts";
import type { DramaProvider } from "../../lib/data-provider/provider-interface.ts";

let instance: DramaProvider | null = null;
let pending: Promise<DramaProvider> | null = null;

export async function getProvider(): Promise<DramaProvider> {
  if (instance) return instance;
  if (!pending) {
    pending = createProvider().then((provider) => {
      instance = provider;
      return provider;
    });
  }
  return pending;
}
