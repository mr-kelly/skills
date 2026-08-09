export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-emr-compliance",
  folder: { name: "EMR Interoperability & HIPAA Audit Desk", slug: "kelly-emr-compliance" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "EMR Interoperability & HIPAA Audit Desk Records", slug: "kelly-emr-compliance-records" },
  ],
};
