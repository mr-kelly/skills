export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-workforce-attrition",
  folder: { name: "Employee Retention Risk & Exit Analytics", slug: "kelly-workforce-attrition" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Employee Retention Risk & Exit Analytics Records",
      slug: "kelly-workforce-attrition-records",
    },
  ],
};
