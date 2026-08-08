export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-cspm-checker",
  folder: { name: "Cloud Security Posture & CSPM Inspector", slug: "kelly-cspm-checker" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Cloud Security Posture & CSPM Inspector Records", slug: "kelly-cspm-checker-records" },
  ],
};
