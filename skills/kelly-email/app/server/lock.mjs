import { LOCK_PATH } from "./paths.mjs";
import { pathExists, readJson } from "./utils.mjs";

const DEFAULT_MESSAGE = "/kelly-email is processing this batch.";

export async function lockPayload() {
  if (!(await pathExists(LOCK_PATH))) return { locked: false };
  let raw;
  try {
    raw = await readJson(LOCK_PATH, {});
  } catch {
    raw = { message: DEFAULT_MESSAGE };
  }
  return {
    locked: true,
    path: LOCK_PATH,
    message: raw.message || DEFAULT_MESSAGE,
    owner: raw.owner || "kelly-email-agent",
    started_at: raw.started_at,
  };
}

export async function rejectIfLocked() {
  const lock = await lockPayload();
  if (lock.locked) {
    throw new Error(lock.message || DEFAULT_MESSAGE);
  }
}
