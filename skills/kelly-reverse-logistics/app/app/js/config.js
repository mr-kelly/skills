export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-reverse-logistics",
  folder: { name: "Returns, RMA & Refurbishment Desk", slug: "kelly-reverse-logistics" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Returns, RMA & Refurbishment Desk Records", slug: "kelly-reverse-logistics-records" },
  ],
};
