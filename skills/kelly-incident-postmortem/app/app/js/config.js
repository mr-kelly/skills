export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-incident-postmortem",
  folder: { name: "Blameless Incident Postmortem & Action Desk", slug: "kelly-incident-postmortem" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Blameless Incident Postmortem & Action Desk Records",
      slug: "kelly-incident-postmortem-records",
    },
  ],
};
