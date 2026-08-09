export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-energy-utility-billing",
  folder: { name: "Utility Smart Meter & Tariff Audit Desk", slug: "kelly-energy-utility-billing" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Utility Smart Meter & Tariff Audit Desk Records",
      slug: "kelly-energy-utility-billing-records",
    },
  ],
};
