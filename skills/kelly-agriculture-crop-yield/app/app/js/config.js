export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-agriculture-crop-yield",
  folder: { name: "Precision Agronomy & Crop Yield Desk", slug: "kelly-agriculture-crop-yield" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Precision Agronomy & Crop Yield Desk Records",
      slug: "kelly-agriculture-crop-yield-records",
    },
  ],
};
