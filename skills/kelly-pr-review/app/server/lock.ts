import { LOCK_PATH } from "./paths.ts";
import { pathExists, readJson } from "./utils.ts";

const DEFAULT_MESSAGE = "/kelly-pr-review is processing this batch.";

interface LockFile {
  message?: string;
  owner?: string;
  started_at?: string;
}

export async function lockPayload() {
  if (!(await pathExists(LOCK_PATH))) return { locked: false };
  let raw: LockFile;
  try {
    raw = (await readJson(LOCK_PATH, {})) as LockFile;
  } catch {
    raw = { message: DEFAULT_MESSAGE };
  }
  return {
    locked: true,
    path: LOCK_PATH,
    message: raw.message || DEFAULT_MESSAGE,
    owner: raw.owner || "kelly-pr-review",
    started_at: raw.started_at,
  };
}

export async function rejectIfLocked() {
  const lock = await lockPayload();
  if (lock.locked) throw new Error(lock.message || DEFAULT_MESSAGE);
}
