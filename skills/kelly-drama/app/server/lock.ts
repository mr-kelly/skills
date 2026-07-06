// Write-lock facade. Lock state now lives behind the data-provider; this module
// keeps the historical API (`lockPayload`, `assertUnlocked`, `clearLock`).

import fs from "node:fs/promises";
import { LOCK_PATH } from "./paths.ts";
import { getProvider } from "./provider.ts";

export async function lockPayload() {
  return (await getProvider()).getLock();
}

export async function assertUnlocked() {
  await (await getProvider()).assertUnlocked();
}

// clearLock is a maintenance escape hatch used by tooling to release a stale
// local lock file. It is local-file specific and intentionally unlinks the file.
export async function clearLock() {
  try {
    await fs.unlink(LOCK_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
