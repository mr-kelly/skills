export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-insurance-claims-loss",
  folder: { name: "Property & Casualty Loss Adjustment Desk", slug: "kelly-insurance-claims-loss" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Property & Casualty Loss Adjustment Desk Records",
      slug: "kelly-insurance-claims-loss-records",
    },
  ],
};
