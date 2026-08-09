export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-container-security",
  folder: { name: "Kubernetes Image Vulnerability Desk", slug: "kelly-container-security" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Kubernetes Image Vulnerability Desk Records", slug: "kelly-container-security-records" },
  ],
};
