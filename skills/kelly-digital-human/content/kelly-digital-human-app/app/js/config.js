export const appConfig = {
  appId: "kelly-digital-human",
  appName: "Kelly Digital Human",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  folder: {
    name: "Kelly Digital Human",
    description:
      "Digital-human solution desk: a fast 2D vendor-service path and a high-control 3D UE/Unity path, plus a launch QA gate. The project overview, personas, pipeline routes, vendor comparison, and QA checklist are curated reference content, not per-user data -- the only genuinely dynamic state is the human review verdict (approve / request changes / block) recorded against each QA gate check, written as a direct field write on its own record, mirroring kelly-clm's approvals.",
    slug: "kelly-digital-human",
  },
  airApp: { name: "Kelly Digital Human", slug: "kelly-digital-human-app", resourceKey: "kelly-digital-human-app" },
  bases: [
    {
      key: "qa-decisions",
      name: "QA Decisions",
      slug: "kelly-digital-human-qa-decisions",
      description:
        "One row per launch-QA-check decision, keyed by the curated check id (lip-sync, latency, ai-disclosure, voice-consent, script-safety, fallback, privacy, mobile). A row only exists once a human has decided on that check -- this replaces the retired app/.data/decisions.json handoff bucket with direct Busabase records, the same sparse-map shape (a check with no row yet is simply undecided).",
      readLimit: 100,
      fields: [
        { slug: "check-id", name: "Check ID", type: "text", required: true },
        { slug: "action", name: "Action", type: "text", required: false },
        { slug: "note", name: "Note", type: "longtext", required: false },
        { slug: "decided-at", name: "Decided at", type: "text", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    // No delete operation exists in this skill's UI (recording a decision is
    // always a create-if-missing/update-if-present write onto the check's own
    // row), so unlike kelly-revshare-simulator's scenario delete,
    // changeRequests.review/merge are never needed here.
    writeProcedures: ["records.changeRequest", "bases.createChangeRequest"],
  },
};
