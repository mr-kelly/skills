export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-property-lease-admin",
  folder: { name: "Commercial Property Lease & Rent Desk", slug: "kelly-property-lease-admin" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Commercial Property Lease & Rent Desk Records",
      slug: "kelly-property-lease-admin-records",
    },
  ],
};
