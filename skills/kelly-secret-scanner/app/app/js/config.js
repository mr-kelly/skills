export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-secret-scanner",
  folder: { name: "Secret Scanner & Leakage Audit Desk", slug: "kelly-secret-scanner" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Secret Scanner & Leakage Audit Desk Records", slug: "kelly-secret-scanner-records" },
  ],
};
