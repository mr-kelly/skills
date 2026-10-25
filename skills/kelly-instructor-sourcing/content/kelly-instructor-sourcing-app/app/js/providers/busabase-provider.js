import {
  inspectProvisionedResources,
  isAirAppWriteQueued,
  provisionDeclaredResources,
  createAirAppRecords,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js";

// A person's write from this app leaves `autoMerge` unset, so Busabase decides
// from that person's own permission: with write access the change lands now;
// without it the same change becomes a ChangeRequest for someone who has it.
// The response says which happened, and the caller reports it rather than
// assuming either.
const writeOutcome = (result) => {
  const pending = isAirAppWriteQueued(result);
  return { merged: !pending, pending, change_request_id: pending ? result?.id || "" : "" };
};

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);
// Transport pagination belongs to the provider, never to a Base declaration.
// The API caps a page at 100; a desk that stops after one page silently loses
// every row past it.
const BUSABASE_RECORD_PAGE_SIZE = 100;

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

const normalizeRecords = (records, baseKey) =>
  (records || []).map((record) => ({
    ...record,
    baseKey,
    fields: normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
  }));

const readPage = async (client, base, cursor) => {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const page = await createAirAppRecords(client).readPage({
    baseId: base.baseId,
    limit: BUSABASE_RECORD_PAGE_SIZE,
    cursor,
  });
  return {
    records: normalizeRecords(page.records, base.key),
    nextCursor: page.nextCursor || null,
    limit: BUSABASE_RECORD_PAGE_SIZE,
  };
};

export const readAllPages = async (client, base) => {
  const records = [];
  const seenCursors = new Set();
  let cursor;
  let pageCount = 0;

  while (true) {
    pageCount += 1;
    const page = await readPage(client, base, cursor);
    records.push(...page.records);
    if (!page.nextCursor) {
      return { records, nextCursor: null, limit: BUSABASE_RECORD_PAGE_SIZE, pageCount };
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`PAGINATION_LOOP: ${base.key}`);
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
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
  async getReadinessState() {
    runtimeClient = createRuntimeClient();
    if (!allowedReads.has("nodes.list")) throw new Error("PROCEDURE_DENIED: nodes.list");
    if (!allowedReads.has("nodes.get")) throw new Error("PROCEDURE_DENIED: nodes.get");
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
    const criteriaPage = await readAllPages(runtimeClient, requireBase("criteria"));
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        readOnly: false,
      },
      records: criteriaPage.records,
      pageInfo: {
        criteria: { nextCursor: criteriaPage.nextCursor, limit: criteriaPage.limit },
      },
    };
  },
  async getState() {
    if (!runtimeClient || !runtimeBases.size) await this.getReadinessState();
    const pages = await Promise.all(
      [...runtimeBases.values()].map(async (base) => [base.key, await readAllPages(runtimeClient, base)]),
    );
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        readOnly: false,
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
  async saveCriteria({ recordId, fields, message }) {
    const client = runtimeClient || createRuntimeClient();
    if (recordId) {
      if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
      const result = await client.records.changeRequest({
        recordId,
        operation: "update",
        fields,
        message,
        author: appConfig.appId,
      });
      return writeOutcome(result);
    }
    if (!allowedWrites.has("bases.createChangeRequest")) throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
    const result = await client.bases.createChangeRequest({
      baseId: requireBase("criteria").baseId,
      fields,
      message,
      submittedBy: appConfig.appId,
    });
    return writeOutcome(result);
  },
  async updateCandidate({ recordId, fields, message }) {
    if (!allowedWrites.has("records.changeRequest")) throw new Error("PROCEDURE_DENIED: records.changeRequest");
    if (!recordId) throw new Error("SCHEMA_INCOMPLETE: candidates");
    const client = runtimeClient || createRuntimeClient();
    const result = await client.records.changeRequest({
      recordId,
      operation: "update",
      fields,
      message,
      author: appConfig.appId,
    });
    return writeOutcome(result);
  },
};
