export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-data-pipeline-observability",
  folder: { name: "Data Pipeline Lineage & Quality Audit Desk", slug: "kelly-data-pipeline-observability" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Data Pipeline Lineage & Quality Audit Desk Records",
      slug: "kelly-data-pipeline-observability-records",
    },
  ],
};
