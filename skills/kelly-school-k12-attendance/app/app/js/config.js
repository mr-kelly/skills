export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-school-k12-attendance",
  folder: { name: "K-12 Attendance, Behavior & Portal Desk", slug: "kelly-school-k12-attendance" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "K-12 Attendance, Behavior & Portal Desk Records",
      slug: "kelly-school-k12-attendance-records",
    },
  ],
};
