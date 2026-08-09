export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-db-migration",
  folder: { name: "Zero-Downtime DB Schema Migration Desk", slug: "kelly-db-migration" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Zero-Downtime DB Schema Migration Desk Records", slug: "kelly-db-migration-records" },
  ],
};
