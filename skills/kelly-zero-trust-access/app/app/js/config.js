export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-zero-trust-access",
  folder: { name: "Zero Trust Access & Device Trust Desk", slug: "kelly-zero-trust-access" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Zero Trust Access & Device Trust Desk Records", slug: "kelly-zero-trust-access-records" },
  ],
};
