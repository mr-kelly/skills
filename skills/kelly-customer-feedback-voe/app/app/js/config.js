export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-customer-feedback-voe",
  folder: { name: "Voice of Customer (VoC) Feature Router", slug: "kelly-customer-feedback-voe" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Voice of Customer (VoC) Feature Router Records",
      slug: "kelly-customer-feedback-voe-records",
    },
  ],
};
