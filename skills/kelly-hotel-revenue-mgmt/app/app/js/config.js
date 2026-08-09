export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-hotel-revenue-mgmt",
  folder: { name: "Hotel Room Yield & RevPAR Management Desk", slug: "kelly-hotel-revenue-mgmt" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Hotel Room Yield & RevPAR Management Desk Records",
      slug: "kelly-hotel-revenue-mgmt-records",
    },
  ],
};
