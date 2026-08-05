import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
// Deterministic, fully offline demo payload for documentation/screenshots.
// Never reads or writes Busabase, never persists anything -- matches the
// ?demo=1 contract used across Kelly App-in-Skills. The project, personas,
// pipelines, vendors, and QA checklist come straight from
// digital-human-model.js's constants (ported verbatim from the retired
// app/server/demo.ts). Decisions stay empty: the retired app/app.js
// explicitly refused to apply a decision in demo mode ("Demo mode: no local
// files were changed."), so ?demo=1 is a read-only tour, not an interactive
// sandbox, for this skill.
import { QA_CHECKS, buildSnapshot } from "../digital-human-model.js?v=0.1.0";

const NOW = "2026-07-07T09:30:00.000Z";

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("demo") || "";
    const scene = ["overview", "studio", "vendors", "qa"].includes(raw) ? raw : "overview";
    const snapshot = buildSnapshot(QA_CHECKS, { scene, generated_at: NOW });
    return {
      app: "kelly-digital-human",
      demo: true,
      generated_at: NOW,
      snapshot: { ...snapshot, demo_visuals: demoVisualsForApp("kelly-digital-human") },
      demo_visuals: demoVisualsForApp("kelly-digital-human"),
      decisions: {},
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
    };
  },

  async saveDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
