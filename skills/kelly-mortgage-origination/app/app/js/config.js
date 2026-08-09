export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-mortgage-origination",
  folder: { name: "Mortgage Origination & Title Audit Desk", slug: "kelly-mortgage-origination" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Mortgage Origination & Title Audit Desk Records",
      slug: "kelly-mortgage-origination-records",
    },
  ],
};
