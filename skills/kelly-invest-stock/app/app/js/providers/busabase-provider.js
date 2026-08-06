// @ts-nocheck -- uses browser cache-busting import specifiers (?v=<version>) TypeScript cannot resolve; this file is un-annotated browser JS linted by Biome only
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.9.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.9.0";
import { classroomSeedBatches } from "./demo-provider.js?v=0.9.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

const merged = (result) => result?.materialized === true || result?.status === "merged";

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

const normalizeRecords = (records, baseKey) =>
  (records || []).map((record) => ({
    ...record,
    baseKey,
    fields: normalizeFields(record.headCommit?.fields || record.fields),
  }));

const readLegacyPage = async (base, cursor) => {
  const url = new URL("/api/v1/records/paged", window.location.origin);
  url.searchParams.set("baseId", base.baseId);
  url.searchParams.set("limit", String(base.readLimit));
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP_${response.status}: 无法读取旧版 Busabase 分页记录`);
  const page = await response.json();
  if (!Array.isArray(page?.records)) throw new Error("SCHEMA_INCOMPLETE: 旧版记录分页响应无效");
  return page;
};

const readPage = async (client, base, cursor) => {
  if (!allowedReads.has("records.list")) {
    throw new Error("PROCEDURE_DENIED: records.list");
  }
  let page = await client.records.list({
    baseId: base.baseId,
    limit: base.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  if (Array.isArray(page)) page = await readLegacyPage(base, cursor);
  return {
    records: normalizeRecords(page.records, base.key),
    nextCursor: page.nextCursor || null,
    limit: base.readLimit,
  };
};

export const readAllPages = async (client, base, maxPages = 100) => {
  const records = [];
  const seenCursors = new Set();
  let cursor;

  for (let pageCount = 1; pageCount <= maxPages; pageCount += 1) {
    const page = await readPage(client, base, cursor);
    records.push(...page.records);
    if (!page.nextCursor) {
      return { records, nextCursor: null, limit: base.readLimit, pageCount };
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`PAGINATION_LOOP: ${base.key}`);
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error(`PAGINATION_LIMIT: ${base.key}`);
};

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

export const busabaseProvider = {
  name: "busabase",
  async getState() {
    runtimeClient = createRuntimeClient();
    if (!allowedReads.has("nodes.list")) throw new Error("PROCEDURE_DENIED: nodes.list");
    if (!allowedReads.has("nodes.get")) throw new Error("PROCEDURE_DENIED: nodes.get");
    let resources = await inspectProvisionedResources(runtimeClient, appConfig);
    if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
      if (!allowedReads.has("bases.get")) throw new Error("PROCEDURE_DENIED: bases.get");
      if (!allowedSetup.has("nodes.updateMetadata")) {
        throw new Error("PROCEDURE_DENIED: nodes.updateMetadata");
      }
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
      resources.bases.map(async (base) => [base.key, await readAllPages(runtimeClient, base)]),
    );
    return {
      provider: {
        ok: true,
        name: "busabase",
        mode: "busabase_sdk_openapi",
        readOnly: false,
        stageWritable: true,
        reviewWritable: true,
      },
      records: pages.flatMap(([, page]) => page.records),
      pageInfo: Object.fromEntries(
        pages.map(([key, page]) => [key, { complete: true, limit: page.limit, pageCount: page.pageCount }]),
      ),
    };
  },
  async loadMore(baseKey, cursor) {
    const base = runtimeBases.get(baseKey);
    if (!runtimeClient || !base || !cursor) throw new Error(`SCHEMA_INCOMPLETE: ${baseKey}`);
    return readPage(runtimeClient, base, cursor);
  },
  async updateStrategyStage(recordId, stage, baseCommitId = null, approval = {}) {
    if (!allowedWrites.has("records.changeRequest")) {
      throw new Error("PROCEDURE_DENIED: records.changeRequest");
    }
    if (!allowedWrites.has("bases.createChangeRequest")) {
      throw new Error("PROCEDURE_DENIED: bases.createChangeRequest");
    }
    if (!["L1", "L2", "L3"].includes(stage)) throw new Error("INVALID_STAGE");
    const reason = String(approval.reason || "").trim();
    if (reason.length < 8) throw new Error("APPROVAL_REASON_REQUIRED: 请至少写 8 个字的人工理由");
    const fromStage = String(approval.fromStage || "");
    const strategyKey = String(approval.strategyKey || "");
    if (!strategyKey) throw new Error("STRATEGY_KEY_REQUIRED");
    const client = runtimeClient || createRuntimeClient();
    const result = await client.records.changeRequest({
      recordId,
      operation: "update",
      fields: { status: stage },
      message: `Strategy ${fromStage || "--"} → ${stage}: ${reason}`,
      author: "kelly-invest-stock-ui",
      ...(baseCommitId ? { baseCommitId } : {}),
      autoMerge: true,
    });
    if (!merged(result)) return { persisted: false, changeRequestId: result?.id || "" };

    const reviewBase = runtimeBases.get("strategy-reviews");
    if (!reviewBase) {
      return {
        persisted: true,
        reviewPersisted: false,
        changeRequestId: result?.id || "",
        reviewError: "策略阶段已更新，但策略研究与审批 Base 尚未就绪。",
      };
    }
    const reviewDate = String(approval.reviewDate || new Date().toISOString());
    try {
      const reviewResult = await client.bases.createChangeRequest({
        baseId: reviewBase.baseId,
        fields: {
          name: `${approval.strategyName || strategyKey} ${fromStage || "--"} → ${stage}`,
          "strategy-key": strategyKey,
          "review-date": reviewDate,
          "review-type": "approval",
          "snapshot-nav": approval.snapshotNav ?? null,
          "snapshot-benchmark-return": approval.snapshotBenchmarkReturn ?? null,
          "snapshot-max-drawdown": approval.snapshotMaxDrawdown ?? null,
          "from-stage": fromStage,
          "to-stage": stage,
          decision: stage === fromStage ? "保持" : "调整成熟度",
          reason,
          reviewer: String(approval.reviewer || "老板"),
          "change-request-id": result?.id || "",
        },
        message: `Record manual strategy approval ${fromStage || "--"} → ${stage}`,
        submittedBy: "kelly-invest-stock-ui",
        autoMerge: true,
      });
      return {
        persisted: true,
        reviewPersisted: merged(reviewResult),
        changeRequestId: result?.id || "",
        reviewChangeRequestId: reviewResult?.id || "",
      };
    } catch (error) {
      return {
        persisted: true,
        reviewPersisted: false,
        changeRequestId: result?.id || "",
        reviewError: String(error?.message || error),
      };
    }
  },
  async seedClassroomWorkspace() {
    if (!allowedWrites.has("bases.createBulkChangeRequest")) {
      throw new Error("PROCEDURE_DENIED: bases.createBulkChangeRequest");
    }
    const client = runtimeClient || createRuntimeClient();
    const bases = [...runtimeBases.values()];
    if (bases.length !== appConfig.bases.length) throw new Error("SCHEMA_INCOMPLETE: 课堂种子资源尚未就绪");
    const pages = await Promise.all(bases.map(async (base) => [base.key, await readAllPages(client, base)]));
    if (pages.some(([, page]) => page.records.length > 0)) {
      throw new Error("SEED_REQUIRES_EMPTY_WORKSPACE: 课堂种子只能写入完全空白的应用工作区");
    }
    const batches = classroomSeedBatches();
    const requests = [];
    for (const base of bases) {
      const records = batches[base.key] || [];
      if (!records.length) continue;
      const result = await client.bases.createBulkChangeRequest({
        baseId: base.baseId,
        records,
        message: `Seed Kelly Invest Stock classroom records: ${base.key}`,
        submittedBy: "kelly-invest-stock-classroom-seed",
        idempotencyKey: `kelly-invest-stock-classroom-v1-${base.key}`,
      });
      requests.push({ baseKey: base.key, id: result?.id || "", status: result?.status || "in_review" });
    }
    return { requests };
  },
  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest");
    }
    if (!allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.updateMetadata");
    }
    if (!allowedSetup.has("bases.fieldChangeRequest")) {
      throw new Error("PROCEDURE_DENIED: bases.fieldChangeRequest");
    }
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) {
        pendingSetupError = String(error.message);
      }
      throw error;
    }
  },
};
