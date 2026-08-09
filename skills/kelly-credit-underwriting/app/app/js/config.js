export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-credit-underwriting",
  folder: { name: "Commercial Loan Underwriting Desk", slug: "kelly-credit-underwriting" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Commercial Loan Underwriting Desk Records", slug: "kelly-credit-underwriting-records" },
  ],
};
