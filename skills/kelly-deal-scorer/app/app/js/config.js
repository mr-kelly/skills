export const appConfig = {
  appId: "kelly-deal-scorer",
  appName: "Kelly Deal Scorer",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  folder: {
    name: "Kelly Deal Scorer",
    description:
      "Deal Scoring Desk: a review queue that scores candidate SME financing deals (revenue-based/RBF-style credit) with a deterministic, fully auditable rule-based rubric and records approve/send-back/reject decisions",
    nodeId: "",
    slug: "kelly-deal-scorer",
  },
  airApp: { name: "Kelly Deal Scorer", slug: "kelly-deal-scorer-app", resourceKey: "airapp" },
  bases: [
    {
      key: "candidates",
      name: "Candidates",
      slug: "kelly-deal-scorer-candidates-v1",
      description:
        "One row per candidate business — raw underwriting fields (category, city, requested principal, monthly revenue history, red flags) plus the reviewer's decision, written directly onto the same row. The composite score breakdown is never stored; it is recomputed client-side from these raw fields on every read",
      nodeId: "",
      baseId: "",
      readLimit: 50,
      fields: [
        { slug: "candidate-id", name: "Candidate ID", type: "text", required: true },
        { slug: "business-name", name: "Business name", type: "text", required: false },
        { slug: "category", name: "Category", type: "text", required: false },
        { slug: "city", name: "City", type: "text", required: false },
        { slug: "requested-principal", name: "Requested principal", type: "number", required: false },
        { slug: "monthly-revenue", name: "Monthly revenue (JSON array)", type: "longtext", required: false },
        { slug: "red-flags", name: "Red flags (JSON array)", type: "longtext", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "decision-action", name: "Decision action", type: "text", required: false },
        { slug: "decision-comment", name: "Decision comment", type: "longtext", required: false },
        { slug: "decided-at", name: "Decided at", type: "text", required: false },
      ],
    },
    {
      key: "settings",
      name: "Settings",
      slug: "kelly-deal-scorer-settings-v1",
      description:
        "Sanitized config summary (base currency, optional rubric override), one row keyed by record-id/kind",
      nodeId: "",
      baseId: "",
      readLimit: 20,
      fields: [
        { slug: "record-id", name: "Record ID", type: "text", required: true },
        { slug: "kind", name: "Kind", type: "text", required: true },
        { slug: "payload", name: "Payload", type: "longtext", required: false },
        { slug: "updated-at", name: "Updated at", type: "text", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    writeProcedures: ["records.changeRequest", "bases.createChangeRequest"],
  },
};
