export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-code-sast-audit",
  folder: { name: "Static Application Security Testing (SAST) Desk", slug: "kelly-code-sast-audit" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Static Application Security Testing (SAST) Desk Records",
      slug: "kelly-code-sast-audit-records",
    },
  ],
};
