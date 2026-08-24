// Connection UX Contract gate — now `busabase-sdk/airapp-gate`, configured.
//
// The three screens (connect / choose a Space / initialize the workspace), the
// state machine behind them, and their stylesheet used to be duplicated in
// this app. All of that is the SDK's now; what remains here is the part that
// is genuinely this app's own: its name, whether this run owes a gate at all,
// and what "initialize" does.
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { getProvider } from "./providers/index.js?v=0.9.2";
import { shouldUseLocalGateway } from "./runtime.js";

const isDemo = () => new URLSearchParams(window.location.search).get("demo") === "1";

const gate = createAirAppConnectGate({
  appName: "Kelly Invest Stock",
  demoHref: "?demo=1#/strategies",
  shouldGate: () => !isDemo() && shouldUseLocalGateway(),
  onProvision: async () => (await getProvider()).provisionResources(),
});

export const passConnectGate = (options) => gate.pass(options);
export const closeConnectGate = () => gate.close();
export const renderSetupRequired = (error, onRetry) => gate.renderSetupRequired(error, onRetry);
