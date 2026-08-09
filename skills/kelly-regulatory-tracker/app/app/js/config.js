export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-regulatory-tracker",
  folder: { name: "Financial & Environmental Regulatory Tracker", slug: "kelly-regulatory-tracker" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Financial & Environmental Regulatory Tracker Records",
      slug: "kelly-regulatory-tracker-records",
    },
  ],
};
