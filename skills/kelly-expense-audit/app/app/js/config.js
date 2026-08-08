export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-expense-audit",
  folder: { name: "Corporate Expense & Receipt Audit Console", slug: "kelly-expense-audit" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Corporate Expense & Receipt Audit Console Records", slug: "kelly-expense-audit-records" },
  ],
};
