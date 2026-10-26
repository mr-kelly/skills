// The browser entry for app/vendor/busabase-sdk.js (`pnpm run build:sdk`).
// The page and the trusted skill process import the same bundle, so both talk to
// Busabase through one copy of the SDK.
export { createBusabaseClient, getRecordByField } from "busabase-sdk";
export {
  detectAirAppRuntime,
  inspectProvisionedResources,
  provisionDeclaredResources,
  shouldUseLocalAirAppGateway,
  toAirAppWriteOutcome,
} from "busabase-sdk/airapp";
