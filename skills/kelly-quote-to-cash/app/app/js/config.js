export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-quote-to-cash",
  folder: { name: "Quote-to-Cash (Q2C) Deal Approval Desk", slug: "kelly-quote-to-cash" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Quote-to-Cash (Q2C) Deal Approval Desk Records", slug: "kelly-quote-to-cash-records" },
  ],
};
