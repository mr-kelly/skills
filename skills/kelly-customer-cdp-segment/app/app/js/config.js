export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-customer-cdp-segment",
  folder: { name: "CDP Audience Segmentation & Sync Desk", slug: "kelly-customer-cdp-segment" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "CDP Audience Segmentation & Sync Desk Records",
      slug: "kelly-customer-cdp-segment-records",
    },
  ],
};
