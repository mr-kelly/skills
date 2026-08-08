export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-lead-enrichment",
  folder: { name: "Lead Enrichment & Firmographic Desk", slug: "kelly-lead-enrichment" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Lead Enrichment & Firmographic Desk Records", slug: "kelly-lead-enrichment-records" },
  ],
};
