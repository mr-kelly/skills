export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-clinical-trials",
  folder: { name: "Clinical Trial Protocol & Subject Desk", slug: "kelly-clinical-trials" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Clinical Trial Protocol & Subject Desk Records", slug: "kelly-clinical-trials-records" },
  ],
};
