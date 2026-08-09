export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-higher-ed-admissions",
  folder: { name: "University Admissions Recruitment Desk", slug: "kelly-higher-ed-admissions" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "University Admissions Recruitment Desk Records",
      slug: "kelly-higher-ed-admissions-records",
    },
  ],
};
