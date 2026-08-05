export const appConfig = {
  appId: "kelly-clm",
  appName: "Kelly CLM",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  folder: {
    name: "Kelly CLM",
    description:
      "Lightweight contract lifecycle desk: contract inventory, lifecycle stage, owners, obligations, renewal/notice dates, and a simple approval reminder queue. Not a legal redline/clause-review product -- see kelly-legal-contracts for that. Contract records, obligation status, renewal acknowledgements, and approval decisions are all direct writes made by the operator in the browser, not a review/approval pipeline.",
    nodeId: "",
    slug: "kelly-clm",
  },
  bases: [
    {
      key: "contracts",
      name: "Contracts",
      slug: "kelly-clm-contracts-v1",
      description:
        "One row per contract: counterparty, type, lifecycle stage, owner, business owner, value, start/end dates, renewal date, notice deadline, next action, risk, and renewal-notice acknowledgement. Created/edited directly by the operator.",
      nodeId: "",
      baseId: "",
      readLimit: 100,
      fields: [
        { slug: "contract-id", name: "Contract ID", type: "text", required: true },
        { slug: "name", name: "Name", type: "text", required: false },
        { slug: "counterparty", name: "Counterparty", type: "text", required: false },
        { slug: "type", name: "Type", type: "text", required: false },
        { slug: "stage", name: "Stage", type: "text", required: false },
        { slug: "owner", name: "Owner", type: "text", required: false },
        { slug: "business-owner", name: "Business owner", type: "text", required: false },
        { slug: "value", name: "Value", type: "text", required: false },
        { slug: "start-date", name: "Start date", type: "text", required: false },
        { slug: "end-date", name: "End date", type: "text", required: false },
        { slug: "renewal-date", name: "Renewal date", type: "text", required: false },
        { slug: "notice-deadline", name: "Notice deadline", type: "text", required: false },
        { slug: "notice-acknowledged-at", name: "Notice acknowledged at", type: "text", required: false },
        { slug: "next-action", name: "Next action", type: "longtext", required: false },
        { slug: "risk", name: "Risk", type: "text", required: false },
        { slug: "created-at", name: "Created at", type: "text", required: false },
        { slug: "updated-at", name: "Updated at", type: "text", required: false },
      ],
    },
    {
      key: "obligations",
      name: "Obligations",
      slug: "kelly-clm-obligations-v1",
      description:
        "One row per contract obligation/milestone: linked contract, title, owner, due date, status, and evidence note. Status is toggled directly by the operator (e.g. marking an obligation done).",
      nodeId: "",
      baseId: "",
      readLimit: 100,
      fields: [
        { slug: "obligation-id", name: "Obligation ID", type: "text", required: true },
        { slug: "contract-id", name: "Contract ID", type: "text", required: false },
        { slug: "title", name: "Title", type: "text", required: false },
        { slug: "owner", name: "Owner", type: "text", required: false },
        { slug: "due-date", name: "Due date", type: "text", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "evidence", name: "Evidence", type: "longtext", required: false },
        { slug: "created-at", name: "Created at", type: "text", required: false },
        { slug: "updated-at", name: "Updated at", type: "text", required: false },
      ],
    },
    {
      key: "approvals",
      name: "Approvals",
      slug: "kelly-clm-approvals-v1",
      description:
        "One row per approval/reminder handoff linked to a contract: title, summary, and status. The operator's decision (approve/request changes/block) is written directly onto this row -- there is no separate decisions/handoff-log bucket.",
      nodeId: "",
      baseId: "",
      readLimit: 100,
      fields: [
        { slug: "approval-id", name: "Approval ID", type: "text", required: true },
        { slug: "contract-id", name: "Contract ID", type: "text", required: false },
        { slug: "title", name: "Title", type: "text", required: false },
        { slug: "summary", name: "Summary", type: "longtext", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "decision-note", name: "Decision note", type: "longtext", required: false },
        { slug: "decided-at", name: "Decided at", type: "text", required: false },
        { slug: "created-at", name: "Created at", type: "text", required: false },
        { slug: "updated-at", name: "Updated at", type: "text", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    // No delete operation exists in this skill's UI (create/edit a contract,
    // mark an obligation done, acknowledge a renewal notice, and record an
    // approval decision are all create/update writes) -- so, unlike
    // kelly-revshare-simulator's scenario delete, changeRequests.review/merge
    // are never needed here.
    writeProcedures: ["records.changeRequest", "bases.createChangeRequest"],
  },
};
