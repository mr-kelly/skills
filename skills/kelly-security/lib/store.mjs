import { createBusabaseClient } from "busabase-sdk";
import { airAppRecordFields, createAirAppRecords, inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-security-app/app/js/config.js";

export const localClient = () => {
  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl)
    throw new Error("BUSABASE_BASE_URL_REQUIRED: select the Busabase connection before running trusted scripts");
  const url = new URL(baseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (!local && url.protocol !== "https:")
  )
    throw new Error("INVALID_BUSABASE_ORIGIN");
  if (!local && (!process.env.BUSABASE_API_KEY || !process.env.BUSABASE_SPACE_ID))
    throw new Error("CLOUD_CONNECTION_AND_EXPLICIT_SPACE_REQUIRED");
  return createBusabaseClient({
    baseUrl: url.origin,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
};

export const connectStore = async (client = localClient()) => {
  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length || resources.repairs.length)
    throw new Error("SETUP_REQUIRED: install or initialize this exact app first");
  const bases = new Map(resources.bases.map((base) => [base.key, base]));
  const records = createAirAppRecords(client, { appId: appConfig.appId });
  const base = (key) => {
    const result = bases.get(key);
    if (!result) throw new Error(`UNKNOWN_RESOURCE: ${key}`);
    return result;
  };
  const get = async (key, id) => {
    const record = await client.records.get({ recordId: id });
    if (record.baseId !== base(key).baseId) throw new Error("RECORD_OUTSIDE_APP_RESOURCE");
    return { ...record, fields: airAppRecordFields(record) };
  };
  const requireSaved = (result) => {
    if (result.status !== "saved")
      throw new Error(`WRITE_PENDING: ${result.changeRequestId || "review required"}; execution stopped`);
    return result;
  };
  return {
    client,
    resources,
    bases,
    get,
    page: (key, options = {}) => records.readPage({ baseId: base(key).baseId, limit: 50, ...options }),
    create: async (key, fields, idempotencyKey) => {
      const result = requireSaved(
        await records.createRecord({
          baseId: base(key).baseId,
          fields,
          idempotencyKey,
          message: `Kelly Security: add ${fields.title}`,
        }),
      );
      if (!result.recordId) throw new Error("MATERIALIZED_RECORD_ID_MISSING");
      return get(key, result.recordId);
    },
    update: async (key, record, fields) => {
      if (record.baseId !== base(key).baseId) throw new Error("RECORD_OUTSIDE_APP_RESOURCE");
      requireSaved(
        await records.updateRecord({
          recordId: record.id,
          baseCommitId: record.headCommitId,
          fields,
          message: `Kelly Security: update ${record.fields.title}`,
        }),
      );
      return get(key, record.id);
    },
  };
};

export const relationId = (value) =>
  typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
