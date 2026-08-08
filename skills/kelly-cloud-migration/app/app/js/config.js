export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-cloud-migration",
  folder: { name: "Multi-Cloud Workload Migration Analyzer", slug: "kelly-cloud-migration" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Multi-Cloud Workload Migration Analyzer Records", slug: "kelly-cloud-migration-records" },
  ],
};
