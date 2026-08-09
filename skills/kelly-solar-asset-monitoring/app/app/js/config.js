export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-solar-asset-monitoring",
  folder: { name: "Solar Photovoltaic Plant & Health Desk", slug: "kelly-solar-asset-monitoring" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Solar Photovoltaic Plant & Health Desk Records",
      slug: "kelly-solar-asset-monitoring-records",
    },
  ],
};
