export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-api-security-gateway",
  folder: { name: "API Security & Schema Violation Monitor", slug: "kelly-api-security-gateway" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "API Security & Schema Violation Monitor Records",
      slug: "kelly-api-security-gateway-records",
    },
  ],
};
