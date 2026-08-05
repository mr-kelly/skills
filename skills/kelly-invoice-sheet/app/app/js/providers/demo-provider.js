import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// Ported verbatim (same ids, same figures) from the retired
// scripts/generate_demo_batch.ts, routed through invoice-model.js's
// assembleBatch() so the demo path exercises the exact same
// normalization/metrics code as the real Busabase provider.
import { assembleBatch, buildConfigSummary, demoInvoices } from "../invoice-model.js?v=0.1.0";

const DEMO_CONFIG_PAYLOAD = {
  default_currency: "USD",
  extraction: {
    preferred_ocr: "agent-provided",
    low_confidence_threshold: 0.82,
  },
  review_policy: {
    auto_approve_min_confidence: null,
    block_missing_fields: ["vendor_name", "invoice_number", "invoice_date", "total"],
  },
  export: {
    directory: "exports/<batch-id>",
    include_line_items: true,
  },
};

export const demoProvider = {
  kind: "demo",

  async getState() {
    const config_summary = buildConfigSummary(DEMO_CONFIG_PAYLOAD);
    const batch = assembleBatch({
      invoices: demoInvoices(),
      lowConfidenceThreshold: config_summary.extraction.low_confidence_threshold,
    });
    return {
      app: "kelly-invoice-sheet",
      demo: true,
      demo_scenario: String(new URLSearchParams(window.location.search).get("demo") || "1"),
      data_provider: "demo",
      onboarding: { completed: true, completed_at: "2026-06-30T09:00:00.000Z", config_version: "demo" },
      lock: null,
      config_summary,
      batch: { ...batch, demo_visuals: demoVisualsForApp("kelly-invoice-sheet") },
      demo_visuals: demoVisualsForApp("kelly-invoice-sheet"),
    };
  },

  async submitDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
