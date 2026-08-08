export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-asset-lifecycle",
  folder: { name: "Enterprise Fixed Asset Lifecycle Console", slug: "kelly-asset-lifecycle" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Enterprise Fixed Asset Lifecycle Console Records", slug: "kelly-asset-lifecycle-records" },
  ],
};
