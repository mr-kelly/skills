export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-fixed-income-risk",
  folder: { name: "Bond Portfolio Yield & Credit Analytics Desk", slug: "kelly-fixed-income-risk" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Bond Portfolio Yield & Credit Analytics Desk Records",
      slug: "kelly-fixed-income-risk-records",
    },
  ],
};
