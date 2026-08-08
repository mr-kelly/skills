export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-wfm-scheduler",
  folder: { name: "Workforce Management & Shift Scheduler", slug: "kelly-wfm-scheduler" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Workforce Management & Shift Scheduler Records", slug: "kelly-wfm-scheduler-records" },
  ],
};
