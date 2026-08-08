export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-cashflow-forecast",
  folder: { name: "Enterprise Cash Flow Forecast & Liquidity Desk", slug: "kelly-cashflow-forecast" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Enterprise Cash Flow Forecast & Liquidity Desk Records",
      slug: "kelly-cashflow-forecast-records",
    },
  ],
};
