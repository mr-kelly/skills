export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-rfp-responder",
  folder: { name: "Enterprise RFP Response Knowledge Desk", slug: "kelly-rfp-responder" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Enterprise RFP Response Knowledge Desk Records", slug: "kelly-rfp-responder-records" },
  ],
};
