import { createProvider } from "./index.js";

export async function lockPayload() {
  return createProvider().getLock();
}

export async function rejectIfLocked() {
  return createProvider().rejectIfLocked();
}
