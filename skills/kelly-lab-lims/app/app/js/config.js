export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-lab-lims",
  folder: { name: "Clinical Laboratory LIMS Sample Desk", slug: "kelly-lab-lims" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [{ key: "records", name: "Clinical Laboratory LIMS Sample Desk Records", slug: "kelly-lab-lims-records" }],
};
