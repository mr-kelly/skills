import { buildSnapshot } from "./dataset.ts";

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

// Deterministic, fully offline mock payload for docs/screenshots. Never reads
// or writes real snapshot/decisions files.
export function demoStatePayload(query: DemoQuery = {}): Record<string, unknown> {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = zh ? localizeSnapshotZh(buildSnapshot()) : buildSnapshot();
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-portfolio-health",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: snapshot.generated_at, config_version: "demo" },
    lock: null,
    decisions: {},
    config_summary: {
      config_path: "demo://kelly-portfolio-health/config.json",
      is_example: false,
      base_currency: snapshot.base_currency,
      fund_name: snapshot.fund_name,
      risk_policy: { lag_watch_pp: 15, lag_high_pp: 25, revenue_decline_pct: 10 },
    },
    snapshot,
  };
}

function localizeSnapshotZh(snapshot: ReturnType<typeof buildSnapshot>): ReturnType<typeof buildSnapshot> {
  const categoryZh: Record<string, string> = {
    Retail: "零售",
    "Food & Beverage": "餐饮",
    "E-commerce": "电子商务",
    "Personal Services": "个人服务",
    "Healthcare Services": "医疗服务",
    "Logistics & Delivery": "物流配送",
    "Professional Services": "专业服务",
    "Light Manufacturing": "轻工制造",
  };
  snapshot.fund_name = "示例收入分成基金 I";
  snapshot.contracts = snapshot.contracts.map((c) => ({
    ...c,
    category: categoryZh[c.category] || c.category,
  }));
  if (snapshot.insights) {
    snapshot.insights.progress = snapshot.insights.progress.map((row) => ({
      ...row,
      category: categoryZh[row.category] || row.category,
    }));
    snapshot.insights.concentration_by_category = snapshot.insights.concentration_by_category.map((row) => ({
      ...row,
      key: categoryZh[row.key] || row.key,
    }));
    snapshot.insights.watchlist = snapshot.insights.watchlist.map((row) => ({
      ...row,
      category: categoryZh[row.category] || row.category,
    }));
  }
  return snapshot;
}
