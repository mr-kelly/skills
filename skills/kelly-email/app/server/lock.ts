import { createProvider } from "../../lib/data-provider/index.ts";

export async function lockPayload() {
  return createProvider().getLock();
}

export async function rejectIfLocked() {
  return createProvider().rejectIfLocked();
}
