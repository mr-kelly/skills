export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-pricing-margin",
  folder: { name: "Dynamic Product Pricing & Margin Optimizer", slug: "kelly-pricing-margin" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Dynamic Product Pricing & Margin Optimizer Records",
      slug: "kelly-pricing-margin-records",
    },
  ],
};
