export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-employee-relations",
  folder: { name: "ER Workplace Grievance & Incident Desk", slug: "kelly-employee-relations" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "ER Workplace Grievance & Incident Desk Records",
      slug: "kelly-employee-relations-records",
    },
  ],
};
