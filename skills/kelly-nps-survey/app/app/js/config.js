export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-nps-survey",
  folder: { name: "Automated CSAT / NPS Survey & Sentiment Desk", slug: "kelly-nps-survey" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Automated CSAT / NPS Survey & Sentiment Desk Records", slug: "kelly-nps-survey-records" },
  ],
};
