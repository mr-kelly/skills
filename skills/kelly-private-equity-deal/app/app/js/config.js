export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-private-equity-deal",
  folder: { name: "PE / VC Deal Sourcing & LBO Valuation Desk", slug: "kelly-private-equity-deal" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "PE / VC Deal Sourcing & LBO Valuation Desk Records",
      slug: "kelly-private-equity-deal-records",
    },
  ],
};
