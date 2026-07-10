// The dataset behind this app is already a fully deterministic, offline mock
// dataset (see lib/dataset.ts) — there is no live data source to switch away
// from. "Demo mode" here just means: force a friendly starting route/lang for
// screenshots and docs, same query-param convention as other App-in-Skill
// packages in this repo (?demo=1, ?demo=<scene>, &lang=en|zh).

interface DemoQuery {
  demo?: string | boolean;
  lang?: string;
}

export function isDemoQuery(query: DemoQuery = {}): boolean {
  return Boolean(query.demo);
}

export function demoRouteFor(query: DemoQuery = {}): string {
  const scenario = String(query.demo || "overview");
  if (scenario === "segments") return "#/segments";
  if (scenario === "backtest") return "#/backtest";
  if (scenario === "detail") return "#/segments/price_sensitive_browser";
  return "#/overview";
}
