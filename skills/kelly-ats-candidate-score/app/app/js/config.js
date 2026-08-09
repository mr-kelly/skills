export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-ats-candidate-score",
  folder: { name: "Candidate Interview Scorecard Evaluation", slug: "kelly-ats-candidate-score" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Candidate Interview Scorecard Evaluation Records",
      slug: "kelly-ats-candidate-score-records",
    },
  ],
};
