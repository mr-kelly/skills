import { createBusabaseClient } from "../vendor/busabase-sdk.js";

import { appConfig } from "./config.js";

export function createRuntimeClient() {
  return createBusabaseClient({
    baseUrl: window.location.origin,
    ...(appConfig.spaceId ? { spaceId: appConfig.spaceId } : {}),
  });
}

// A standalone preview is the trusted operator's own machine, so its writes
// merge immediately. A deployed AirApp is inside the Busabase review boundary
// and must leave every write as a pending ChangeRequest.
//
// Re-exported from `runtime.js`, which reads the runtime Busabase injected into
// this process rather than inferring it from the URL. That inference used to
// decide this: loopback hostname, minus iframe nesting and the preview path. A
// decision this consequential should not rest on a guess that a dev tunnel or a
// Desktop server on localhost can flip.
export { isStandaloneLocalRuntime } from "./runtime.js";
