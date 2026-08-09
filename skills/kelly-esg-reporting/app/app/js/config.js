export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-esg-reporting",
  folder: { name: "Corporate ESG Disclosure & Carbon Desk", slug: "kelly-esg-reporting" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Corporate ESG Disclosure & Carbon Desk Records", slug: "kelly-esg-reporting-records" },
  ],
};
