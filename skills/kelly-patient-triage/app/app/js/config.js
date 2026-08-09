export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-patient-triage",
  folder: { name: "Patient Intake Triage & Care Pathway Desk", slug: "kelly-patient-triage" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Patient Intake Triage & Care Pathway Desk Records", slug: "kelly-patient-triage-records" },
  ],
};
