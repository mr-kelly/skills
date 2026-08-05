// Deterministic, explicitly-labeled, offline demo data. Never reads or writes
// Busabase, never claims a real connection, and never persists anything —
// matches the ?demo=1 contract used across Kelly App-in-Skills.
//
// The signal/action/draft/source content below is ported verbatim (same
// copy, same field values, same index-based rotation) from the retired
// app/server/demo.ts's makeDemoBatch() — the same fixture the retired
// scripts/generate_batch.ts wrote to app/.data/current_batch.json for local
// dev. That script has no Busabase equivalent (it never fetched real
// signals — it only ever generated this same demo batch), so its role folds
// entirely into this module.
import { buildSnapshot, computeMetrics } from "../newsroom-model.js?v=0.1.0";

function makeDemoBatch(now) {
  const nowIso = now.toISOString();
  const signals = [
    "Publisher and AI-search licensing moves change which sources get cited by AI assistants",
    "Copilot Studio and Microsoft 365 admin searches suggest enterprise deployment intent",
    "Privacy and AI governance updates make review-first workflows easier to sell",
  ].map((summary, index) => ({
    signal_id: `signal-${index + 1}`,
    ref: index + 1,
    title: summary,
    summary,
    why_it_matters: [
      "This can become a timely reason to contact customers.",
      "The operator can act today without waiting for a full campaign.",
      "The item needs source-backed review before use.",
    ][index % 3],
    buyer_intent: [
      "High: creates a concrete sales or follow-up trigger.",
      "Medium: useful for content and objection handling.",
      "Medium: watch for stronger proof before scaling.",
    ][index % 3],
    confidence: [0.82, 0.74, 0.68][index % 3],
    detected_at: nowIso,
    status: "needs_review",
    risk: index === 2 ? ["claims-review"] : [],
    source: {
      name: ["Official/news source", "Competitor/public page", "Trend/community signal"][index % 3],
      url: `https://example.com/source-${index + 1}`,
    },
    suggested_action_id: `action-${index + 1}`,
  }));

  const actions = [
    "Package one buyer-trigger brief for a target vertical",
    "Draft a one-day sample intelligence report for a prospect",
    "Create a sales message that leads with approved daily actions, not generic AI",
  ].map((summary, index) => ({
    action_id: `action-${index + 1}`,
    ref: index + 1,
    title: summary,
    summary,
    status: "needs_review",
    priority: ["high", "medium", "medium"][index % 3],
    owner: "operator",
    reason: "Linked to today's reviewed signal set.",
    linked_signal_ids: [`signal-${index + 1}`],
    next_step: "Review the evidence, approve the action, then export it into the daily operator brief.",
  }));

  const channels = ["sales opener", "LinkedIn post", "client memo"];
  const drafts = channels.map((channel, index) => ({
    draft_id: `draft-${index + 1}`,
    ref: index + 1,
    channel,
    title: `${channel}: today's approved angle`,
    body: `Draft for ${channel}: We noticed a timely update in AI/news-source intelligence. Here is the practical implication for customers, the careful caveat, and one simple next step. Reply if you want us to tailor this to your situation.`,
    edited_body: "",
    status: "needs_review",
    risk: channel.toLowerCase().includes("client") || channel.toLowerCase().includes("whatsapp") ? ["outbound"] : [],
    linked_action_id: `action-${Math.min(index + 1, actions.length)}`,
  }));

  const sources = [
    {
      source_id: "news",
      label: "News sources",
      status: "configured",
      freshness: "demo",
      coverage: "OpenAI, Microsoft Copilot, Google AI Search, Perplexity, privacy regulators, and local business media",
    },
    {
      source_id: "competitors",
      label: "Competitor/public pages",
      status: "needs_config",
      freshness: "not connected",
      coverage: "Add target URLs in config.local.json",
    },
    {
      source_id: "trends",
      label: "Trend keywords",
      status: "configured",
      freshness: "demo",
      coverage: "AI news, OpenAI news, Copilot Studio, AI search, media monitoring, buyer intent",
    },
  ];

  const meta = {
    schema_version: "1",
    batch_id: `kelly-ai-newsroom-demo-${now.getTime()}`,
    generated_at: nowIso,
    source: "kelly-ai-newsroom",
    vertical: "AI/news-source intelligence",
    buyer:
      "founders, operators, and product sellers who need to convert news and trend signals into daily sales scenes",
    offer: "daily news-source and buyer-intent intelligence that turns trend signals into approved sales actions",
  };

  return buildSnapshot({ signals, actions, drafts, sources, meta });
}

let cachedDemoBatch = null;

function demoBatch() {
  if (!cachedDemoBatch) cachedDemoBatch = makeDemoBatch(new Date());
  return cachedDemoBatch;
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const batch = demoBatch();
    return {
      app: "kelly-ai-newsroom",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: batch.generated_at, config_version: "demo" },
      lock: null,
      batch,
    };
  },

  // Demo mode is read-only, but the review buttons are still interactive so
  // screenshots/docs can show a decided state; the verdict only ever mutates
  // the in-memory demo batch, matching the retired app/server/demo.ts's
  // read-only demo API contract (demo responses never read/write app/.data/
  // or private config).
  async saveDecision({ kind = "", id = "", action = "", comment = "", edited_body = "" } = {}) {
    const batch = demoBatch();
    const list = kind === "signal" ? batch.signals : kind === "action" ? batch.actions : batch.drafts;
    const item = list?.find((entry) => entry.id === id);
    if (!item) return { ok: false, status: 404, error: `Unknown ${kind}: ${id}` };
    const now = new Date().toISOString();
    item.status =
      action === "approve"
        ? "approved"
        : action === "block"
          ? "blocked"
          : action === "request_changes"
            ? "changes_requested"
            : "needs_review";
    item.decision = { action, comment, decided_at: now };
    if (kind === "draft" && action === "revise") {
      item.edited_body = edited_body;
      item.effective_body = edited_body || item.body;
    }
    batch.metrics = computeMetrics(batch);
    return { ok: true, decision: { id, kind, action, comment, decided_at: now } };
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
