export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-endpoint-edr",
  folder: { name: "Endpoint EDR Threat Detection Desk", slug: "kelly-endpoint-edr" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [{ key: "records", name: "Endpoint EDR Threat Detection Desk Records", slug: "kelly-endpoint-edr-records" }],
};
