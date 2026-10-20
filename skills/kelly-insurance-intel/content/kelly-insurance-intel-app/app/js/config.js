export const appConfig = {
  appId: "kelly-insurance-intel",
  appName: "Kelly Insurance Intel",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  folder: {
    name: "Kelly Insurance Intel",
    description:
      "Daily industry-intelligence cockpit for insurance and wealth advisory: source-backed signals, buyer-intent interpretation, approved sales/operating actions, and channel drafts (client WhatsApp / advisor email / meeting agenda) for review before any external handoff. Signals/actions/drafts enter Busabase only through the agent's own browsing-and-writing workflow (see SKILL.md); the AirApp itself is read/decision-only.",
    slug: "kelly-insurance-intel",
  },
  airApp: {
    name: "Kelly Insurance Intel",
    slug: "kelly-insurance-intel-app",
    resourceKey: "kelly-insurance-intel-app",
  },
  bases: [
    {
      key: "signals",
      name: "Signals",
      slug: "kelly-insurance-intel-signals",
      description:
        "Source-backed regulator, insurer, product, premium, claims, benefit, health, travel, and lifecycle signals: evidence link, why-it-matters, buyer-intent interpretation, confidence, risk badges, and a suggested action. Created by the agent's own workflow, decided (approve/request_changes/block) directly on this row.",
      readLimit: 50,
      fields: [
        { slug: "signal-id", name: "Signal ID", type: "text", required: true },
        { slug: "ref", name: "Ref", type: "number", required: false },
        { slug: "title", name: "Title", type: "text", required: false },
        { slug: "summary", name: "Summary", type: "longtext", required: false },
        { slug: "why-it-matters", name: "Why it matters", type: "longtext", required: false },
        { slug: "buyer-intent", name: "Buyer intent", type: "longtext", required: false },
        { slug: "confidence", name: "Confidence", type: "number", required: false },
        { slug: "detected-at", name: "Detected at", type: "text", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "risk", name: "Risk (JSON array)", type: "longtext", required: false },
        { slug: "source-name", name: "Source name", type: "text", required: false },
        { slug: "source-url", name: "Source URL", type: "text", required: false },
        { slug: "suggested-action-id", name: "Suggested action ID", type: "text", required: false },
        { slug: "decision-verdict", name: "Decision verdict", type: "text", required: false },
        { slug: "decision-comment", name: "Decision comment", type: "longtext", required: false },
        { slug: "decided-at", name: "Decided at", type: "text", required: false },
      ],
    },
    {
      key: "actions",
      name: "Actions",
      slug: "kelly-insurance-intel-actions",
      description:
        "Approved/blocked/reviewable compliant meeting agendas, client education notes, renewal scripts, or operating actions linked to today's signals, with owner, priority, reason, and the concrete next step.",
      readLimit: 50,
      fields: [
        { slug: "action-id", name: "Action ID", type: "text", required: true },
        { slug: "ref", name: "Ref", type: "number", required: false },
        { slug: "title", name: "Title", type: "text", required: false },
        { slug: "summary", name: "Summary", type: "longtext", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "priority", name: "Priority", type: "text", required: false },
        { slug: "owner", name: "Owner", type: "text", required: false },
        { slug: "reason", name: "Reason", type: "longtext", required: false },
        { slug: "linked-signal-ids", name: "Linked signal IDs (JSON array)", type: "longtext", required: false },
        { slug: "next-step", name: "Next step", type: "longtext", required: false },
        { slug: "decision-verdict", name: "Decision verdict", type: "text", required: false },
        { slug: "decision-comment", name: "Decision comment", type: "longtext", required: false },
        { slug: "decided-at", name: "Decided at", type: "text", required: false },
      ],
    },
    {
      key: "drafts",
      name: "Drafts",
      slug: "kelly-insurance-intel-drafts",
      description:
        "Editable channel drafts (client WhatsApp / advisor email / meeting agenda) tied to an approved action, kept behind a review gate until approved.",
      readLimit: 50,
      fields: [
        { slug: "draft-id", name: "Draft ID", type: "text", required: true },
        { slug: "ref", name: "Ref", type: "number", required: false },
        { slug: "channel", name: "Channel", type: "text", required: false },
        { slug: "title", name: "Title", type: "text", required: false },
        { slug: "body", name: "Body", type: "longtext", required: false },
        { slug: "edited-body", name: "Edited body", type: "longtext", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "risk", name: "Risk (JSON array)", type: "longtext", required: false },
        { slug: "linked-action-id", name: "Linked action ID", type: "text", required: false },
        { slug: "decision-verdict", name: "Decision verdict", type: "text", required: false },
        { slug: "decision-comment", name: "Decision comment", type: "longtext", required: false },
        { slug: "decided-at", name: "Decided at", type: "text", required: false },
      ],
    },
    {
      key: "sources",
      name: "Sources",
      slug: "kelly-insurance-intel-sources",
      description:
        "Configured news/insurer/regulator/competitor/trend source categories, freshness, and coverage gaps.",
      readLimit: 20,
      fields: [
        { slug: "source-id", name: "Source ID", type: "text", required: true },
        { slug: "label", name: "Label", type: "text", required: false },
        { slug: "status", name: "Status", type: "text", required: false },
        { slug: "freshness", name: "Freshness", type: "text", required: false },
        { slug: "coverage", name: "Coverage", type: "longtext", required: false },
      ],
    },
    {
      key: "settings",
      name: "Settings",
      slug: "kelly-insurance-intel-settings",
      description:
        "Sanitized batch metadata (schema version, batch id, generated-at, buyer, offer), one row keyed by kind",
      readLimit: 20,
      fields: [
        { slug: "record-id", name: "Record ID", type: "text", required: true },
        { slug: "kind", name: "Kind", type: "text", required: true },
        { slug: "payload", name: "Payload (JSON object)", type: "longtext", required: false },
        { slug: "updated-at", name: "Updated at", type: "text", required: false },
      ],
    },
  ],
  // Chosen by what people do with a row, same reasoning as busa-crm's:
  //   signals/actions/drafts → split: each is a review queue worked top to
  //                            bottom, one item after the next, so the queue
  //                            stays beside the record being decided.
  //   sources                → drawer: a short fact people scan many of,
  //                            read the full coverage text, then return.
  ui: { detail_modes: { signals: "split", actions: "split", drafts: "split", sources: "drawer" } },
  permissions: {
    // records.get is used both by writes (re-reading the current record
    // before a ChangeRequest) and by a direct `#/<view>/<id>` / `?peek=`
    // link to a record that is not on the loaded page — it must be declared
    // here, not only inferred from the write path.
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list", "records.count", "records.get"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    writeProcedures: ["records.changeRequest", "bases.createChangeRequest"],
  },
};
