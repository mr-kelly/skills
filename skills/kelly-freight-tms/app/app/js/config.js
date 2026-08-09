export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-freight-tms",
  folder: { name: "Freight Dispatch & Customs Clearance Desk", slug: "kelly-freight-tms" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Freight Dispatch & Customs Clearance Desk Records", slug: "kelly-freight-tms-records" },
  ],
};
