export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-app-analytics",
  folder: { name: "App Product Analytics & Journey Desk", slug: "kelly-app-analytics" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "App Product Analytics & Journey Desk Records", slug: "kelly-app-analytics-records" },
  ],
};
