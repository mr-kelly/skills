// Copy into the generated `server.js`, next to the `/health` route.
//
// This is the server half of runtime detection. `runtime.js` (in this same
// asset folder) is the browser half; ship both or neither.
//
// Busabase spawns the App's own process in every runtime it hosts and injects
// BUSABASE_AIRAPP_RUNTIME. Nobody else sets it, so its absence is the positive
// fact "standalone". The browser cannot read environment variables, so this
// route hands the answer over.
//
// Never classify the runtime by hostname, iframe nesting, or path. A
// Busabase-hosted AirApp is served from localhost on Desktop and OSS
// (http://localhost:15419), and a standalone run is routinely reached over a
// LAN IP or a signed dev tunnel — so both directions of that guess are wrong.
const AIRAPP_HOSTED_RUNTIMES = new Set(["nodepod", "local-node", "srt", "embed"]);
const airappRuntime = (process.env.BUSABASE_AIRAPP_RUNTIME || "").trim();
app.get("/__airapp/runtime", (context) =>
  context.json({
    runtime: airappRuntime || "standalone",
    hosted: AIRAPP_HOSTED_RUNTIMES.has(airappRuntime),
  }),
);
