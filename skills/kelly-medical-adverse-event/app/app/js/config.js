export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-medical-adverse-event",
  folder: { name: "Medical Device & Drug Adverse Event Desk", slug: "kelly-medical-adverse-event" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Medical Device & Drug Adverse Event Desk Records",
      slug: "kelly-medical-adverse-event-records",
    },
  ],
};
