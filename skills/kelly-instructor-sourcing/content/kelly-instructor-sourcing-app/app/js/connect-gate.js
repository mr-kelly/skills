// Connection UX Contract gate — now `busabase-sdk/airapp-gate`, configured.
//
// The three screens (connect / choose a Space / initialize the workspace), the
// state machine behind them, and their stylesheet used to be duplicated in
// this app. All of that is the SDK's now; what remains here is the part that
// is genuinely this app's own: its name, whether this run owes a gate at all,
// and what "initialize" does. The first-run onboarding that follows a
// successful connect stays in app.js — it is this app's own product step, not
// part of the gate.
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { getProvider } from "./providers/index.js";
import { shouldUseLocalGateway } from "./runtime.js";

const isDemo = () => new URLSearchParams(window.location.search).get("demo") === "1";

const gate = createAirAppConnectGate({
  appName: "Kelly Instructor Sourcing",
  demoHref: "?demo=1#/all",
  shouldGate: () => !isDemo() && shouldUseLocalGateway(),
  onProvision: async () => (await getProvider()).provisionResources(),
});

export const passConnectGate = (options) => gate.pass(options);
export const closeConnectGate = () => gate.close();
export const renderSetupRequired = (error, onRetry) => gate.renderSetupRequired(error, onRetry);
export const connectGateStatus = () => gate.status();
