export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-secops-soar",
  folder: { name: "SOAR Security Playbook Orchestration Desk", slug: "kelly-secops-soar" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "SOAR Security Playbook Orchestration Desk Records", slug: "kelly-secops-soar-records" },
  ],
};
