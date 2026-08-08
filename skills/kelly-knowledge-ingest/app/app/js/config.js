export const appConfig = {
  schemaVersion: "1.0.0",
  slug: "kelly-knowledge-ingest",
  folder: { name: "Enterprise Knowledge RAG Ingestion Desk", slug: "kelly-knowledge-ingest" },
  permissions: { setupProcedures: ["create-folder", "create-base"] },
  bases: [
    { key: "records", name: "Enterprise Knowledge RAG Ingestion Desk Records", slug: "kelly-knowledge-ingest-records" },
  ],
};
