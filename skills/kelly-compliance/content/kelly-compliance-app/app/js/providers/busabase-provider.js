import {
  airAppRecordFields,
  createAirAppRecords,
  inspectProvisionedResources,
  provisionDeclaredResources,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js";
const client = createRuntimeClient();
const records = createAirAppRecords(client, { appId: appConfig.appId });
let resources;
const base = (key) => {
  const found = resources?.bases.find((entry) => entry.key === key);
  if (!found) throw new Error("SETUP_REQUIRED");
  return found;
};
const named = (row, key) => ({ ...row, baseKey: key, fields: airAppRecordFields(row) });
export const busabaseProvider = {
  name: "busabase",
  lastWrite: null,
  async ready() {
    resources = await inspectProvisionedResources(client, appConfig);
    return {
      ok: !!resources.folder && !resources.missing.length && !resources.repairs.length,
      missing: resources.missing.map((entry) => entry.name),
    };
  },
  async initialize() {
    resources = await provisionDeclaredResources(client, appConfig);
    return this.ready();
  },
  async page(key, { cursor = null, valueFilters, sort, limit = 50 } = {}) {
    const result = await records.readPage({
      baseId: base(key).baseId,
      limit: Math.min(limit, 50),
      cursor,
      valueFilters,
      sort,
    });
    return { ...result, records: result.records.map((row) => named(row, key)) };
  },
  async get(key, id) {
    const row = await client.records.get({ recordId: id });
    if (row.baseId !== base(key).baseId) throw new Error("RECORD_OUTSIDE_APP_RESOURCE");
    return named(row, key);
  },
  async pending() {
    const result = await client.changeRequests.list({
      limit: 20,
      affectsNodeId: base("assessments").nodeId,
      status: ["in_review", "changes_requested", "conflict"],
    });
    return { count: result.changeRequests.length, nextCursor: result.nextCursor };
  },
  async create(key, fields, idempotencyKey) {
    const result = await records.createRecord({
      baseId: base(key).baseId,
      fields,
      idempotencyKey,
      message: `Kelly Compliance: ${fields.title}`,
    });
    this.lastWrite = result;
    if (result.status !== "saved") throw new Error(`WRITE_PENDING: ${result.changeRequestId || "需人工审阅"}`);
    if (!result.recordId) throw new Error("MATERIALIZED_RECORD_ID_MISSING");
    return this.get(key, result.recordId);
  },
  async update(key, row, fields) {
    if (row.baseId !== base(key).baseId) throw new Error("RECORD_OUTSIDE_APP_RESOURCE");
    const result = await records.updateRecord({
      recordId: row.id,
      baseCommitId: row.headCommitId,
      fields,
      message: `Kelly Compliance: ${row.fields.title}`,
    });
    this.lastWrite = result;
    if (result.status !== "saved") throw new Error(`WRITE_PENDING: ${result.changeRequestId || "需人工审阅"}`);
    return this.get(key, row.id);
  },
};
