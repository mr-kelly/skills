export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-service-mesh",
  folder: { name: "Service Mesh Policy & Traffic Telemetry Desk", slug: "kelly-service-mesh" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Service Mesh Policy & Traffic Telemetry Desk Records",
      slug: "kelly-service-mesh-records",
    },
  ],
};
