export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-field-service",
  folder: { name: "Field Service Technician Dispatch Console", slug: "kelly-field-service" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Field Service Technician Dispatch Console Records", slug: "kelly-field-service-records" },
  ],
};
