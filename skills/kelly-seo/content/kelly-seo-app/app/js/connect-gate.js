// Connection UX Contract gate — now `busabase-sdk/airapp-gate`, configured.
//
// The three screens (connect / choose a Space / initialize the workspace), the
// state machine behind them, and their stylesheet used to be duplicated in
// this app. All of that is the SDK's now; what remains here is the part that
// is genuinely this app's own: its name, whether this run owes a gate at all,
// and what "initialize" does.
//
// `shouldGate` is passed explicitly rather than letting the SDK infer it from a
// status probe: where this app runs is a fact its host states
// (BUSABASE_AIRAPP_RUNTIME, surfaced by detectAirAppRuntime()), never something to guess
// from the hostname. `shouldUseLocalGateway` drives the connect gate.
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { detectAirAppRuntime, shouldUseLocalAirAppGateway } from "../vendor/busabase-airapp.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const runtime = await detectAirAppRuntime();
const shouldUseLocalGateway = () => shouldUseLocalAirAppGateway(runtime);

export { shouldUseLocalGateway };

const isDemo = () => new URLSearchParams(window.location.search).has("demo");

const gate = createAirAppConnectGate({
  appName: "Kelly SEO",
  demoHref: "?demo=1#/overview",
  shouldGate: () => !isDemo() && shouldUseLocalGateway(),
  onProvision: async () => (await getProvider()).provisionResources(),
});

export const passConnectGate = (options) => gate.pass(options);
export const closeConnectGate = () => gate.close();
export const renderSetupRequired = (error, onRetry) => gate.renderSetupRequired(error, onRetry);
