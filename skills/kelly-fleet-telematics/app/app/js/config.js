export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-fleet-telematics",
  folder: { name: "Fleet Telematics & Vehicle Maintenance Desk", slug: "kelly-fleet-telematics" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Fleet Telematics & Vehicle Maintenance Desk Records",
      slug: "kelly-fleet-telematics-records",
    },
  ],
};
