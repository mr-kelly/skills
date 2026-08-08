export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-order-fulfillment",
  folder: { name: "Omnichannel Order Fulfillment & Exception Desk", slug: "kelly-order-fulfillment" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Omnichannel Order Fulfillment & Exception Desk Records",
      slug: "kelly-order-fulfillment-records",
    },
  ],
};
