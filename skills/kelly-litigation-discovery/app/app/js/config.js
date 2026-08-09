export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-litigation-discovery",
  folder: { name: "E-Discovery Document Review Desk", slug: "kelly-litigation-discovery" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "E-Discovery Document Review Desk Records", slug: "kelly-litigation-discovery-records" },
  ],
};
