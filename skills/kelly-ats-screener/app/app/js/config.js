export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-ats-screener",
  folder: { name: "ATS Resume Screener & Evaluation Desk", slug: "kelly-ats-screener" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "ATS Resume Screener & Evaluation Desk Records", slug: "kelly-ats-screener-records" },
  ],
};
