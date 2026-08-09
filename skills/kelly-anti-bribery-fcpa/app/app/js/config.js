export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-anti-bribery-fcpa",
  folder: { name: "FCPA Third-Party Anti-Bribery Audit Desk", slug: "kelly-anti-bribery-fcpa" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "FCPA Third-Party Anti-Bribery Audit Desk Records",
      slug: "kelly-anti-bribery-fcpa-records",
    },
  ],
};
