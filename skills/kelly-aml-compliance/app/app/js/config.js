export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-aml-compliance",
  folder: { name: "Anti-Money Laundering (AML) Monitoring Desk", slug: "kelly-aml-compliance" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Anti-Money Laundering (AML) Monitoring Desk Records",
      slug: "kelly-aml-compliance-records",
    },
  ],
};
