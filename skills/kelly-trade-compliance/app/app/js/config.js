export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-trade-compliance",
  folder: { name: "Export Control & Sanctions Screening Desk", slug: "kelly-trade-compliance" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Export Control & Sanctions Screening Desk Records",
      slug: "kelly-trade-compliance-records",
    },
  ],
};
