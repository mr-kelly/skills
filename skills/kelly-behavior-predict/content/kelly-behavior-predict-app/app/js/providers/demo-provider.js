// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
//
// This skill's live dataset already IS a fully deterministic, fully offline
// mock dataset (see the retired app/server/demo.ts's own comment: "there is
// no live data source to demo against"). So "demo mode" here just means:
// regenerate the same fixed mock sample in the browser (generateAllSessions()
// from behavior-model.js, the same function the trusted seed script uses) and
// force a friendly starting route for screenshots/docs, same query-param
// convention as other App-in-Skill packages (?demo=1, ?demo=<scene>,
// &lang=en|zh) — ported from the retired demo.ts's isDemoQuery()/
// demoRouteFor().
import { DEFAULT_DATASET_SEED, buildConfigSummary, buildRun, generateAllSessions } from "../behavior-model.js?v=0.1.0";

function demoRouteFor(scenario = "") {
  if (scenario === "segments") return "#/segments";
  if (scenario === "backtest") return "#/backtest";
  if (scenario === "detail") return "#/segments/price_sensitive_browser";
  return "#/overview";
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "1");
    const sessions = generateAllSessions(DEFAULT_DATASET_SEED);
    const run = buildRun({ sessions, seed: DEFAULT_DATASET_SEED });
    const config_summary = buildConfigSummary([
      { kind: "config", payload: JSON.stringify({ seed: DEFAULT_DATASET_SEED }) },
    ]);
    return {
      demo: true,
      demo_route: demoRouteFor(scenario),
      app: "kelly-behavior-predict",
      data_provider: "demo",
      onboarding: { completed: true, completed_at: run.generated_at_note, config_version: "demo" },
      lock: null,
      config_summary,
      run,
      decisions: {},
    };
  },

  async decideSegment() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
