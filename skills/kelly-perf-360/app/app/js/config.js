export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-perf-360",
  folder: { name: "Performance Review & 360 Feedback Collector", slug: "kelly-perf-360" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Performance Review & 360 Feedback Collector Records", slug: "kelly-perf-360-records" },
  ],
};
