export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-feature-flag",
  folder: { name: "Feature Flag Governance & Rollout Safety Desk", slug: "kelly-feature-flag" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Feature Flag Governance & Rollout Safety Desk Records",
      slug: "kelly-feature-flag-records",
    },
  ],
};
