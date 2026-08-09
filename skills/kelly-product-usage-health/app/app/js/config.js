export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-product-usage-health",
  folder: { name: "PLG Product Usage Adoption & Health Desk", slug: "kelly-product-usage-health" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "PLG Product Usage Adoption & Health Desk Records",
      slug: "kelly-product-usage-health-records",
    },
  ],
};
