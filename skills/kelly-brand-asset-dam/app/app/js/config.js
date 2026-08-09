export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-brand-asset-dam",
  folder: { name: "Digital Asset Management (DAM) Governance", slug: "kelly-brand-asset-dam" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Digital Asset Management (DAM) Governance Records",
      slug: "kelly-brand-asset-dam-records",
    },
  ],
};
