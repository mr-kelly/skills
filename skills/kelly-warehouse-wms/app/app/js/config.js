export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-warehouse-wms",
  folder: { name: "Warehouse Putaway, Picking & Cycle Count Desk", slug: "kelly-warehouse-wms" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Warehouse Putaway, Picking & Cycle Count Desk Records",
      slug: "kelly-warehouse-wms-records",
    },
  ],
};
