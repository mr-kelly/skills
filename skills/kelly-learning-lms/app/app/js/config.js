export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-learning-lms",
  folder: { name: "Compliance Training & LMS Certification Desk", slug: "kelly-learning-lms" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Compliance Training & LMS Certification Desk Records",
      slug: "kelly-learning-lms-records",
    },
  ],
};
