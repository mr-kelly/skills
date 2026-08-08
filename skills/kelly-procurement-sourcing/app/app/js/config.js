export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-procurement-sourcing",
  folder: { name: "Strategic Procurement & PO Approval Console", slug: "kelly-procurement-sourcing" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Strategic Procurement & PO Approval Console Records",
      slug: "kelly-procurement-sourcing-records",
    },
  ],
};
