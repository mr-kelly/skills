export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-supplier-audit",
  folder: { name: "Tier-1/2 Supplier ESG & Quality Audit Desk", slug: "kelly-supplier-audit" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Tier-1/2 Supplier ESG & Quality Audit Desk Records",
      slug: "kelly-supplier-audit-records",
    },
  ],
};
