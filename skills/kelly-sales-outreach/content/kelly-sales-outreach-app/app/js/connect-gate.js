// Connection UX Contract gate — now `busabase-sdk/airapp-gate`, configured.
//
// The three screens (connect / choose a Space / initialize the workspace), the
// state machine behind them, and their stylesheet used to be duplicated in
// this app. All of that is the SDK's now; what remains here is the part that
// is genuinely this app's own: its name, whether this run owes a gate at all,
// and what "initialize" does. The first-run product onboarding that follows a
// successful connect stays in app.js — it is this app's own product step, not
// part of the gate.
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { getProvider } from "./providers/index.js?v=0.3.0";
import { initRuntime, shouldUseLocalGateway } from "./runtime.js?v=0.3.0";

const isDemo = () => new URLSearchParams(window.location.search).has("demo");

const gate = createAirAppConnectGate({
  appName: "Kelly Sales Outreach",
  demoHref: "?demo=1#/to-send",
  shouldGate: async () => !isDemo() && shouldUseLocalGateway(await initRuntime()),
  onProvision: async () => (await getProvider()).provisionResources(),
});

export const passConnectGate = (options) => gate.pass(options);
export const closeConnectGate = () => gate.close();
export const renderSetupRequired = (error, onRetry) => gate.renderSetupRequired(error, onRetry);
export const connectGateStatus = () => gate.status();
