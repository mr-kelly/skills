export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-threat-intel",
  folder: { name: "Cyber Threat Intelligence & IOC Radar", slug: "kelly-threat-intel" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Cyber Threat Intelligence & IOC Radar Records", slug: "kelly-threat-intel-records" },
  ],
};
