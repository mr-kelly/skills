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
import { buildSnapshot, computeMetrics } from "../real-estate-model.js?v=0.1.0";

function makeDemoBatch(now) {
  const nowIso = now.toISOString();
  const signals = [
    "A nearby transaction gives agents a timely reason to message owners and buyers",
    "Competitor ads are pushing a specific estate with discount language",
    "Mortgage or policy news changes how cautious buyers should be approached",
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
    "Pick today's hero listing and explain the buyer angle",
    "Draft WhatsApp follow-ups for three dormant buyer segments",
    "Create a short social post anchored on verified market news",
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

  const channels = ["WhatsApp follow-up", "agent朋友圈", "listing pitch"];
  const drafts = channels.map((channel, index) => ({
    draft_id: `draft-${index + 1}`,
    ref: index + 1,
    channel,
    title: `${channel}: today's approved angle`,
    body: `Draft for ${channel}: We noticed a timely update in real estate and property agencies. Here is the practical implication for customers, the careful caveat, and one simple next step. Reply if you want us to tailor this to your situation.`,
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
      coverage:
        "property news, listing portals, transaction reports, competitor ads, mortgage/rate news, and local district events",
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
      coverage: "property transaction, mortgage, new listing, estate agency, 成交, 楼盘",
    },
  ];

  const meta = {
    schema_version: "1",
    batch_id: `kelly-real-estate-intel-demo-${now.getTime()}`,
    generated_at: nowIso,
    source: "kelly-real-estate-intel",
    vertical: "real estate and property agencies",
    buyer: "property agency owners, team leads, and individual agents",
    offer: "daily property intelligence that becomes push-listing suggestions, WhatsApp follow-ups, and social posts",
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
      app: "kelly-real-estate-intel",
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
