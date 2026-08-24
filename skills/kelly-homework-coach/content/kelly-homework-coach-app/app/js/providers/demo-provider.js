// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo= contract used across Kelly App-in-Skills
// (and this skill's own retired isDemoQuery()/demoStatePayload() contract:
// ?demo=student|mistakes|papers|review selects the initial route in
// app.js, not a different dataset — the underlying data is always the same
// deterministic demoSnapshot()). Ported verbatim (same fixed timestamp, same
// question/mistake/paper/review figures) from the retired app/server/demo.ts,
// now sharing demoSnapshot() with the live Busabase provider's normalized
// shape so both always agree on the snapshot format.
import { buildConfigSummary, demoSnapshot } from "../homework-model.js?v=0.1.0";

function activeLang() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang;
  return navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")) ? "zh" : "en";
}

const DEMO_CONFIG_PAYLOAD = {
  student_profile: {
    display_name: "Demo Student",
    grade: "Grade 4",
    language: "zh-HK",
    timezone: "Asia/Hong_Kong",
  },
  subjects: ["Math", "Chinese", "English"],
  learning_policy: {
    tone: "warm, patient, brief, encouraging",
    answer_policy: "hint_first",
    max_steps_per_explanation: 5,
    parent_review_required_for_exports: true,
    store_raw_photos: false,
  },
  practice_defaults: {
    question_count: 8,
    estimated_minutes: 25,
    difficulty_mix: { easy: 0.35, medium: 0.5, challenge: 0.15 },
  },
  export: { format: "markdown", out_dir: "exports" },
};

export const demoProvider = {
  kind: "demo",

  async getState() {
    const lang = activeLang();
    const snapshot = demoSnapshot(lang);
    return {
      app: "kelly-homework-coach",
      demo: true,
      demo_scenario: String(new URLSearchParams(window.location.search).get("demo") || "student"),
      data_provider: "demo",
      onboarding: { completed: true, completed_at: "2026-07-06T09:00:00.000Z", config_version: "demo" },
      lock: null,
      config_summary: buildConfigSummary(DEMO_CONFIG_PAYLOAD),
      snapshot,
    };
  },

  async submitReview() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
