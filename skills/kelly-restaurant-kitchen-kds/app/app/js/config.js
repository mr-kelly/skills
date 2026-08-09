export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-restaurant-kitchen-kds",
  folder: { name: "Restaurant POS, KDS & Recipe Costing Desk", slug: "kelly-restaurant-kitchen-kds" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Restaurant POS, KDS & Recipe Costing Desk Records",
      slug: "kelly-restaurant-kitchen-kds-records",
    },
  ],
};
