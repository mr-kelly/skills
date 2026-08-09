export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-board-governance",
  folder: { name: "Board Resolution & Minutes Governance Desk", slug: "kelly-board-governance" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Board Resolution & Minutes Governance Desk Records",
      slug: "kelly-board-governance-records",
    },
  ],
};
