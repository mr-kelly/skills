export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-pharmacy-formulary",
  folder: { name: "Hospital Pharmacy Formulary & Safety Desk", slug: "kelly-pharmacy-formulary" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Hospital Pharmacy Formulary & Safety Desk Records",
      slug: "kelly-pharmacy-formulary-records",
    },
  ],
};
