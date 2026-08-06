import { createBusabaseClient } from "../vendor/busabase-sdk.js";

import { appConfig } from "./config.js";

export function createRuntimeClient() {
  return createBusabaseClient({
    baseUrl: window.location.origin,
  });
}
