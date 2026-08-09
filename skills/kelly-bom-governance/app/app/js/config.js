export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-bom-governance",
  folder: { name: "Manufacturing Bill of Materials (BOM) Desk", slug: "kelly-bom-governance" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Manufacturing Bill of Materials (BOM) Desk Records",
      slug: "kelly-bom-governance-records",
    },
  ],
};
