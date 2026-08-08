export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-sustainability-esg",
  folder: { name: "Corporate ESG & Carbon Footprint Tracker", slug: "kelly-sustainability-esg" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Corporate ESG & Carbon Footprint Tracker Records",
      slug: "kelly-sustainability-esg-records",
    },
  ],
};
