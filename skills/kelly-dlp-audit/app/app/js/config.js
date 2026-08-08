export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-dlp-audit",
  folder: { name: "Data Loss Prevention & PII Auditor", slug: "kelly-dlp-audit" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [{ key: "records", name: "Data Loss Prevention & PII Auditor Records", slug: "kelly-dlp-audit-records" }],
};
