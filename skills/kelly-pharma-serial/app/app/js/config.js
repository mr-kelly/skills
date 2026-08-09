export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-pharma-serial",
  folder: { name: "Pharmaceutical Track & Trace Serialization Desk", slug: "kelly-pharma-serial" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Pharmaceutical Track & Trace Serialization Desk Records",
      slug: "kelly-pharma-serial-records",
    },
  ],
};
