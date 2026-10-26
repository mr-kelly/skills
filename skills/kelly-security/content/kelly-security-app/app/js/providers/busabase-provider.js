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
const allow = (name, write = false) => {
  if (!appConfig.permissions[write ? "change_request_procedures" : "read_procedures"].includes(name))
    throw new Error("PROCEDURE_DENIED");
};
const base = (key) => {
  const found = resources?.bases.find((entry) => entry.key === key);
  if (!found) throw new Error("SETUP_REQUIRED");
  return found;
};
const named = (row, key) => ({ ...row, baseKey: key, fields: airAppRecordFields(row) });

export const busabaseProvider = {
  name: "busabase",
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
  async page(key, { cursor = null, valueFilters, sort } = {}) {
    allow("records.list");
    const result = await records.readPage({
      baseId: base(key).baseId,
      limit: base(key).readLimit,
      cursor,
      valueFilters,
      sort,
    });
    return { ...result, records: result.records.map((row) => named(row, key)) };
  },
  async get(key, recordId) {
    allow("records.get");
    const row = await client.records.get({ recordId });
    if (row.baseId !== base(key).baseId) throw new Error("RECORD_OUTSIDE_APP_RESOURCE");
    return named(row, key);
  },
  async summary() {
    allow("records.count");
    allow("records.groupBy");
    const [hosts, evidence, runs, checks, findings] = await Promise.all([
      client.records.count({ baseId: base("hosts").baseId }),
      client.records.count({ baseId: base("evidence").baseId }),
      client.records.groupBy({ baseId: base("runs").baseId, fieldSlug: "status" }),
      client.records.groupBy({ baseId: base("checks").baseId, fieldSlug: "conclusion" }),
      client.records.groupBy({ baseId: base("findings").baseId, fieldSlug: "verdict" }),
    ]);
    const count = (response, value) => response.groups.find((group) => group.value === value)?.count || 0;
    return {
      hosts: hosts.total,
      evidence: evidence.total,
      running: count(runs, "running"),
      gaps: count(checks, "insufficient-evidence"),
      attention: count(findings, "needs-review"),
    };
  },
  async pending() {
    allow("changeRequests.list");
    const result = await client.changeRequests.list({
      limit: 20,
      affectsNodeId: base("runs").nodeId,
      status: ["in_review", "changes_requested", "conflict"],
    });
    return { count: result.changeRequests.length, nextCursor: result.nextCursor };
  },
  async create(key, fields, idempotencyKey) {
    allow("bases.createChangeRequest", true);
    return records.createRecord({
      baseId: base(key).baseId,
      fields,
      idempotencyKey,
      message: `Kelly Security: ${fields.title}`,
    });
  },
  async update(key, row, fields) {
    allow("records.changeRequest", true);
    if (row.baseId !== base(key).baseId) throw new Error("RECORD_OUTSIDE_APP_RESOURCE");
    return records.updateRecord({
      recordId: row.id,
      baseCommitId: row.headCommitId,
      fields,
      message: `Kelly Security: update ${row.fields.title}`,
    });
  },
};
