export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-feature-rollout",
  folder: { name: "Feature Flag Canary & Guardrail Control Desk", slug: "kelly-feature-rollout" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Feature Flag Canary & Guardrail Control Desk Records",
      slug: "kelly-feature-rollout-records",
    },
  ],
};
