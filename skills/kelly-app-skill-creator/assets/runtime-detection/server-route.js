// Merge this named import with the generated `server.js` imports, then copy the
// route next to `/health`.
import { describeBusabaseAirAppRuntime } from "busabase-sdk/airapp-node";
//
// This is the server half of runtime detection. `runtime.js` (in this same
// asset folder) is the browser half; ship both or neither.
//
// Busabase spawns the App's own process in every runtime it hosts. The SDK
// reads the injected BUSABASE_AIRAPP_RUNTIME and keeps renamed and future
// runtime values compatible. The browser cannot read environment variables,
// so this route hands the answer over.
//
// Never classify the runtime by hostname, iframe nesting, or path. A
// Busabase-hosted AirApp is served from localhost on Desktop and OSS
// (http://localhost:15419), and a standalone run is routinely reached over a
// LAN IP or a signed dev tunnel — so both directions of that guess are wrong.
// Deliberately do not check a list of known engine names here. The SDK helper
// decides hosting from presence, preserves an unknown future name verbatim,
// and reports its current known alias separately.
const airappRuntime = describeBusabaseAirAppRuntime();
app.get("/__airapp/runtime", (context) => context.json(airappRuntime));
