import { createRuntimeClient, isStandaloneLocalRuntime } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

const normalizeRecords = (records, baseKey) =>
  (records || []).map((record) => ({
    ...record,
    baseKey,
    fields: normalizeFields(record.headCommit?.fields || record.fields),
  }));

const readPage = async (client, base, cursor) => {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const page = await client.records.list({
    baseId: base.baseId,
    limit: base.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  return {
    records: normalizeRecords(page.records, base.key),
    nextCursor: page.nextCursor || null,
    limit: base.readLimit,
  };
};

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

const requireBase = (key) => {
  const base = runtimeBases.get(key);
  if (!base) throw new Error(`SCHEMA_INCOMPLETE: ${key}`);
  return base;
};

export const busabaseProvider = {
  name: "busabase",
  async getState() {
    runtimeClient = createRuntimeClient();
    if (!allowedReads.has("nodes.list")) throw new Error("PROCEDURE_DENIED: nodes.list");
    if (!allowedReads.has("folders.get")) throw new Error("PROCEDURE_DENIED: folders.get");
    let resources = await inspectProvisionedResources(runtimeClient, appConfig);
    if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
      if (!allowedReads.has("bases.get")) throw new Error("PROCEDURE_DENIED: bases.get");
      if (!allowedSetup.has("nodes.updateMetadata")) throw new Error("PROCEDURE_DENIED: nodes.updateMetadata");
      resources = await provisionDeclaredResources(runtimeClient, appConfig);
    }
    if (!resources.folder || resources.missing.length) {
      if (pendingSetupError) throw new Error(pendingSetupError);
      const names = resources.missing.map((base) => base.name).join("、");
      throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
    }
    pendingSetupError = "";
    runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
    const pages = await Promise.all(
      resources.bases.map(async (base) => [base.key, await readPage(runtimeClient, base)]),
    );
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        readOnly: false,
        pendingReview: !isStandaloneLocalRuntime(),
      },
      records: pages.flatMap(([, page]) => page.records),
      pageInfo: Object.fromEntries(
        pages.map(([key, page]) => [key, { nextCursor: page.nextCursor, limit: page.limit }]),
      ),
    };
  },
  async loadMore(baseKey, cursor) {
    const base = runtimeBases.get(baseKey);
    if (!runtimeClient || !base || !cursor) throw new Error(`SCHEMA_INCOMPLETE: ${baseKey}`);
    return readPage(runtimeClient, base, cursor);
  },
  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest");
    }
    if (!allowedSetup.has("nodes.updateMetadata")) throw new Error("PROCEDURE_DENIED: nodes.updateMetadata");
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) pendingSetupError = String(error.message);
      throw error;
    }
  },
  async saveProfile({ recordId, fields, message }) {
    const client = runtimeClient || createRuntimeClient();
    const autoMerge = isStandaloneLocalRuntime();
    if (recordId) {
      if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
      const result = await client.records.changeRequest({
        recordId,
        operation: "update",
        fields,
        message,
        author: appConfig.appId,
        autoMerge,
      });
      return { merged: result?.materialized === true };
    }
    if (!allowedWrites.has("bases.createChangeRequest")) throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
    const result = await client.bases.createChangeRequest({
      baseId: requireBase("profile").baseId,
      fields,
      message,
      submittedBy: appConfig.appId,
      autoMerge,
    });
    return { merged: result?.materialized === true };
  },
  async updateCompany({ recordId, fields, message }) {
    if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
    if (!recordId) throw new Error("SCHEMA_INCOMPLETE: companies");
    const client = runtimeClient || createRuntimeClient();
    const result = await client.records.changeRequest({
      recordId,
      operation: "update",
      fields,
      message,
      author: appConfig.appId,
      autoMerge: isStandaloneLocalRuntime(),
    });
    return { merged: result?.materialized === true };
  },
};
