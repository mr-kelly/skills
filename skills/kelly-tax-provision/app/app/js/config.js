export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-tax-provision",
  folder: { name: "Corporate Income Tax Provision & VAT Desk", slug: "kelly-tax-provision" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Corporate Income Tax Provision & VAT Desk Records", slug: "kelly-tax-provision-records" },
  ],
};
