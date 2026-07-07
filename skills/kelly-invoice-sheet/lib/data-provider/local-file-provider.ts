import fs from "node:fs/promises";
import path from "node:path";
import { nowIso, readJson, writeJson } from "../common.ts";
import { emptyBatch, mergeDecisions, normalizeInvoicePatch, recomputeMetrics } from "../invoice-schema.ts";
import {
  agentTasksPath,
  batchPath,
  dataDir,
  decisionsPath,
  executionReportPath,
  lockPath,
  onboardingPath,
  skillDir,
} from "../paths.ts";
import type {
  Config,
  ConfigResult,
  DecisionBody,
  DecisionsFile,
  HttpError,
  InvoiceBatch,
  ProviderMeta,
} from "../types.ts";

function configSearchPaths(): string[] {
  const files = [];
  if (process.env.KELLY_INVOICE_SHEET_CONFIG) files.push(process.env.KELLY_INVOICE_SHEET_CONFIG);
  files.push(path.join(skillDir, "config.local.json"));
  files.push(path.join(process.env.HOME || "", ".config", "kelly-invoice-sheet", "config.json"));
  files.push(path.join(skillDir, "config.example.json"));
  return files;
}

function emptyDecisions(): DecisionsFile {
  return { schema_version: "1", updated_at: nowIso(), decisions: {} };
}

function httpError(message: string, statusCode: number): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

function summarizeConfig(configResult: ConfigResult): Record<string, unknown> {
  const config = configResult.config || {};
  const extraction = config.extraction || {};
  const reviewPolicy = config.review_policy || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    data_provider: config.data_provider || "local",
    default_currency: config.default_currency || "USD",
    export: {
      directory: config.export?.directory || "exports/<batch-id>",
      include_line_items: config.export?.include_line_items !== false,
    },
    extraction: {
      preferred_ocr: extraction.preferred_ocr || "agent-provided",
      low_confidence_threshold: extraction.low_confidence_threshold ?? 0.82,
    },
    review_policy: {
      auto_approve_min_confidence: reviewPolicy.auto_approve_min_confidence ?? null,
      block_missing_fields: Array.isArray(reviewPolicy.block_missing_fields)
        ? reviewPolicy.block_missing_fields
        : ["vendor_name", "invoice_number", "invoice_date", "total"],
    },
    handoff_files: {
      batch: "app/.data/current_batch.json",
      decisions: "app/.data/decisions.json",
      agent_tasks: "app/.data/agent_tasks.json",
      execution_report: "app/.data/execution_report.json",
    },
  };
}

export function createLocalFileProvider(_meta: ProviderMeta = {}) {
  return {
    kind: "local",

    async getState(): Promise<Record<string, unknown>> {
      const [batch, decisions, agentTasks, executionReport, onboarding, lock, configResult] = await Promise.all([
        this.readBatch(),
        this.readDecisions(),
        this.readAgentTasks(),
        this.readExecutionReport(),
        this.readOnboarding(),
        this.readLock(),
        this.readConfig(),
      ]);
      const merged = mergeDecisions(batch as InvoiceBatch, decisions as DecisionsFile);
      return {
        data_provider: "local",
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult),
        batch: merged,
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
      };
    },

    async readBatch(): Promise<InvoiceBatch> {
      const batch = await readJson<InvoiceBatch>(batchPath, emptyBatch());
      return recomputeMetrics(batch);
    },

    async writeBatch(batch: InvoiceBatch): Promise<void> {
      await fs.mkdir(dataDir, { recursive: true });
      await writeJson(batchPath, recomputeMetrics(batch));
    },

    async readDecisions(): Promise<DecisionsFile> {
      return readJson<DecisionsFile>(decisionsPath, emptyDecisions());
    },

    async readAgentTasks(): Promise<Record<string, unknown>> {
      return readJson(agentTasksPath, { schema_version: "1", updated_at: nowIso(), tasks: [] });
    },

    async readExecutionReport(): Promise<Record<string, unknown> | null> {
      return readJson<Record<string, unknown> | null>(executionReportPath, null);
    },

    async writeExecutionReport(report: Record<string, unknown>): Promise<void> {
      await writeJson(executionReportPath, report);
    },

    async readOnboarding(): Promise<Record<string, unknown>> {
      return readJson(onboardingPath, { completed: false });
    },

    async completeOnboarding(marker: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
      const payload = {
        completed: true,
        completed_at: nowIso(),
        config_version: "1",
        ...marker,
      };
      await writeJson(onboardingPath, payload);
      return payload;
    },

    async readLock(): Promise<Record<string, unknown> | null> {
      return readJson<Record<string, unknown> | null>(lockPath, null);
    },

    async readConfig(): Promise<ConfigResult> {
      for (const file of configSearchPaths()) {
        const config = await readJson<Config | null>(file, null);
        if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
      }
      return { config: {}, path: "", is_example: false };
    },

    async configSummary(): Promise<Record<string, unknown>> {
      return summarizeConfig(await this.readConfig());
    },

    async applyDecision(payload: DecisionBody): Promise<Record<string, unknown>> {
      const lock = await this.readLock();
      if (lock) throw httpError("Agent is writing files; try again when the lock clears.", 423);
      if (!payload.item_id) throw httpError("item_id is required", 400);
      if (!payload.action || !["approve", "request_changes", "revise", "block"].includes(payload.action)) {
        throw httpError("action must be approve, request_changes, revise, or block", 400);
      }
      const batch = await this.readBatch();
      if (!batch.invoices.some((invoice) => invoice.id === payload.item_id)) {
        throw httpError(`Unknown invoice id: ${payload.item_id}`, 404);
      }
      const decisions = await this.readDecisions();
      decisions.updated_at = nowIso();
      decisions.decisions[payload.item_id] = {
        item_id: payload.item_id,
        action: payload.action as DecisionsFile["decisions"][string]["action"],
        comment: payload.comment || "",
        patch: normalizeInvoicePatch(payload.patch || {}),
        decided_at: nowIso(),
      };
      await writeJson(decisionsPath, decisions);
      if (payload.action === "request_changes" || String(payload.comment || "").includes("@ai")) {
        await this.writeAgentTask(payload.item_id, payload.comment || "Please revise this invoice extraction.");
      }
      return decisions;
    },

    async writeAgentTask(itemId: string, comment: string): Promise<void> {
      const tasks = await this.readAgentTasks();
      const list = Array.isArray(tasks.tasks) ? tasks.tasks : [];
      const filtered = list.filter((task: Record<string, unknown>) => task.item_id !== itemId);
      filtered.push({
        item_id: itemId,
        reason: "revision_requested",
        comment,
        created_at: nowIso(),
      });
      await writeJson(agentTasksPath, { schema_version: "1", updated_at: nowIso(), tasks: filtered });
    },
  };
}
