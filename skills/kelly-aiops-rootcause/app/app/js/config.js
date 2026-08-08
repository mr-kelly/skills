export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-aiops-rootcause",
  folder: { name: "AIOps Incident Alert & Root Cause Analyzer", slug: "kelly-aiops-rootcause" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    {
      key: "records",
      name: "AIOps Incident Alert & Root Cause Analyzer Records",
      slug: "kelly-aiops-rootcause-records",
    },
  ],
};
