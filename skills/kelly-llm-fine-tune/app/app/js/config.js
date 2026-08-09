export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-llm-fine-tune",
  folder: { name: "LLM Fine-Tuning & Model Evaluation Desk", slug: "kelly-llm-fine-tune" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "LLM Fine-Tuning & Model Evaluation Desk Records", slug: "kelly-llm-fine-tune-records" },
  ],
};
