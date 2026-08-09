export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-db-privacy-masking",
  folder: { name: "Database Sensitive Data Masking Desk", slug: "kelly-db-privacy-masking" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Database Sensitive Data Masking Desk Records", slug: "kelly-db-privacy-masking-records" },
  ],
};
