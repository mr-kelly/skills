export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-telehealth-consent",
  folder: { name: "Telehealth Informed Consent & Provider Desk", slug: "kelly-telehealth-consent" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Telehealth Informed Consent & Provider Desk Records",
      slug: "kelly-telehealth-consent-records",
    },
  ],
};
