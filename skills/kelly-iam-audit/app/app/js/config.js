export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-iam-audit",
  folder: { name: "IAM Privilege Audit & Identity Desk", slug: "kelly-iam-audit" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [{ key: "records", name: "IAM Privilege Audit & Identity Desk Records", slug: "kelly-iam-audit-records" }],
};
