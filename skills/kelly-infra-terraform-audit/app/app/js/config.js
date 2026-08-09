export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-infra-terraform-audit",
  folder: { name: "Terraform Infrastructure Drift & Security Desk", slug: "kelly-infra-terraform-audit" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "Terraform Infrastructure Drift & Security Desk Records",
      slug: "kelly-infra-terraform-audit-records",
    },
  ],
};
