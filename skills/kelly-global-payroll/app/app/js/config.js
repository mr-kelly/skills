export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-global-payroll",
  folder: { name: "Multi-Country Global Payroll & Tax Desk", slug: "kelly-global-payroll" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Multi-Country Global Payroll & Tax Desk Records", slug: "kelly-global-payroll-records" },
  ],
};
