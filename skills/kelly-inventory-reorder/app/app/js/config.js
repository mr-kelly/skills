export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-inventory-reorder",
  folder: { name: "Supply Chain Inventory & Reorder Desk", slug: "kelly-inventory-reorder" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Supply Chain Inventory & Reorder Desk Records", slug: "kelly-inventory-reorder-records" },
  ],
};
