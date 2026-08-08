export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-churn-predictor",
  folder: { name: "Customer Churn Predictor & Retention Desk", slug: "kelly-churn-predictor" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Customer Churn Predictor & Retention Desk Records",
      slug: "kelly-churn-predictor-records",
    },
  ],
};
