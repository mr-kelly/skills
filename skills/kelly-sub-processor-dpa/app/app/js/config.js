export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-sub-processor-dpa",
  folder: { name: "DPA & Vendor Sub-Processor Audit Desk", slug: "kelly-sub-processor-dpa" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "DPA & Vendor Sub-Processor Audit Desk Records", slug: "kelly-sub-processor-dpa-records" },
  ],
};
