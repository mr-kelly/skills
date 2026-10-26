import {
  airAppRecordFields,
  createAirAppRecords,
  inspectProvisionedResources,
  provisionDeclaredResources,
} from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js";
import { ref } from "../model.js";
import { encodeFields } from "../validation.js";

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
  async summary(projectId, revision) {
    allow("records.count");
    allow("records.groupBy");
    const scope = projectId ? [{ fieldSlug: "project-reference", operator: "eq", value: projectId }] : [];
    const [projects, endpoints, rules, findings] = await Promise.all([
      client.records.count({ baseId: base("projects").baseId }),
      client.records.count({
        baseId: base("endpoints").baseId,
        valueFilters: [
          ...scope,
          ...(revision ? [{ fieldSlug: "source-revision", operator: "eq", value: revision }] : []),
        ],
      }),
      client.records.count({
        baseId: base("rules").baseId,
        valueFilters: [
          ...scope,
          ...(revision ? [{ fieldSlug: "source-revision", operator: "eq", value: revision }] : []),
        ],
      }),
      client.records.groupBy({ baseId: base("findings").baseId, fieldSlug: "verdict", valueFilters: scope }),
    ]);
    return {
      projects: projects.total,
      endpoints: endpoints.total,
      rules: rules.total,
      attention: findings.groups.find((group) => group.value === "needs-review")?.count || 0,
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
    if (fields["record-key"]) {
      const found = await records.readPage({
        baseId: base(key).baseId,
        limit: 2,
        valueFilters: [{ fieldSlug: "record-key", operator: "eq", value: fields["record-key"] }],
      });
      if (found.nextCursor || found.records.length > 1) throw new Error("业务键重复，请在原生表格中复核。");
      if (found.records.length) {
        const row = found.records[0];
        const actual = airAppRecordFields(row);
        const expected = encodeFields(fields);
        if (
          Object.entries(expected).some(([slug, value]) =>
            base(key).fields.find((field) => field.slug === slug)?.type === "relation"
              ? ref(actual[slug]) !== ref(value)
              : JSON.stringify(actual[slug] ?? null) !== JSON.stringify(value ?? null),
          )
        )
          throw new Error("同版本业务键已存在且内容不同；请核对现有记录或使用新版本。");
        return { status: "saved", recordId: row.id };
      }
    }
    return records.createRecord({
      baseId: base(key).baseId,
      fields: encodeFields(fields),
      idempotencyKey,
      message: `Kelly AppSec: ${fields.title}`,
    });
  },
  async update(key, row, fields) {
    allow("records.changeRequest", true);
    if (row.baseId !== base(key).baseId) throw new Error("RECORD_OUTSIDE_APP_RESOURCE");
    return records.updateRecord({
      recordId: row.id,
      baseCommitId: row.headCommitId,
      fields: encodeFields(fields),
      message: `Kelly AppSec: update ${row.fields.title}`,
    });
  },
};
