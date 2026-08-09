export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-identity-governance-iga",
  folder: { name: "IGA Access Certification Review Desk", slug: "kelly-identity-governance-iga" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "IGA Access Certification Review Desk Records",
      slug: "kelly-identity-governance-iga-records",
    },
  ],
};
