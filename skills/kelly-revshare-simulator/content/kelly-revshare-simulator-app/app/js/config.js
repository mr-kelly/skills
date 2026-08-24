export const appConfig = {
  appId: "kelly-revshare-simulator",
  appName: "Kelly Revenue-Share Simulator",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  folder: {
    name: "Kelly Revenue-Share Simulator",
    description:
      "Revenue-Share Contract Simulator: a control-panel/workspace for a deal analyst to model revenue-based-financing (RBF) deals for SME businesses -- project cash flow and repayment, compute a Cash-Flow Payout Multiple and effective annualized merchant cost, and record an underwriting decision per named scenario. Pure deterministic math, no external calls, no real trading/payment side effects; scenario create/edit/delete and decisions are direct writes made by the analyst, not a review/approval queue",
    slug: "kelly-revshare-simulator",
  },
  airApp: {
    name: "Kelly Revenue-Share Simulator",
    slug: "kelly-revshare-simulator-app",
    resourceKey: "kelly-revshare-simulator-app",
  },
  bases: [
    {
      key: "scenarios",
      name: "Scenarios",
      slug: "kelly-revshare-simulator-scenarios",
      description:
        "One row per saved revenue-share deal scenario: the analyst's raw inputs (business type, revenue, principal, share rates, cap multiple, term) and the underwriting decision. The projected cash-flow/repayment result (Cash-Flow Payout Multiple, effective annualized cost, risk flags) is never stored -- it is pure/derived from these inputs and recomputed on every read",
      readLimit: 100,
      fields: [
        { slug: "scenario-id", name: "Scenario ID", type: "text", required: true },
        { slug: "name", name: "Name", type: "text", required: false },
        { slug: "business-type", name: "Business type", type: "text", required: false },
        { slug: "avg-monthly-revenue", name: "Avg monthly revenue", type: "number", required: false },
        { slug: "revenue-volatility-pct", name: "Revenue volatility (%)", type: "number", required: false },
        { slug: "principal", name: "Proposed principal", type: "number", required: false },
        { slug: "initial-share-rate-pct", name: "Initial share rate (%)", type: "number", required: false },
        { slug: "step-down-share-rate-pct", name: "Step-down share rate (%)", type: "number", required: false },
        { slug: "repayment-cap-multiple", name: "Repayment cap multiple", type: "number", required: false },
        { slug: "term-months", name: "Term (months)", type: "number", required: false },
        { slug: "decision-action", name: "Decision action", type: "text", required: false },
        { slug: "decision-note", name: "Decision note", type: "longtext", required: false },
        { slug: "decided-at", name: "Decided at", type: "text", required: false },
        { slug: "created-at", name: "Created at", type: "text", required: false },
        { slug: "updated-at", name: "Updated at", type: "text", required: false },
      ],
    },
    {
      key: "settings",
      name: "Settings",
      slug: "kelly-revshare-simulator-settings",
      description: "Sanitized config summary (base currency, underwriting policy thresholds), one row keyed by kind",
      readLimit: 20,
      fields: [
        { slug: "record-id", name: "Record ID", type: "text", required: true },
        { slug: "kind", name: "Kind", type: "text", required: true },
        { slug: "payload", name: "Payload (JSON object)", type: "longtext", required: false },
        { slug: "updated-at", name: "Updated at", type: "text", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    // changeRequests.review/merge are used only to complete a scenario
    // DELETE on a standalone local runtime: Busabase always requires an
    // explicit review before a delete ChangeRequest can merge (autoMerge is
    // rejected server-side for delete, unlike create/update), so the trusted
    // local operator's own delete click reviews+merges its own request. A
    // deployed AirApp never calls these -- its delete requests stay pending
    // for a human to review directly in Busabase.
    writeProcedures: [
      "records.changeRequest",
      "bases.createChangeRequest",
      "changeRequests.review",
      "changeRequests.merge",
    ],
  },
};
