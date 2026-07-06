// Agent write-lock — now delegated to the data provider. The local provider
// backs it with app/.data/agent.lock; remote providers serialize server-side.

import type { LockState } from "../../lib/types.ts";
import { provider } from "./provider.ts";

export async function lockPayload(): Promise<LockState> {
  return provider.getLock();
}

export async function assertUnlocked(): Promise<void> {
  await provider.assertUnlocked();
}
