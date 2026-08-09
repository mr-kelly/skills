export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-benefits-admin",
  folder: { name: "Employee Benefits & Open Enrollment Desk", slug: "kelly-benefits-admin" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Employee Benefits & Open Enrollment Desk Records", slug: "kelly-benefits-admin-records" },
  ],
};
