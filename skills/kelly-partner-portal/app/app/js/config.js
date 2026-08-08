export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-partner-portal",
  folder: { name: "Channel Partner Portal & Deal Registration Desk", slug: "kelly-partner-portal" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Channel Partner Portal & Deal Registration Desk Records",
      slug: "kelly-partner-portal-records",
    },
  ],
};
