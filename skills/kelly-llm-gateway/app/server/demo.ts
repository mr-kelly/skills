import { buildSnapshot } from "../../lib/data-provider/seed-data.ts";
import { computeAnomalies } from "./anomalies.ts";
import type { GatewaySnapshot } from "./types.ts";

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

const now = "2026-07-10T09:00:00.000Z";

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(demoSnapshot()) : demoSnapshot();
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-llm-gateway",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-llm-gateway/config.json",
      is_example: false,
      base_currency: snapshot.base_currency,
      gateway: {
        region: "global",
        base_url: "https://gateway.internal.example/usage/v1",
        secret_envs: ["KELLY_LLM_GATEWAY_API_KEY"],
        secrets_ready: true,
      },
    },
    snapshot,
  };
}

function localizeSnapshotZh(snapshot: GatewaySnapshot): GatewaySnapshot {
  const serviceNames: Record<string, string> = {
    "support-bot": "客服机器人",
    "search-ranking": "搜索排序",
    "content-summarizer": "内容摘要",
    "internal-copilot": "内部助手",
  };
  const modelNames: Record<string, string> = {
    "provider-a-model-large": "供应商 A / 大模型",
    "provider-a-model-small": "供应商 A / 小模型",
    "provider-b-model-pro": "供应商 B / 专业模型",
    "internal-model-v2": "内部模型 v2",
    "internal-model-v1-mini": "内部模型 v1-mini",
  };
  snapshot.services = snapshot.services.map((service) => ({
    ...service,
    display_name: serviceNames[service.service_id] || service.display_name,
  }));
  snapshot.models = snapshot.models.map((model) => ({
    ...model,
    display_name: modelNames[model.model_id] || model.display_name,
  }));
  return snapshot;
}

function demoSnapshot(): GatewaySnapshot {
  const snapshot = buildSnapshot(new Date(now));
  snapshot.source = "kelly-llm-gateway-demo";
  snapshot.anomalies = computeAnomalies(snapshot);
  return snapshot;
}
