// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim (same run id, same fixed timestamp, same case content) from
// the retired app/server/demo.ts, now sharing buildRawCases()/computeMetrics()
// with the trusted seed script and the live Busabase provider so all three
// always agree on scoring.
import { CASE_TITLES_ZH, CATEGORY_ZH, buildRawCases, computeMetrics } from "../eval-model.js?v=0.1.0";

const NOW = "2026-07-08T09:00:00.000Z";

function localizeCasesZh(cases) {
  return cases.map((item) => ({
    ...item,
    title: CASE_TITLES_ZH[item.id] || item.title,
    category: CATEGORY_ZH[item.category] || item.category,
  }));
}

function activeLangIsZh() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang.startsWith("zh");
  return Boolean(navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")));
}

function buildDemoRun(zh) {
  const cases = zh ? localizeCasesZh(buildRawCases()) : buildRawCases();
  return {
    run_id: "demo-run-2026-07-08",
    generated_at: NOW,
    source: "kelly-agent-eval",
    mode: "app-in-skill",
    baseline_version: "v2.4.0 (baseline)",
    candidate_version: "v2.5.0-rc1 (candidate)",
    metrics: computeMetrics(cases),
    cases,
  };
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const zh = activeLangIsZh();
    const run = buildDemoRun(zh);
    return {
      demo: true,
      app: "kelly-agent-eval",
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-agent-eval/config.json",
        is_example: false,
        team_name: zh ? "智能体质量团队" : "Agent Quality Team",
        baseline_version: run.baseline_version,
        candidate_version: run.candidate_version,
        release_policy: { blocking_regression_blocks_release: true, min_candidate_pass_rate: 80 },
        run_id: run.run_id,
        generated_at: run.generated_at,
      },
      run,
      release_decision: null,
    };
  },

  async decideCase() {
    throw new Error("Demo mode is read-only.");
  },

  async decideRelease() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
