// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim (same fixed timestamp, same seed/decision math) from the
// retired app/server/demo.ts, now sharing buildSeedData()/assembleBatch()
// with the trusted seed script and the live Busabase provider so all three
// always agree on the mock portfolio.
import { ZH_VEHICLE_NAMES, assembleBatch, buildSeedData } from "../tracker-model.js?v=0.1.0";

const NOW = "2026-07-10T09:00:00.000Z";

function localizeZh(vehicles) {
  return vehicles.map((v) => ({ ...v, name: ZH_VEHICLE_NAMES[v.vehicle_id] || v.name }));
}

function demoBatch(zh = false) {
  const { vehicles, items } = buildSeedData({ now: NOW });
  return assembleBatch({
    vehicles: zh ? localizeZh(vehicles) : vehicles,
    items,
    batchId: "disclosure-demo-20260710",
    generatedAt: NOW,
    source: "kelly-disclosure-tracker-demo",
  });
}

function activeLangIsZh() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang.startsWith("zh");
  return Boolean(navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")));
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const zh = activeLangIsZh();
    const batch = demoBatch(zh);
    return {
      demo: true,
      app: "kelly-disclosure-tracker",
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-disclosure-tracker/config.json",
        is_example: false,
        reviewer_name: zh ? "演示审阅人" : "Demo Reviewer",
        data_provider: "demo",
      },
      batch,
    };
  },

  async submitReview() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
