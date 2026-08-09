export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-treasury-hedging",
  folder: { name: "Corporate FX & Interest Rate Hedging Desk", slug: "kelly-treasury-hedging" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Corporate FX & Interest Rate Hedging Desk Records",
      slug: "kelly-treasury-hedging-records",
    },
  ],
};
