// Deterministic, explicitly-labeled, offline demo data. Never reads or writes
// Busabase, never claims a real connection, and never persists anything —
// matches the ?demo=1 contract used across Kelly App-in-Skills.
//
// generateFleetData()/summarizeFleet() are the same ported-verbatim functions
// the busabase provider uses; this module only supplies the fixed seed/date
// the retired app/server/demo.ts used, so demo output is bit-identical across
// runs (seed=7, tracesPerAgent=16, DEMO_NOW fixed).
import { generateFleetData, summarizeFleet } from "../fleet-model.js?v=0.1.0";

const DEMO_NOW = new Date("2026-07-10T20:00:00.000Z");

let cachedDemoFleet = null;

function demoFleet() {
  if (!cachedDemoFleet) {
    cachedDemoFleet = generateFleetData({ now: DEMO_NOW, seed: 7, tracesPerAgent: 16 });
  }
  return cachedDemoFleet;
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const fleet = demoFleet();
    return {
      app: "kelly-agent-observability",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: fleet.generated_at, config_version: "demo" },
      lock: null,
      fleet,
      summary: summarizeFleet(fleet),
      handoffs: [],
    };
  },

  async submitHandoff() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
