export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-med-device-maintenance",
  folder: { name: "Hospital Medical Device Maintenance Desk", slug: "kelly-med-device-maintenance" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Hospital Medical Device Maintenance Desk Records",
      slug: "kelly-med-device-maintenance-records",
    },
  ],
};
