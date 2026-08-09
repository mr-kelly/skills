export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-trade-settlement",
  folder: { name: "Securities Trade Settlement & Fail Desk", slug: "kelly-trade-settlement" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Securities Trade Settlement & Fail Desk Records", slug: "kelly-trade-settlement-records" },
  ],
};
