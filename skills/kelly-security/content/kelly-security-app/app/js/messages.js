export const messages = {
  attentionTitle: "Needs attention",
  attentionEmpty: "No pending change requests",
  attentionPending: "pending change requests",
  settings: "Help & Settings",
  settingsEyebrow: "AirApp",
  settingsTitle: "Runtime details",
  overview: "Overview",
  records: "Records",
  record: "Record",
  // Shown instead of a relation id when the target record has not been paged in.
  relationUnloaded: "(not loaded)",
  search: "Search loaded records",
  searchPlaceholder: "Search this loaded page",
  loading: "Loading data...",
  loadingMore: "Loading more...",
  loadMore: "Load more",
  loadMoreFailed: "Couldn't load more records. Try again.",
  noRecords: "No records yet",
  noMatches: "No records match this search",
  selectRecord: "Select a record to inspect its fields",
  recordUnavailable: "This record could not be loaded. Return to the list and try again.",
  back: "Back to list",
  close: "Close",
  openFullPage: "Open full page",
  viewAll: "View all",
  totalRecords: "Loaded records",
  bases: "Bases",
  pending: "Pending reviews",
  provider: "Provider",
  deployment: "Deployment",
  mode: "Mode",
  space: "Space",
  configuredBases: "Configured Bases",
  initialWindow: "Data page budget",
  notSet: "Not set",
  runtime: "Runtime",
  // One sentence per (where am I running x do I have credentials) state. Never
  // state connection status as a fixed string: it will be shown in a state
  // where it is false. See `runtime.js`'s `connectionHintKey`.
  hintHosted:
    "Busabase is hosting this app, so the signed-in viewer's session should authorize it. Ask a Space admin whether your account can read these Bases.",
  hintDevProxy:
    "This app was started with BUSABASE_BASE_URL set, so Busabase itself rejected the request. Check that origin, the API key, and the Space id it was started with.",
  hintStandalone:
    "This app is running standalone with no Busabase connection. Use the Connect Busabase setup to sign in, or append ?demo=1 to browse sample data instead.",
  hostedOnly:
    "This app runs inside Busabase only. Open it from its node in your Busabase workspace, or append ?demo=1 to browse sample data instead.",
  hintUnknown:
    "This app could not determine its runtime, so it cannot tell whether a connection is expected. Reload the page; if this persists the app is being served by something other than its own server.",
  // Change-request actions (the blueprint's `ui.actions`). What happened to a
  // write -- "Saved." or "Sent for review. ..." -- is the SDK's own sentence
  // (`airAppWriteMessage`, localized for en / zh-CN / zh-TW / ja). Pass
  // `messages: { saved, queued }` to it from app.js only for a language the SDK
  // does not cover; do not copy the sentences here.
  actionNote: "Note for the reviewer (optional)",
  actionSubmit: "Submit",
  actionCancel: "Cancel",
  actionNoChange: "Nothing changed yet. Edit a field first.",
  actionFailed: "Couldn't submit this change.",
  actionRefreshFailed: "Reload the page to see the latest values.",
  setupEyebrow: "Workspace setup",
  connectTitle: "Connect Busabase",
  connectCopy: "Choose the Busabase server that holds this app's workspace.",
  cloud: "Busabase Cloud",
  customServer: "Custom server",
  customServerHint: "Self-hosted or enterprise origin",
  serverUrl: "Busabase URL",
  connect: "Connect Busabase",
  demo: "Open read-only Demo",
  spaceTitle: "Choose a workspace",
  spaceCopy: "This account can access more than one Space. Choose where this app should read data.",
  selectSpace: "Continue with this Space",
  retryTitle: "Busabase is temporarily unavailable",
  retry: "Retry",
  reconnect: "Reconnect Busabase",
  noSpaces: "This account has no accessible Busabase Space.",
  localCredential: "OAuth credentials stay in the owner-only local AirApp store.",
};
