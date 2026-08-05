// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim (same fixed timestamp, same period/check figures) from the
// retired app/server/demo.ts, now sharing demoSnapshot() with the live
// Busabase provider's model/checks shape so both always agree on the
// snapshot format.
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
import { demoSnapshot } from "../finance-model.js?v=0.1.0";

function activeLang() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang;
  return navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")) ? "zh" : "en";
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const lang = activeLang();
    const snapshot = demoSnapshot(lang);
    const visuals = demoVisualsForApp("kelly-finance");
    return {
      app: "kelly-finance",
      demo: true,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: "2026-07-06T09:00:00.000Z", config_version: "demo" },
      lock: null,
      config_summary: {
        provider: "demo",
        config_source: "demo",
        company: { name: snapshot.company, base_currency: snapshot.currency },
        secrets_required: false,
      },
      snapshot: { ...snapshot, demo_visuals: visuals },
      demo_visuals: visuals,
    };
  },

  async submitReview() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
