export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-api-governance",
  folder: { name: "API Lifecycle & Schema Governance Console", slug: "kelly-api-governance" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "API Lifecycle & Schema Governance Console Records", slug: "kelly-api-governance-records" },
  ],
};
