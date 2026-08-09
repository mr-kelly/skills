export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-k8s-cost-allocator",
  folder: { name: "Kubernetes Pod Cost & Right-Sizing Desk", slug: "kelly-k8s-cost-allocator" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Kubernetes Pod Cost & Right-Sizing Desk Records",
      slug: "kelly-k8s-cost-allocator-records",
    },
  ],
};
