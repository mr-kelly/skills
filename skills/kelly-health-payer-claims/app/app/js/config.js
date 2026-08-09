export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-health-payer-claims",
  folder: { name: "Health Insurance Claims Adjudication Desk", slug: "kelly-health-payer-claims" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Health Insurance Claims Adjudication Desk Records",
      slug: "kelly-health-payer-claims-records",
    },
  ],
};
