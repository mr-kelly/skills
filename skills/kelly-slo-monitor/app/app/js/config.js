export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-slo-monitor",
  folder: { name: "Service Level Objective & Error Budget Desk", slug: "kelly-slo-monitor" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Service Level Objective & Error Budget Desk Records", slug: "kelly-slo-monitor-records" },
  ],
};
