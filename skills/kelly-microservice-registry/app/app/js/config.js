export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-microservice-registry",
  folder: { name: "Microservice Service Catalog & Graph Desk", slug: "kelly-microservice-registry" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Microservice Service Catalog & Graph Desk Records",
      slug: "kelly-microservice-registry-records",
    },
  ],
};
