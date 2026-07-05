import fs from "node:fs/promises";
import { LOCK_PATH } from "./paths.ts";
import { pathExists, readJson } from "./utils.ts";

export async function lockPayload() {
  if (!(await pathExists(LOCK_PATH))) return { locked: false };
  try {
    return { locked: true, ...(await readJson(LOCK_PATH)) };
  } catch {
    return { locked: true, message: "Local project files are locked." };
  }
}

export async function assertUnlocked() {
  if (await pathExists(LOCK_PATH)) throw new Error("Project files are locked by the agent.");
}

export async function clearLock() {
  try {
    await fs.unlink(LOCK_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
