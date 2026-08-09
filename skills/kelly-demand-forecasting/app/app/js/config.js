export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-demand-forecasting",
  folder: { name: "Supply Chain Demand & S&OP Planning Desk", slug: "kelly-demand-forecasting" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Supply Chain Demand & S&OP Planning Desk Records",
      slug: "kelly-demand-forecasting-records",
    },
  ],
};
